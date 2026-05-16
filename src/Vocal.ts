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

export type EventType = (typeof Vocal.eventTypes)[keyof typeof Vocal.eventTypes]

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

type EventHandler = (...args: unknown[]) => void

class Vocal {
	static defaultOptions: Required<VocalOptions> = {
		grammars: null,
		lang: 'en-US',
		continuous: false,
		interimResults: false,
		maxAlternatives: 1,
	}

	static eventTypes = {
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

	static get isSupported(): boolean {
		return (
			!!Vocal._resolveSpeechRecognition() &&
			!!isNavigatorPermissionsSupported() &&
			!!isNavigatorMediaDevicesSupported()
		)
	}

	static set isSupported(_: boolean) {
		throw new Error('You cannot set isSupported directly.')
	}

	private _instance: SpeechRecognition | null = null
	private _listeners: Record<string, Array<{ callback: EventHandler; handler: EventHandler }>> | null = null
	private _isRecording: boolean = false
	private _onEnd: () => void = () => {
		this._isRecording = false
	}

	constructor(options?: VocalOptions) {
		const SpeechRecognition = Vocal._resolveSpeechRecognition()
		if (!SpeechRecognition) {
			throw new DOMException('SpeechRecognition not supported', 'NOT_SUPPORTED_ERR')
		}

		this._instance = new SpeechRecognition()
		this._listeners = {}

		const { grammars, ...rest }: Required<VocalOptions> = {
			...Vocal.defaultOptions,
			...(options ?? {}),
		}

		const instance = this._instance as unknown as Record<string, unknown>
		Object.assign(instance, rest)

		if (!grammars) {
			const SpeechGrammarList = Vocal._resolveSpeechGrammarList()
			instance.grammars = SpeechGrammarList ? new SpeechGrammarList() : null
		} else {
			instance.grammars = grammars
		}

		this._instance.addEventListener('end', this._onEnd)
	}

	get isRecording(): boolean {
		return this._isRecording
	}

	set isRecording(_: boolean) {
		throw new Error('You cannot set isRecording directly.')
	}

	async start({ signal }: { signal?: AbortSignal } = {}): Promise<this> {
		if (this._instance) {
			try {
				const stream = (await getUserMediaStream(
					'microphone',
					{ audio: true },
					{ signal }
				)) as MediaStream | null
				if (!stream) {
					throw new Error('Unable to retrieve the stream from media device')
				}
				this._instance.start()
				this._isRecording = true
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return this
				throw error
			}
		}

		return this
	}

	stop(): this {
		if (this._instance) {
			this._instance.stop()
			this._isRecording = false
		}

		return this
	}

	abort(): this {
		if (this._instance) {
			this._instance.abort()
			this._isRecording = false
		}

		return this
	}

	addEventListener<T extends EventType>(eventType: T, callback: EventHandlerFor<T>): this
	addEventListener(eventType: string, callback: EventHandler): this {
		if (!this._includesEventType(eventType)) {
			throw new Error(this._unknownEventTypeMessage(eventType))
		}
		if (this._instance && this._listeners) {
			const handler: EventHandler = (event) => {
				const additionalArgs: unknown[] = []
				if (eventType === Vocal.eventTypes.RESULT) {
					const speechEvent = event as SpeechRecognitionEvent
					if (speechEvent.results?.length > 0 && speechEvent.resultIndex < speechEvent.results.length) {
						const alternatives = Array.from(speechEvent.results[speechEvent.resultIndex])
						const bestAlternative = alternatives.reduce((a, b) =>
							(b.confidence ?? 0) > (a.confidence ?? 0) ? b : a
						)
						additionalArgs.push(
							bestAlternative.transcript,
							alternatives.map((a) => a.transcript)
						)
					}
				}

				;(callback as EventHandler).call(this, event, ...additionalArgs)
			}
			this._instance.addEventListener(eventType, handler as EventListener)

			if (!this._listeners[eventType]) {
				this._listeners[eventType] = []
			}
			this._listeners[eventType].push({ callback, handler })
		}

		return this
	}

	removeEventListener<T extends EventType>(eventType: T, callback?: EventHandlerFor<T>): this
	removeEventListener(eventType: string, callback?: EventHandler): this {
		if (!this._includesEventType(eventType)) {
			throw new Error(this._unknownEventTypeMessage(eventType))
		}
		const instance = this._instance
		if (instance && this._listeners && this._listeners[eventType]) {
			if (callback !== undefined) {
				const idx = this._listeners[eventType].findIndex((e) => e.callback === callback)
				if (idx !== -1) {
					instance.removeEventListener(eventType, this._listeners[eventType][idx].handler as EventListener)
					this._listeners[eventType].splice(idx, 1)
					if (this._listeners[eventType].length === 0) {
						delete this._listeners[eventType]
					}
				}
			} else {
				this._listeners[eventType].forEach(({ handler }) =>
					instance.removeEventListener(eventType, handler as EventListener)
				)
				delete this._listeners[eventType]
			}
		}

		return this
	}

	once<T extends EventType>(eventType: T, callback: EventHandlerFor<T>): this
	once(eventType: string, callback: EventHandler): this {
		const wrapper: EventHandler = (...args) => {
			;(callback as EventHandler).call(this, ...args)
			this.removeEventListener(eventType as EventType, wrapper as EventHandlerFor<EventType>)
		}
		return this.addEventListener(eventType as EventType, wrapper as EventHandlerFor<EventType>)
	}

	cleanup(): this {
		this.stop()

		Object.keys(this._listeners!).forEach((key) => this.removeEventListener(key as EventType))
		this._instance?.removeEventListener('end', this._onEnd)
		this._instance = null

		return this
	}

	private _includesEventType(eventType: string): boolean {
		return Object.values(Vocal.eventTypes).includes(eventType as EventType)
	}

	private _unknownEventTypeMessage(eventType: string): string {
		return `Unknown event type "${eventType}". Valid types are: ${Object.values(Vocal.eventTypes).join(', ')}.`
	}

	private static _resolveSpeechRecognition(): typeof SpeechRecognition | undefined {
		if (typeof window === 'undefined') return undefined
		return (
			window.SpeechRecognition ??
			window.webkitSpeechRecognition ??
			window.mozSpeechRecognition ??
			window.msSpeechRecognition
		)
	}

	private static _resolveSpeechGrammarList(): typeof SpeechGrammarList | undefined {
		return (
			window.SpeechGrammarList ??
			window.webkitSpeechGrammarList ??
			window.mozSpeechGrammarList ??
			window.msSpeechGrammarList
		)
	}
}

export default Vocal
