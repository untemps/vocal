import { getUserMediaStream, isMediaDevicesSupported } from '@untemps/user-permissions-utils'
import type { SpeechEngineContext, SpeechEngineFactory, SpeechEngineInstance } from '../src/index'
import { createPermissionWatch } from './permissionWatch'

// Custom speech engine for the demo: real-time transcription through OpenAI's Realtime API
// over WebRTC — the connection method OpenAI supports from the browser (a raw-key WebSocket
// is rejected client-side).
//
//   1. mint a short-lived client secret (ephemeral token): POST /v1/realtime/client_secrets
//      with the API key, configured as a transcription session. Routed through the Vite dev
//      proxy ('/openai-api' → api.openai.com, see demo/vite.config.js) for CORS — the key is
//      used browser-side here for the demo; in production this call belongs on a server.
//   2. WebRTC handshake: RTCPeerConnection + mic track + an 'oai-events' data channel, then
//      POST the SDP offer to /v1/realtime/calls (auth: the ephemeral token) and apply the answer.
//      WebRTC carries the audio natively, so no PCM worklet is needed here.
//   3. transcription events arrive on the data channel:
//      conversation.item.input_audio_transcription.delta / .completed
//
// The API key is captured in the factory closure, mirroring createGladiaEngine. Microphone
// access and permission are handled via @untemps/user-permissions-utils, like the WebSpeechEngine.

const CLIENT_SECRETS_URL = '/openai-api/v1/realtime/client_secrets'
const CALLS_URL = '/openai-api/v1/realtime/calls'

interface OpenAIConfig {
	apiKey: string
	model?: string
}

interface OpenAIEvent {
	type?: string
	delta?: string
	transcript?: string
	error?: { message?: string }
}

export const createOpenAIRealtimeEngine = ({
	apiKey,
	model = 'gpt-4o-mini-transcribe',
}: OpenAIConfig): SpeechEngineFactory => {
	const factory = ({ options, emit }: SpeechEngineContext): SpeechEngineInstance => {
		let pc: RTCPeerConnection | null = null
		let channel: RTCDataChannel | null = null
		let stream: MediaStream | null = null
		let recording = false
		let interim = '' // accumulated delta text for the in-progress utterance

		// Surfaces the `permission` event, opened lazily on the first subscription.
		const permission = createPermissionWatch(emit)

		// OpenAI expects an ISO-639 language code; map 'fr-FR' → 'fr' but tolerate a bare code.
		const language = options.lang.split('-')[0] || options.lang

		const endSession = (): void => {
			const wasRecording = recording
			recording = false
			stream?.getTracks().forEach((track) => track.stop())
			channel?.close()
			pc?.close()
			stream = channel = pc = null
			// Only signal 'end' for a session that actually started (a matching 'start' was emitted).
			if (wasRecording) emit('end', new Event('end'))
		}

		const handleEvent = (raw: string): void => {
			let message: OpenAIEvent
			try {
				message = JSON.parse(raw)
			} catch {
				return
			}
			switch (message.type) {
				case 'conversation.item.input_audio_transcription.delta':
					// Deltas are incremental; accumulate them into the running utterance.
					interim += message.delta ?? ''
					if (options.interimResults && interim) {
						emit('result', new Event('result') as SpeechRecognitionEvent, interim, [interim])
					}
					break
				case 'conversation.item.input_audio_transcription.completed': {
					const text = message.transcript ?? interim
					interim = ''
					// `result` shape mirrors the built-in engine: (event, bestAlternative, alternatives).
					if (text) emit('result', new Event('result') as SpeechRecognitionEvent, text, [text])
					break
				}
				case 'conversation.item.input_audio_transcription.failed':
				case 'error':
					emit(
						'error',
						Object.assign(new Event('error'), {
							error: message.error?.message ?? 'OpenAI Realtime error',
						}) as unknown as SpeechRecognitionErrorEvent
					)
					break
			}
		}

		const mintEphemeralToken = async (signal?: AbortSignal): Promise<string> => {
			const response = await fetch(CLIENT_SECRETS_URL, {
				method: 'POST',
				signal,
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session: {
						type: 'transcription',
						audio: { input: { transcription: { model, language } } },
					},
				}),
			})
			if (!response.ok) {
				throw new Error(`OpenAI token request failed (${response.status} ${response.statusText})`)
			}
			const data = (await response.json()) as { value?: string; client_secret?: { value?: string } }
			const token = data.value ?? data.client_secret?.value
			if (!token) throw new Error('OpenAI token response missing client secret')
			return token
		}

		const negotiate = async (token: string, signal?: AbortSignal): Promise<void> => {
			pc = new RTCPeerConnection()
			pc.addEventListener('connectionstatechange', () => {
				if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
					endSession()
				}
			})
			channel = pc.createDataChannel('oai-events')
			channel.addEventListener('message', (event: MessageEvent) => handleEvent(event.data as string))
			// Configure transcription once the channel is open: model/language + server VAD so the
			// server segments the continuous WebRTC audio and emits transcription events on its own.
			channel.addEventListener('open', () => {
				channel?.send(
					JSON.stringify({
						type: 'session.update',
						session: {
							type: 'transcription',
							audio: {
								input: {
									transcription: { model, language },
									turn_detection: { type: 'server_vad' },
								},
							},
						},
					})
				)
			})
			pc.addTrack(stream!.getTracks()[0], stream!)

			const offer = await pc.createOffer()
			await pc.setLocalDescription(offer)

			const sdpResponse = await fetch(CALLS_URL, {
				method: 'POST',
				signal,
				body: offer.sdp,
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
			})
			if (!sdpResponse.ok) {
				throw new Error(`OpenAI SDP exchange failed (${sdpResponse.status} ${sdpResponse.statusText})`)
			}
			await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() })
		}

		const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
			if (recording) return
			try {
				stream = await getUserMediaStream('microphone', { audio: true }, { signal })
				if (signal?.aborted) {
					endSession()
					return
				}
				const token = await mintEphemeralToken(signal)
				if (signal?.aborted) {
					endSession()
					return
				}
				await negotiate(token, signal)
				recording = true
				emit('start', new Event('start'))
			} catch (error) {
				endSession()
				// Honour the contract: resolve (don't reject) when aborted via the signal.
				if (error instanceof Error && error.name === 'AbortError') return
				throw error
			}
		}

		// Transcription emits results as they arrive, so stop and abort are identical: tear the
		// peer connection down and (if a session was live) signal 'end'.
		const stop = (): void => endSession()
		const abort = (): void => endSession()
		const cleanup = (): void => {
			endSession()
			permission.teardown()
		}

		return {
			get isRecording() {
				return recording
			},
			start,
			stop,
			abort,
			subscribe: permission.subscribe,
			unsubscribe: permission.unsubscribe,
			cleanup,
		}
	}

	// Support is engine-defined: WebRTC transcription needs a microphone and RTCPeerConnection.
	factory.isSupported = (): boolean =>
		isMediaDevicesSupported() && typeof RTCPeerConnection !== 'undefined'

	return factory
}
