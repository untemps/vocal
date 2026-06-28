import { getUserMediaStream, isMediaDevicesSupported } from '@untemps/user-permissions-utils'
import type { SpeechEngineContext, SpeechEngineFactory, SpeechEngineInstance } from '../src/index'
import { createPermissionWatch } from './permissionWatch'
import { createTranscriptAggregator } from './transcriptAggregator'

const CLIENT_SECRETS_URL = '/openai-api/v1/realtime/client_secrets'
const CALLS_URL = '/openai-api/v1/realtime/calls'
const FLUSH_DELAY_MS = 500

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
		let stopping = false
		let interim = ''
		let flushTimer: ReturnType<typeof setTimeout> | null = null

		const permission = createPermissionWatch(emit)
		const aggregator = createTranscriptAggregator()

		const language = options.lang.split('-')[0] || options.lang

		const endSession = (): void => {
			if (flushTimer !== null) {
				clearTimeout(flushTimer)
				flushTimer = null
			}
			stopping = false
			const wasRecording = recording
			recording = false
			stream?.getTracks().forEach((track) => track.stop())
			channel?.close()
			pc?.close()
			stream = channel = pc = null
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
					interim += message.delta ?? ''
					if (options.interimResults && interim) {
						emit('result', new Event('result') as SpeechRecognitionEvent, interim, [interim])
					}
					break
				case 'conversation.item.input_audio_transcription.completed': {
					const text = message.transcript ?? interim
					interim = ''
					if (!text) break
					if (options.continuous) {
						aggregator.add(text)
					} else {
						emit('result', new Event('result') as SpeechRecognitionEvent, text, [text])
					}
					break
				}
				case 'conversation.item.input_audio_transcription.failed':
				case 'error':
					// Drop the partial deltas of the failed utterance so they don't bleed into the next one.
					interim = ''
					emit(
						'error',
						Object.assign(new Event('error'), {
							error: 'network',
							message: message.error?.message ?? 'OpenAI Realtime error',
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
			aggregator.clear()
			interim = ''
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
				if (error instanceof Error && error.name === 'AbortError') return
				throw error
			}
		}

		const flushAndEnd = (): void => {
			flushTimer = null
			const aggregated = aggregator.flush()
			if (aggregated) {
				emit('result', new Event('result') as SpeechRecognitionEvent, aggregated, [aggregated])
			}
			endSession()
		}

		const stop = (): void => {
			if (!recording || flushTimer !== null) return
			stopping = true
			stream?.getTracks().forEach((track) => track.stop())
			flushTimer = setTimeout(flushAndEnd, FLUSH_DELAY_MS)
		}

		const abort = (): void => {
			aggregator.clear()
			endSession()
		}

		const cleanup = (): void => {
			aggregator.clear()
			endSession()
			permission.teardown()
		}

		return {
			get isRecording() {
				return recording && !stopping
			},
			start,
			stop,
			abort,
			subscribe: permission.subscribe,
			unsubscribe: permission.unsubscribe,
			cleanup,
		}
	}

	factory.isSupported = (): boolean => isMediaDevicesSupported() && typeof RTCPeerConnection !== 'undefined'

	return factory
}
