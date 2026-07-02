import { getUserMediaStream, isMediaDevicesSupported } from '@untemps/user-permissions-utils'
import {
	eventTypes,
	type SpeechEngineContext,
	type SpeechEngineFactory,
	type SpeechEngineInstance,
	type VocalOptions,
} from './types'
import { createTranscriptAggregator } from './transcriptAggregator'

export interface EngineConnectContext {
	readonly stream: MediaStream
	readonly signal?: AbortSignal
	readonly language: string
	readonly options: Required<VocalOptions>
	emitTranscript(text: string, options: { isFinal: boolean }): void
	emitError(message: string, error?: string): void
	end(options?: { flush?: boolean }): void
}

export interface EngineSession {
	stop(): void
	abort(): void
}

export interface EngineBackend {
	isSupported?(): boolean
	connect(context: EngineConnectContext): Promise<EngineSession>
}

export const createEngine = (backend: EngineBackend): SpeechEngineFactory => {
	const factory = ({ options, emit }: SpeechEngineContext): SpeechEngineInstance => {
		const aggregator = createTranscriptAggregator()
		const language = options.lang.split('-')[0] || options.lang
		let session: EngineSession | null = null
		let recording = false
		let stopping = false
		let starting = false
		let disposed = false
		let cancelStart = false

		const makeResultEvent = (text: string): SpeechRecognitionEvent => {
			const alternative = { transcript: text, confidence: 1 } as SpeechRecognitionAlternative
			const result = [alternative] as unknown as SpeechRecognitionResult & SpeechRecognitionAlternative[]
			Object.defineProperty(result, 'isFinal', { value: true })
			Object.defineProperty(result, 'item', { value: (index: number) => result[index] })
			const results = [result] as unknown as SpeechRecognitionResultList & SpeechRecognitionResult[]
			Object.defineProperty(results, 'item', { value: (index: number) => results[index] })
			return Object.assign(new Event(eventTypes.RESULT), { resultIndex: 0, results }) as SpeechRecognitionEvent
		}

		const emitResult = (text: string): void => {
			emit(eventTypes.RESULT, makeResultEvent(text), text, [text])
		}

		const emitTranscript = (text: string, { isFinal }: { isFinal: boolean }): void => {
			if (!text) return
			if (isFinal && options.continuous) {
				aggregator.add(text)
				return
			}
			if (!isFinal && !options.interimResults) return
			emitResult(text)
		}

		const emitError = (message: string, error = 'network'): void => {
			emit(
				eventTypes.ERROR,
				Object.assign(new Event(eventTypes.ERROR), { error, message }) as unknown as SpeechRecognitionErrorEvent
			)
		}

		const end = ({ flush = false }: { flush?: boolean } = {}): void => {
			const wasRecording = recording
			recording = false
			stopping = false
			session = null
			if (flush) {
				const aggregated = aggregator.flush()
				if (aggregated) emitResult(aggregated)
			} else {
				aggregator.clear()
			}
			if (wasRecording) emit(eventTypes.END, new Event(eventTypes.END))
		}

		const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
			if (starting || (recording && !stopping)) return
			if (recording) {
				session!.abort()
				end({ flush: true })
			}
			starting = true
			aggregator.clear()
			let stream: MediaStream | undefined
			try {
				stream = await getUserMediaStream('microphone', { audio: true }, { signal })
				if (signal?.aborted || disposed || cancelStart) {
					stream.getTracks().forEach((track) => track.stop())
					return
				}
				const next = await backend.connect({
					stream,
					signal,
					language,
					options,
					emitTranscript,
					emitError,
					end,
				})
				if (signal?.aborted || disposed || cancelStart) {
					next.abort()
					return
				}
				session = next
				recording = true
				emit(eventTypes.START, new Event(eventTypes.START))
			} catch (error) {
				stream?.getTracks().forEach((track) => track.stop())
				if (error instanceof Error && error.name === 'AbortError') return
				throw error
			} finally {
				starting = false
				cancelStart = false
			}
		}

		const stop = (): void => {
			if (starting) {
				cancelStart = true
				return
			}
			if (!recording || stopping) return
			stopping = true
			session!.stop()
		}

		const abort = (): void => {
			if (starting) {
				cancelStart = true
				return
			}
			session?.abort()
			end()
		}

		const cleanup = (): void => {
			disposed = true
			recording = false
			stopping = false
			aggregator.clear()
			const current = session
			session = null
			current?.abort()
		}

		return {
			get isRecording() {
				return recording && !stopping
			},
			start,
			stop,
			abort,
			cleanup,
		}
	}

	factory.isSupported = (): boolean => isMediaDevicesSupported() && (backend.isSupported?.() ?? true)

	return factory
}
