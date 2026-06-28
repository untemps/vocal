import { getUserMediaStream, isMediaDevicesSupported } from '@untemps/user-permissions-utils'
import type { SpeechEngineContext, SpeechEngineFactory, SpeechEngineInstance } from '../src/index'
import { createPermissionWatch } from './permissionWatch'
import { createTranscriptAggregator } from './transcriptAggregator'

const GLADIA_INIT_URL = '/gladia-api/v2/live'
const SAMPLE_RATE = 16000

interface GladiaConfig {
	apiKey: string
}

interface GladiaMessage {
	type?: string
	data?: { is_final?: boolean; utterance?: { text?: string } }
}

export const createGladiaEngine = ({ apiKey }: GladiaConfig): SpeechEngineFactory => {
	const factory = ({ options, emit }: SpeechEngineContext): SpeechEngineInstance => {
		let ws: WebSocket | null = null
		let audioContext: AudioContext | null = null
		let workletNode: AudioWorkletNode | null = null
		let source: MediaStreamAudioSourceNode | null = null
		let stream: MediaStream | null = null
		let recording = false

		const permission = createPermissionWatch(emit)
		const aggregator = createTranscriptAggregator()

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
			await audioContext.audioWorklet.addModule('/pcm-worklet.js')
			source = audioContext.createMediaStreamSource(stream!)
			workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
			workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
				if (socket.readyState === WebSocket.OPEN) socket.send(event.data)
			}
			source.connect(workletNode)
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
			const text = message.data?.utterance?.text ?? ''
			if (!text) return
			if (isFinal && options.continuous) {
				aggregator.add(text)
				return
			}
			if (!isFinal && !options.interimResults) return
			emit('result', new Event('result') as SpeechRecognitionEvent, text, [text])
		}

		const stopCapture = (): void => {
			workletNode?.disconnect()
			source?.disconnect()
			stream?.getTracks().forEach((track) => track.stop())
		}

		const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
			if (recording) return
			aggregator.clear()
			try {
				stream = await getUserMediaStream('microphone', { audio: true }, { signal })
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
						const aggregated = aggregator.flush()
						if (aggregated) {
							emit('result', new Event('result') as SpeechRecognitionEvent, aggregated, [aggregated])
						}
						emit('end', new Event('end'))
					}
				})
			} catch (error) {
				releaseAudio()
				if (error instanceof Error && error.name === 'AbortError') return
				throw error
			}
		}

		const stop = (): void => {
			if (!recording) return
			recording = false
			if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop_recording' }))
			stopCapture()
		}

		const abort = (): void => {
			recording = false
			aggregator.clear()
			ws?.close()
			releaseAudio()
		}

		const cleanup = (): void => {
			abort()
			permission.teardown()
			ws = null
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

	factory.isSupported = (): boolean => isMediaDevicesSupported() && typeof WebSocket !== 'undefined'

	return factory
}
