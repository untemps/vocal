import type { SpeechEngineContext, SpeechEngineFactory, SpeechEngineInstance } from '../src/index'

// Custom speech engine for the demo: real-time speech-to-text through Gladia's v2 live API.
//
//   1. POST /v2/live (x-gladia-key header) → { url } WebSocket endpoint
//   2. stream PCM16 / 16 kHz / mono over the socket (see pcm-worklet.js)
//   3. receive { type: 'transcript', data: { is_final, utterance: { text } } } messages
//   4. send { type: 'stop_recording' } to finish; the server then closes with code 1000
//
// The init POST goes through the Vite dev proxy ('/gladia-api' → api.gladia.io, see
// demo/vite.config.js) to dodge CORS. The API key is captured in the factory closure,
// so it never travels through createVocal's option bag — this is the idiomatic way to
// hand a custom engine its own configuration while staying compatible with the contract.

const GLADIA_INIT_URL = '/gladia-api/v2/live'
const SAMPLE_RATE = 16000

interface GladiaConfig {
	apiKey: string
}

interface GladiaMessage {
	type?: string
	data?: { is_final?: boolean; utterance?: { text?: string } }
}

const makePermissionEvent = (state: PermissionState): Event & { state: PermissionState } =>
	Object.assign(new Event('permission'), { state })

export const createGladiaEngine = ({ apiKey }: GladiaConfig): SpeechEngineFactory => {
	const factory = ({ options, emit }: SpeechEngineContext): SpeechEngineInstance => {
		let ws: WebSocket | null = null
		let audioContext: AudioContext | null = null
		let workletNode: AudioWorkletNode | null = null
		let source: MediaStreamAudioSourceNode | null = null
		let stream: MediaStream | null = null
		let recording = false

		// Gladia expects an ISO-639 language code; map 'fr-FR' → 'fr' but tolerate a bare code.
		const language = options.lang.split('-')[0] || options.lang

		const releaseAudio = (): void => {
			workletNode?.disconnect()
			source?.disconnect()
			stream?.getTracks().forEach((track) => track.stop())
			audioContext?.close()
			workletNode = source = stream = audioContext = null
		}

		const initSession = async (signal?: AbortSignal): Promise<string> => {
			const response = await fetch(GLADIA_INIT_URL, {
				method: 'POST',
				signal,
				headers: { 'x-gladia-key': apiKey, 'content-type': 'application/json' },
				body: JSON.stringify({
					encoding: 'wav/pcm',
					sample_rate: SAMPLE_RATE,
					bit_depth: 16,
					channels: 1,
					language_config: { languages: [language] },
					messages_config: { receive_partial_transcripts: options.interimResults },
				}),
			})
			if (!response.ok) {
				throw new Error(`Gladia init failed (${response.status} ${response.statusText})`)
			}
			const { url } = (await response.json()) as { url: string }
			return url
		}

		const startAudio = async (socket: WebSocket): Promise<void> => {
			audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
			// Served verbatim from demo/public; an AudioWorklet module must be fetched as a
			// standalone script, never bundled, transformed or inlined.
			await audioContext.audioWorklet.addModule('/pcm-worklet.js')
			source = audioContext.createMediaStreamSource(stream!)
			workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
			workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
				if (socket.readyState === WebSocket.OPEN) socket.send(event.data)
			}
			source.connect(workletNode)
			// Pull the worklet by wiring it to the destination; it writes no output, so this is silent.
			workletNode.connect(audioContext.destination)
		}

		const handleMessage = (event: MessageEvent): void => {
			let message: GladiaMessage
			try {
				message = JSON.parse(event.data as string)
			} catch {
				return
			}
			if (message.type !== 'transcript') return
			const isFinal = message.data?.is_final ?? false
			// Honour interimResults: drop partials unless the consumer asked for them.
			if (!isFinal && !options.interimResults) return
			const text = message.data?.utterance?.text ?? ''
			if (!text) return
			// `result` shape mirrors the built-in engine: (event, bestAlternative, alternatives).
			// Gladia returns a single hypothesis, so the alternatives list holds just that text.
			emit('result', new Event('result') as SpeechRecognitionEvent, text, [text])
		}

		const stopCapture = (): void => {
			workletNode?.disconnect()
			source?.disconnect()
			stream?.getTracks().forEach((track) => track.stop())
		}

		const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
			if (recording) return
			try {
				stream = await navigator.mediaDevices.getUserMedia({ audio: true })
				emit('permission', makePermissionEvent('granted'), 'granted')
				if (signal?.aborted) {
					releaseAudio()
					return
				}
				const url = await initSession(signal)
				await new Promise<void>((resolve, reject) => {
					const socket = new WebSocket(url)
					ws = socket
					socket.onopen = () => {
						startAudio(socket).then(
							() => {
								recording = true
								emit('start', new Event('start'))
								resolve()
							},
							(error) => reject(error)
						)
					}
					socket.onmessage = handleMessage
					socket.onerror = () => reject(new Error('Gladia WebSocket error'))
					socket.onclose = () => {
						recording = false
						releaseAudio()
						emit('end', new Event('end'))
					}
				})
			} catch (error) {
				releaseAudio()
				// Honour the contract: resolve (don't reject) when aborted via the signal.
				if (error instanceof Error && error.name === 'AbortError') return
				if (error instanceof DOMException && error.name === 'NotAllowedError') {
					emit('permission', makePermissionEvent('denied'), 'denied')
				}
				throw error
			}
		}

		const stop = (): void => {
			if (!recording) return
			recording = false
			// Stop pushing audio but keep the socket open so trailing finals and the 1000 close
			// (→ onclose → emit('end')) still arrive.
			if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop_recording' }))
			stopCapture()
		}

		const abort = (): void => {
			recording = false
			// Drop the socket immediately; onclose releases the audio graph and emits 'end'.
			ws?.close()
			releaseAudio()
		}

		const cleanup = (): void => {
			abort()
			ws = null
		}

		return {
			get isRecording() {
				return recording
			},
			start,
			stop,
			abort,
			// No sticky state to replay and no lazily-wired resource to release per type.
			subscribe() {},
			unsubscribe() {},
			cleanup,
		}
	}

	// Support is engine-defined: Gladia needs a microphone and a WebSocket, not SpeechRecognition.
	factory.isSupported = (): boolean => !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== 'undefined'

	return factory
}
