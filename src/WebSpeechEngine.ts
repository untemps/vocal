import { isMediaDevicesSupported, getUserMediaStream } from '@untemps/user-permissions-utils'
import {
	eventTypes,
	type EventType,
	type SpeechEngineContext,
	type SpeechEngineFactory,
	type SpeechEngineInstance,
} from './types'

const RESTART_THROTTLE_MS = 1000
const FATAL_ERRORS: ReadonlySet<string> = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

const PASSTHROUGH_EVENTS: readonly EventType[] = [
	eventTypes.AUDIO_START,
	eventTypes.AUDIO_END,
	eventTypes.SOUND_START,
	eventTypes.SOUND_END,
	eventTypes.SPEECH_START,
	eventTypes.SPEECH_END,
	eventTypes.NO_MATCH,
]

const resolveSpeechRecognition = (): typeof SpeechRecognition | undefined => {
	if (typeof window === 'undefined') return undefined
	return (
		window.SpeechRecognition ??
		window.webkitSpeechRecognition ??
		window.mozSpeechRecognition ??
		window.msSpeechRecognition
	)
}

const resolveSpeechGrammarList = (): typeof SpeechGrammarList | undefined =>
	window.SpeechGrammarList ??
	window.webkitSpeechGrammarList ??
	window.mozSpeechGrammarList ??
	window.msSpeechGrammarList

const pickBestAlternative = <T extends { confidence?: number }>(alternatives: T[]): T =>
	alternatives.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a))

const makeSyntheticResult = (alternatives: SpeechRecognitionAlternative[]): SpeechRecognitionResult => {
	const result = alternatives.slice() as unknown as SpeechRecognitionResult & SpeechRecognitionAlternative[]
	Object.defineProperty(result, 'isFinal', { value: true })
	Object.defineProperty(result, 'item', { value: (index: number) => result[index] })
	return result
}

const makeSyntheticResults = (results: SpeechRecognitionResult[]): SpeechRecognitionResultList => {
	const list = results.slice() as unknown as SpeechRecognitionResultList & SpeechRecognitionResult[]
	Object.defineProperty(list, 'item', { value: (index: number) => list[index] })
	return list
}

export const WebSpeechEngine: SpeechEngineFactory = (context: SpeechEngineContext): SpeechEngineInstance => {
	const { options, emit } = context
	const emitRaw = emit as (type: EventType, ...payload: unknown[]) => void

	const SpeechRecognitionCtor = resolveSpeechRecognition()
	if (!SpeechRecognitionCtor) {
		throw new DOMException('SpeechRecognition not supported', 'NOT_SUPPORTED_ERR')
	}

	let instance: SpeechRecognition | null = new SpeechRecognitionCtor()
	let isRecording = false
	let explicitStop = false
	let lastStartedAt = 0
	let restartTimeoutId: ReturnType<typeof setTimeout> | null = null
	let isRestarting = false
	let finalResults: SpeechRecognitionResult[] = []

	instance.lang = options.lang
	instance.continuous = options.continuous
	instance.interimResults = options.interimResults
	instance.maxAlternatives = options.maxAlternatives

	if (options.grammars) {
		instance.grammars = options.grammars
	} else {
		const SpeechGrammarListCtor = resolveSpeechGrammarList()
		instance.grammars = SpeechGrammarListCtor ? new SpeechGrammarListCtor() : null
	}

	const clearRestartTimeout = (): void => {
		if (restartTimeoutId !== null) {
			clearTimeout(restartTimeoutId)
			restartTimeoutId = null
		}
		isRestarting = false
	}

	const shouldAutoRestart = (): boolean => !!instance && !explicitStop && instance.continuous

	const restart = (): void => {
		restartTimeoutId = null
		try {
			instance!.start()
			lastStartedAt = Date.now()
		} catch {
			explicitStop = true
			isRestarting = false
			isRecording = false
			emitAggregatedResult()
			emit(eventTypes.END, new Event(eventTypes.END))
		}
	}

	const emitAggregatedResult = (): void => {
		const results = finalResults
		finalResults = []
		if (results.length === 0) return

		const joinedTranscript = results
			.map((result) => pickBestAlternative(Array.from(result)).transcript)
			.join(' ')
			.trim()
		if (!joinedTranscript) return
		const event = Object.assign(new Event(eventTypes.RESULT), {
			resultIndex: 0,
			results: makeSyntheticResults(results),
		}) as SpeechRecognitionEvent
		emit(eventTypes.RESULT, event, joinedTranscript, [joinedTranscript])
	}

	const handleResult = (event: Event): void => {
		const speechEvent = event as SpeechRecognitionEvent
		const current = speechEvent.results?.[speechEvent.resultIndex]
		if (options.continuous && current?.isFinal) {
			finalResults.push(makeSyntheticResult(Array.from(current)))
			return
		}
		if (!current) {
			emit(eventTypes.RESULT, speechEvent, '', [])
			return
		}
		const alternatives = Array.from(current)
		emit(
			eventTypes.RESULT,
			speechEvent,
			pickBestAlternative(alternatives).transcript,
			alternatives.map((a) => a.transcript)
		)
	}

	const handleEnd = (event: Event): void => {
		if (shouldAutoRestart()) {
			const delay = Math.max(0, RESTART_THROTTLE_MS - (Date.now() - lastStartedAt))
			isRestarting = true
			restartTimeoutId = setTimeout(restart, delay)
			return
		}
		emitAggregatedResult()
		isRecording = false
		emit(eventTypes.END, event)
	}

	const handleStart = (event: Event): void => {
		if (isRestarting) {
			isRestarting = false
			return
		}
		if (explicitStop) return
		emit(eventTypes.START, event)
	}

	const handleError = (event: Event): void => {
		if (FATAL_ERRORS.has((event as SpeechRecognitionErrorEvent).error)) {
			explicitStop = true
			clearRestartTimeout()
			isRecording = false
		}
		emit(eventTypes.ERROR, event as SpeechRecognitionErrorEvent)
	}

	const nativeListeners: Array<[EventType, EventListener]> = [
		[eventTypes.END, handleEnd as EventListener],
		[eventTypes.START, handleStart as EventListener],
		[eventTypes.ERROR, handleError as EventListener],
		[eventTypes.RESULT, handleResult as EventListener],
		...PASSTHROUGH_EVENTS.map(
			(type) => [type, ((event: Event) => emitRaw(type, event)) as EventListener] as [EventType, EventListener]
		),
	]
	nativeListeners.forEach(([type, handler]) => instance!.addEventListener(type, handler))

	const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
		explicitStop = false
		try {
			const stream = await getUserMediaStream('microphone', { audio: true }, { signal })
			stream.getTracks().forEach((track) => track.stop())
			if (!instance) return
			if (signal?.aborted || explicitStop) return
			finalResults = []
			instance.start()
			isRecording = true
			lastStartedAt = Date.now()
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return
			throw error
		}
	}

	const stop = (): void => {
		if (!instance) return
		explicitStop = true
		const restartPending = restartTimeoutId !== null
		clearRestartTimeout()
		if (restartPending) {
			emitAggregatedResult()
			isRecording = false
			emit(eventTypes.END, new Event(eventTypes.END))
			return
		}
		instance.stop()
		isRecording = false
	}

	const abort = (): void => {
		if (!instance) return
		explicitStop = true
		const restartPending = restartTimeoutId !== null
		clearRestartTimeout()
		finalResults = []
		if (restartPending) {
			isRecording = false
			emit(eventTypes.END, new Event(eventTypes.END))
			return
		}
		instance.abort()
		isRecording = false
	}

	const cleanup = (): void => {
		if (!instance) return
		stop()
		nativeListeners.forEach(([type, handler]) => instance?.removeEventListener(type, handler))
		instance = null
	}

	return {
		get isRecording() {
			return isRecording
		},
		start,
		stop,
		abort,
		cleanup,
	}
}

WebSpeechEngine.isSupported = (): boolean => !!resolveSpeechRecognition() && isMediaDevicesSupported()
