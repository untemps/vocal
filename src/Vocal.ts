import {
	isMediaDevicesSupported,
	isPermissionsSupported,
	watchPermission,
	getUserMediaStream,
} from '@untemps/user-permissions-utils'

// Web Speech API types missing from lib.dom in current TypeScript releases.
// SpeechRecognitionEvent / SpeechRecognitionErrorEvent / SpeechRecognitionResult /
// SpeechRecognitionAlternative ship with lib.dom; SpeechRecognition (the constructor)
// and SpeechGrammarList do not, so we polyfill them here.
declare global {
	interface SpeechRecognition extends EventTarget {
		continuous: boolean
		grammars: SpeechGrammarList | null
		interimResults: boolean
		lang: string
		maxAlternatives: number
		start(): void
		stop(): void
		abort(): void
	}

	var SpeechRecognition: {
		new (): SpeechRecognition
		prototype: SpeechRecognition
	}

	interface SpeechGrammarList {
		length: number
	}

	var SpeechGrammarList: {
		new (): SpeechGrammarList
		prototype: SpeechGrammarList
	}

	interface Window {
		SpeechRecognition?: typeof SpeechRecognition
		webkitSpeechRecognition?: typeof SpeechRecognition
		mozSpeechRecognition?: typeof SpeechRecognition
		msSpeechRecognition?: typeof SpeechRecognition
		SpeechGrammarList?: typeof SpeechGrammarList
		webkitSpeechGrammarList?: typeof SpeechGrammarList
		mozSpeechGrammarList?: typeof SpeechGrammarList
		msSpeechGrammarList?: typeof SpeechGrammarList
	}
}

export interface VocalOptions {
	grammars?: SpeechGrammarList | null
	lang?: string
	continuous?: boolean
	interimResults?: boolean
	maxAlternatives?: number
}

export const eventTypes = {
	AUDIO_END: 'audioend',
	AUDIO_START: 'audiostart',
	END: 'end',
	ERROR: 'error',
	NO_MATCH: 'nomatch',
	RESULT: 'result',
	SOUND_END: 'soundend',
	SOUND_START: 'soundstart',
	SPEECH_END: 'speechend',
	SPEECH_START: 'speechstart',
	START: 'start',
	PERMISSION: 'permission',
} as const

export type EventType = (typeof eventTypes)[keyof typeof eventTypes]

export type ResultEventHandler = (
	event: SpeechRecognitionEvent,
	bestAlternative: string,
	alternatives: string[]
) => void
export type ErrorEventHandler = (event: SpeechRecognitionErrorEvent) => void
export type PermissionEventHandler = (event: Event, state: PermissionState) => void
export type GenericEventHandler = (event: Event) => void

export type EventHandlerFor<T extends EventType> = T extends 'result'
	? ResultEventHandler
	: T extends 'error'
		? ErrorEventHandler
		: T extends 'permission'
			? PermissionEventHandler
			: GenericEventHandler

export interface VocalInstance {
	readonly isRecording: boolean
	start(options?: { signal?: AbortSignal }): Promise<void>
	stop(): void
	abort(): void
	on<T extends EventType>(eventType: T, callback: EventHandlerFor<T>): void
	on(eventType: string, callback: GenericEventHandler): void
	off<T extends EventType>(eventType: T, callback?: EventHandlerFor<T>): void
	off(eventType: string, callback?: GenericEventHandler): void
	cleanup(): void
}

type EventHandler = (...args: unknown[]) => void

const RESTART_THROTTLE_MS = 1000
const FATAL_ERRORS: ReadonlySet<string> = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

const defaultOptions: Required<VocalOptions> = {
	grammars: null,
	lang: 'en-US',
	continuous: false,
	interimResults: false,
	maxAlternatives: 1,
}

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

const includesEventType = (eventType: string): boolean => Object.values(eventTypes).includes(eventType as EventType)

const unknownEventTypeMessage = (eventType: string): string =>
	`Unknown event type "${eventType}". Valid types are: ${Object.values(eventTypes).join(', ')}.`

export const isSupported = (): boolean => !!resolveSpeechRecognition() && isMediaDevicesSupported()

export const createVocal = (options?: VocalOptions): VocalInstance => {
	const SpeechRecognition = resolveSpeechRecognition()
	if (!SpeechRecognition) {
		throw new DOMException('SpeechRecognition not supported', 'NOT_SUPPORTED_ERR')
	}

	let instance: SpeechRecognition | null = new SpeechRecognition()
	const listeners: Record<string, Array<{ callback: EventHandler; handler: EventHandler }>> = {}
	let isRecording = false
	let explicitStop = false
	let lastStartedAt = 0
	let restartTimeoutId: ReturnType<typeof setTimeout> | null = null
	let isRestarting = false
	let finalResults: SpeechRecognitionResult[] = []
	let permissionWatchController: AbortController | null = null

	const resolvedOptions: Required<VocalOptions> = {
		...defaultOptions,
		...(options ?? {}),
	}

	instance.lang = resolvedOptions.lang
	instance.continuous = resolvedOptions.continuous
	instance.interimResults = resolvedOptions.interimResults
	instance.maxAlternatives = resolvedOptions.maxAlternatives

	if (resolvedOptions.grammars) {
		instance.grammars = resolvedOptions.grammars
	} else {
		const SpeechGrammarList = resolveSpeechGrammarList()
		instance.grammars = SpeechGrammarList ? new SpeechGrammarList() : null
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
		if (!listeners[eventTypes.RESULT]?.length) return

		const joinedTranscript = results
			.map((result) => pickBestAlternative(Array.from(result)).transcript)
			.join(' ')
			.trim()
		const event = Object.assign(new Event(eventTypes.RESULT), {
			resultIndex: 0,
			results: makeSyntheticResults(results),
		})

		// Bypass the wrapper registered via on() — the synthetic event carries N real
		// per-utterance results, so the aggregate-level (bestAlternative, alternatives)
		// pair must be computed from the joined transcript instead of from a single
		// result's alternatives. Snapshot the listener list to stay safe if a handler
		// removes itself during dispatch.
		;[...listeners[eventTypes.RESULT]].forEach(({ callback }) => {
			callback(event, joinedTranscript, [joinedTranscript])
		})
	}

	const emitPermission = (state: PermissionState): void => {
		const handlers = listeners[eventTypes.PERMISSION]
		if (!handlers?.length) return
		const event = Object.assign(new Event(eventTypes.PERMISSION), { state })
		;[...handlers].forEach(({ callback }) => callback(event, state))
	}

	const teardownPermissionWatch = (): void => {
		permissionWatchController?.abort()
		permissionWatchController = null
	}

	const onEnd = (event: Event): void => {
		if (shouldAutoRestart()) {
			// Chrome enforces a ~7s silence timeout even with continuous=true; restart transparently.
			const delay = Math.max(0, RESTART_THROTTLE_MS - (Date.now() - lastStartedAt))
			isRestarting = true
			restartTimeoutId = setTimeout(restart, delay)
			event.stopImmediatePropagation()
			return
		}
		// Flush here (not in stop()) so trailing finals emitted between instance.stop() and 'end' are included.
		emitAggregatedResult()
		isRecording = false
	}

	const onStart = (event: Event): void => {
		if (isRestarting) {
			event.stopImmediatePropagation()
			// Defer reset so user-side 'start' wrappers in the same tick still see the flag and swallow.
			queueMicrotask(() => {
				isRestarting = false
			})
		}
	}

	const onError = (event: Event): void => {
		if (FATAL_ERRORS.has((event as SpeechRecognitionErrorEvent).error)) {
			explicitStop = true
			clearRestartTimeout()
			isRecording = false
		}
	}

	const onResult = (event: Event): void => {
		if (!resolvedOptions.continuous) return
		const speechEvent = event as SpeechRecognitionEvent
		const result = speechEvent.results?.[speechEvent.resultIndex]
		if (!result?.isFinal) return
		// Snapshot the result so we own its alternatives and the browser cannot mutate
		// them between now and the aggregated dispatch on stop().
		finalResults.push(makeSyntheticResult(Array.from(result)))
	}

	const internalListeners: Array<[EventType, EventListener]> = [
		[eventTypes.END, onEnd],
		[eventTypes.START, onStart],
		[eventTypes.ERROR, onError],
		[eventTypes.RESULT, onResult],
	]
	internalListeners.forEach(([type, handler]) => instance!.addEventListener(type, handler))

	const observePermission = (signal?: AbortSignal): void => {
		teardownPermissionWatch()
		if (!isPermissionsSupported()) return
		const controller = new AbortController()
		permissionWatchController = controller
		// Tear the watch down on the consumer signal too. AbortSignal.any is the clean fusion, but
		// some engines expose the Permissions API without it (e.g. Safari 16.0–17.3); fall back to
		// forwarding the abort so building the watch signal can never throw out of start().
		let watchSignal: AbortSignal = controller.signal
		if (signal) {
			try {
				watchSignal = AbortSignal.any([signal, controller.signal])
			} catch {
				if (signal.aborted) controller.abort()
				else signal.addEventListener('abort', () => controller.abort(), { once: true })
			}
		}
		watchPermission('microphone', (state) => emitPermission(state), {
			signal: watchSignal,
			emitImmediately: true,
		}).catch(() => {})
	}

	const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
		if (!instance) return
		observePermission(signal)
		try {
			await getUserMediaStream('microphone', { audio: true }, { signal })
			if (signal?.aborted) return
			// Re-check after the await: cleanup() may have nulled instance while we awaited.
			if (!instance) return
			explicitStop = false
			finalResults = []
			instance.start()
			isRecording = true
			lastStartedAt = Date.now()
		} catch (error) {
			// Recognition never started, so don't leave the watch subscribed (the "no leak"
			// contract only promises teardown on stop/abort/cleanup, none of which run here).
			teardownPermissionWatch()
			if (error instanceof Error && error.name === 'AbortError') return
			throw error
		}
	}

	const stop = (): void => {
		if (!instance) return
		explicitStop = true
		clearRestartTimeout()
		teardownPermissionWatch()
		instance.stop()
		isRecording = false
	}

	const abort = (): void => {
		if (!instance) return
		explicitStop = true
		clearRestartTimeout()
		teardownPermissionWatch()
		// Clear before instance.abort() so the resulting 'end' → onEnd → emitAggregatedResult is a no-op.
		finalResults = []
		instance.abort()
		isRecording = false
	}

	const on = (eventType: string, callback: EventHandler): void => {
		if (!includesEventType(eventType)) {
			throw new Error(unknownEventTypeMessage(eventType))
		}
		if (!instance) return

		const handler: EventHandler = (event) => {
			if (isRestarting && (eventType === eventTypes.END || eventType === eventTypes.START)) {
				return
			}
			if (eventType !== eventTypes.RESULT) {
				callback(event)
				return
			}
			const speechEvent = event as SpeechRecognitionEvent
			if (!(speechEvent.results?.length > 0) || speechEvent.resultIndex >= speechEvent.results.length) {
				callback(event)
				return
			}
			const result = speechEvent.results[speechEvent.resultIndex]
			// Suppress finals in continuous mode — they are accumulated and re-emitted
			// in aggregated form by emitAggregatedResult (which bypasses this wrapper).
			if (resolvedOptions.continuous && result.isFinal) {
				return
			}
			const alternatives = Array.from(result)
			callback(
				event,
				pickBestAlternative(alternatives).transcript,
				alternatives.map((a) => a.transcript)
			)
		}
		instance.addEventListener(eventType, handler as EventListener)

		if (!listeners[eventType]) listeners[eventType] = []
		listeners[eventType].push({ callback, handler })
	}

	const off = (eventType: string, callback?: EventHandler): void => {
		if (!includesEventType(eventType)) {
			throw new Error(unknownEventTypeMessage(eventType))
		}
		if (!instance || !listeners[eventType]) return

		if (callback !== undefined) {
			const idx = listeners[eventType].findIndex((e) => e.callback === callback)
			if (idx !== -1) {
				instance.removeEventListener(eventType, listeners[eventType][idx].handler as EventListener)
				listeners[eventType].splice(idx, 1)
				if (listeners[eventType].length === 0) {
					delete listeners[eventType]
				}
			}
		} else {
			listeners[eventType].forEach(({ handler }) =>
				instance!.removeEventListener(eventType, handler as EventListener)
			)
			delete listeners[eventType]
		}
	}

	const cleanup = (): void => {
		stop()
		Object.keys(listeners).forEach((key) => off(key))
		internalListeners.forEach(([type, handler]) => instance?.removeEventListener(type, handler))
		instance = null
	}

	return {
		get isRecording() {
			return isRecording
		},
		start,
		stop,
		abort,
		on: on as VocalInstance['on'],
		off: off as VocalInstance['off'],
		cleanup,
	}
}
