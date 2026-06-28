import {
	isMediaDevicesSupported,
	isPermissionsSupported,
	watchPermission,
	getUserMediaStream,
} from '@untemps/user-permissions-utils'
import {
	eventTypes,
	type EventType,
	type SpeechEngineContext,
	type SpeechEngineFactory,
	type SpeechEngineInstance,
} from './types'

type EventHandler = (...args: unknown[]) => void

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

const makePermissionEvent = (state: PermissionState): Event & { state: PermissionState } =>
	Object.assign(new Event(eventTypes.PERMISSION), { state })

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
	let permissionWatchController: AbortController | null = null
	let lastPermissionState: PermissionState | null = null

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
			isRestarting = false
			isRecording = false
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
		const event = Object.assign(new Event(eventTypes.RESULT), {
			resultIndex: 0,
			results: makeSyntheticResults(results),
		}) as SpeechRecognitionEvent
		emit(eventTypes.RESULT, event, joinedTranscript, [joinedTranscript])
	}

	const handleResult = (event: Event): void => {
		const speechEvent = event as SpeechRecognitionEvent
		const results = speechEvent.results
		const hasCurrent = results?.length > 0 && speechEvent.resultIndex < results.length
		const current = hasCurrent ? results[speechEvent.resultIndex] : undefined
		if (options.continuous && current?.isFinal) {
			finalResults.push(makeSyntheticResult(Array.from(current)))
			return
		}
		if (!current) {
			emitRaw(eventTypes.RESULT, speechEvent)
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

	const ensurePermissionWatch = (): void => {
		if (!isPermissionsSupported()) return
		const controller = new AbortController()
		permissionWatchController = controller
		watchPermission(
			'microphone',
			(state) => {
				lastPermissionState = state
				emit(eventTypes.PERMISSION, makePermissionEvent(state), state)
			},
			{ signal: controller.signal, emitImmediately: true }
		).catch(() => {})
	}

	const teardownPermissionWatch = (): void => {
		permissionWatchController?.abort()
		permissionWatchController = null
		lastPermissionState = null
	}

	const subscribe = (type: EventType, callback: EventHandler): void => {
		if (type !== eventTypes.PERMISSION) return
		if (permissionWatchController) {
			if (lastPermissionState !== null) callback(makePermissionEvent(lastPermissionState), lastPermissionState)
		} else {
			ensurePermissionWatch()
		}
	}

	const unsubscribe = (type: EventType): void => {
		if (type !== eventTypes.PERMISSION) return
		teardownPermissionWatch()
	}

	const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
		try {
			const stream = await getUserMediaStream('microphone', { audio: true }, { signal })
			stream.getTracks().forEach((track) => track.stop())
			if (signal?.aborted) return
			// Re-check after the await: cleanup() may have nulled instance while we awaited.
			if (!instance) return
			explicitStop = false
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
		explicitStop = true
		clearRestartTimeout()
		instance!.stop()
		isRecording = false
	}

	const abort = (): void => {
		explicitStop = true
		clearRestartTimeout()
		finalResults = []
		instance!.abort()
		isRecording = false
	}

	const cleanup = (): void => {
		stop()
		teardownPermissionWatch()
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
		subscribe: subscribe as SpeechEngineInstance['subscribe'],
		unsubscribe,
		cleanup,
	}
}

WebSpeechEngine.isSupported = (): boolean => !!resolveSpeechRecognition() && isMediaDevicesSupported()
