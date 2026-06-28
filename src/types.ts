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

export interface SpeechEngineContext {
	readonly options: Required<VocalOptions>
	emit<T extends EventType>(type: T, ...payload: Parameters<EventHandlerFor<T>>): void
}

export interface SpeechEngineInstance {
	readonly isRecording: boolean
	start(options?: { signal?: AbortSignal }): Promise<void>
	stop(): void
	abort(): void
	subscribe<T extends EventType>(type: T, callback: EventHandlerFor<T>): void
	unsubscribe(type: EventType): void
	cleanup(): void
}

export interface SpeechEngineFactory {
	(context: SpeechEngineContext): SpeechEngineInstance
	isSupported(): boolean
}

export interface CreateVocalOptions extends VocalOptions {
	engine?: SpeechEngineFactory
}
