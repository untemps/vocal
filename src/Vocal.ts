import {
	isNavigatorPermissionsSupported,
	isNavigatorMediaDevicesSupported,
	getUserMediaStream,
} from '@untemps/user-permissions-utils'

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
} as const

export type EventType = (typeof eventTypes)[keyof typeof eventTypes]

export type ResultEventHandler = (
	event: SpeechRecognitionEvent,
	bestAlternative: string,
	alternatives: string[]
) => void
export type ErrorEventHandler = (event: SpeechRecognitionErrorEvent) => void
export type GenericEventHandler = (event: Event) => void

export type EventHandlerFor<T extends EventType> = T extends 'result'
	? ResultEventHandler
	: T extends 'error'
		? ErrorEventHandler
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

const includesEventType = (eventType: string): boolean => Object.values(eventTypes).includes(eventType as EventType)

const unknownEventTypeMessage = (eventType: string): string =>
	`Unknown event type "${eventType}". Valid types are: ${Object.values(eventTypes).join(', ')}.`

export const isSupported = (): boolean =>
	!!resolveSpeechRecognition() && !!isNavigatorPermissionsSupported() && !!isNavigatorMediaDevicesSupported()

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
	let finalTranscripts: string[] = []

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
		const transcripts = finalTranscripts
		finalTranscripts = []
		if (transcripts.length === 0) return
		if (!listeners[eventTypes.RESULT]?.length) return

		const aggregatedTranscripts = transcripts.join(' ').trim()
		const result = Object.assign([{ transcript: aggregatedTranscripts, confidence: 1 }], { isFinal: true })
		const event = Object.assign(new Event(eventTypes.RESULT), {
			resultIndex: 0,
			results: [result],
		})

		// Snapshot listeners to stay safe if a handler removes itself during dispatch.
		;[...listeners[eventTypes.RESULT]].forEach(({ handler }) => handler(event))
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
		const speechEvent = event as SpeechRecognitionEvent
		const result = speechEvent.results?.[speechEvent.resultIndex]
		if (!result?.isFinal) return
		finalTranscripts.push(pickBestAlternative(Array.from(result)).transcript)
	}

	const internalListeners: Array<[EventType, EventListener]> = [
		[eventTypes.END, onEnd],
		[eventTypes.START, onStart],
		[eventTypes.ERROR, onError],
		[eventTypes.RESULT, onResult],
	]
	internalListeners.forEach(([type, handler]) => instance!.addEventListener(type, handler))

	const start = async ({ signal }: { signal?: AbortSignal } = {}): Promise<void> => {
		if (!instance) return
		try {
			const stream = (await getUserMediaStream('microphone', { audio: true }, { signal })) as MediaStream | null
			if (signal?.aborted) return
			if (!stream) {
				throw new Error('Unable to retrieve the stream from media device')
			}
			explicitStop = false
			finalTranscripts = []
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
		emitAggregatedResult()
		instance.stop()
		isRecording = false
	}

	const abort = (): void => {
		if (!instance) return
		explicitStop = true
		clearRestartTimeout()
		instance.abort()
		isRecording = false
		finalTranscripts = []
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
			const alternatives = Array.from(speechEvent.results[speechEvent.resultIndex])
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
