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

// Native SpeechRecognition events forwarded verbatim (the engine reshapes only `result`,
// and `start`/`end`/`error` carry extra lifecycle logic — see below).
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

// Wrap a plain alternatives array so it satisfies SpeechRecognitionResult (isFinal + item()),
// matching the lib.dom contract for consumers that call `event.results.item(i).item(j)`.
// isFinal and item are non-enumerable to mirror how lib.dom exposes them and to keep
// JSON.stringify output identical to the underlying alternatives array.
const makeSyntheticResult = (alternatives: SpeechRecognitionAlternative[]): SpeechRecognitionResult => {
	const result = alternatives.slice() as unknown as SpeechRecognitionResult & SpeechRecognitionAlternative[]
	Object.defineProperty(result, 'isFinal', { value: true })
	Object.defineProperty(result, 'item', { value: (index: number) => result[index] })
	return result
}

// Wrap a plain results array so it satisfies SpeechRecognitionResultList (length + item()).
const makeSyntheticResults = (results: SpeechRecognitionResult[]): SpeechRecognitionResultList => {
	const list = results.slice() as unknown as SpeechRecognitionResultList & SpeechRecognitionResult[]
	Object.defineProperty(list, 'item', { value: (index: number) => list[index] })
	return list
}

const makePermissionEvent = (state: PermissionState): Event & { state: PermissionState } =>
	Object.assign(new Event(eventTypes.PERMISSION), { state })

export const WebSpeechEngine: SpeechEngineFactory = (context: SpeechEngineContext): SpeechEngineInstance => {
	const { options, emit } = context
	// Loosely-typed escape hatch for the degenerate `result` path (no extractable transcript)
	// and for passthrough events whose type is only known at runtime.
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
		// Synthetic event shaped to match SpeechRecognitionEvent — N real per-utterance results,
		// each preserving the alternatives/confidences the browser reported.
		const event = Object.assign(new Event(eventTypes.RESULT), {
			resultIndex: 0,
			results: makeSyntheticResults(results),
		}) as SpeechRecognitionEvent
		// The aggregate-level (bestAlternative, alternatives) pair is computed from the joined
		// transcript rather than from a single result's alternatives.
		emit(eventTypes.RESULT, event, joinedTranscript, [joinedTranscript])
	}

	const handleResult = (event: Event): void => {
		const speechEvent = event as SpeechRecognitionEvent
		const results = speechEvent.results
		const hasCurrent = results?.length > 0 && speechEvent.resultIndex < results.length
		const current = hasCurrent ? results[speechEvent.resultIndex] : undefined
		// In continuous mode finals are accumulated and re-emitted in aggregated form on stop().
		if (options.continuous && current?.isFinal) {
			// Snapshot the result so we own its alternatives and the browser cannot mutate
			// them between now and the aggregated dispatch on stop().
			finalResults.push(makeSyntheticResult(Array.from(current)))
			return
		}
		if (!current) {
			// Malformed event (out-of-bounds index / empty results): forward the raw event only.
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
			// Chrome enforces a ~7s silence timeout even with continuous=true; restart transparently
			// and swallow this end so user listeners never see the intermediate cycle.
			const delay = Math.max(0, RESTART_THROTTLE_MS - (Date.now() - lastStartedAt))
			isRestarting = true
			restartTimeoutId = setTimeout(restart, delay)
			return
		}
		// Flush here (not in stop()) so trailing finals emitted between instance.stop() and 'end' are included.
		emitAggregatedResult()
		isRecording = false
		emit(eventTypes.END, event)
	}

	const handleStart = (event: Event): void => {
		// Swallow the start that the transparent restart triggers; user listeners only see real starts.
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

	// ── Permission watch (best-effort, subscription-driven) ──────────────────

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
			// Watch already running → replay the cached state to the new subscriber only.
			if (lastPermissionState !== null) callback(makePermissionEvent(lastPermissionState), lastPermissionState)
		} else {
			// First subscriber → open the watch; emitImmediately seeds every listener with the state.
			ensurePermissionWatch()
		}
	}

	const unsubscribe = (type: EventType): void => {
		if (type !== eventTypes.PERMISSION) return
		teardownPermissionWatch()
	}

	const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
		if (!instance) return
		try {
			const stream = await getUserMediaStream('microphone', { audio: true }, { signal })
			// The stream is acquired only to drive the permission prompt; SpeechRecognition
			// captures audio itself, so release these tracks immediately to free the microphone.
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
		if (!instance) return
		explicitStop = true
		clearRestartTimeout()
		instance.stop()
		isRecording = false
	}

	const abort = (): void => {
		if (!instance) return
		explicitStop = true
		clearRestartTimeout()
		// Clear before instance.abort() so the resulting 'end' → handleEnd → emitAggregatedResult is a no-op.
		finalResults = []
		instance.abort()
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
