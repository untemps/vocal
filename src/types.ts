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
export type PermissionEventHandler = (event: Event & { state: PermissionState }, state: PermissionState) => void
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

// ── Pluggable speech engine contract ─────────────────────────────────────────
//
// `createVocal` owns the engine-agnostic surface (user listener registry, event
// fan-out, the `isRecording` getter and lifecycle delegation). A `SpeechEngine`
// owns everything backend-specific and pushes already-shaped events back to the
// core through `SpeechEngineContext.emit`. The default engine is `SpeechEngine`
// (the Web Speech implementation); consumers can supply their own factory to
// target on-device or cloud backends.

export interface SpeechEngineContext {
	// Resolved options (defaults already applied) the engine should honour.
	readonly options: Required<VocalOptions>
	// Push an event to every user listener registered for `type`. The payload must
	// already match the public handler shape — e.g. `(event, bestAlternative, alternatives)`
	// for `result`, `(event, state)` for `permission`, `(event)` for everything else.
	emit<T extends EventType>(type: T, ...payload: Parameters<EventHandlerFor<T>>): void
}

export interface SpeechEngineInstance {
	readonly isRecording: boolean
	start(options?: { signal?: AbortSignal }): Promise<void>
	stop(): void
	abort(): void
	// Notified by the core when a user listener is added for `type` (the new callback
	// is passed so the engine can replay sticky state, e.g. the cached permission). Most
	// engines only react to specific types and ignore the rest.
	subscribe<T extends EventType>(type: T, callback: EventHandlerFor<T>): void
	// Notified by the core when `type` loses its last user listener, so the engine can
	// release any resource it lazily wired up on the first subscription.
	unsubscribe(type: EventType): void
	cleanup(): void
}

export interface SpeechEngineFactory {
	(context: SpeechEngineContext): SpeechEngineInstance
	// Probe support without instantiating the engine (which may touch unavailable globals).
	isSupported(): boolean
}

export interface CreateVocalOptions extends VocalOptions {
	engine?: SpeechEngineFactory
}
