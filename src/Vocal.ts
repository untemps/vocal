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
	serviceURI?: string | null
}

export type EventType = (typeof Vocal.eventTypes)[keyof typeof Vocal.eventTypes]

type EventHandler = (event: Event, ...args: unknown[]) => void

class Vocal {
	static defaultOptions: Required<VocalOptions> = {
		grammars: null,
		lang: 'en-US',
		continuous: false,
		interimResults: false,
		maxAlternatives: 1,
		serviceURI: null,
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
	private _listeners: Record<string, EventHandler> | null = null

	constructor(options?: VocalOptions) {
		const SpeechRecognition = Vocal._resolveSpeechRecognition()
		if (!SpeechRecognition) {
			throw new DOMException('SpeechRecognition not supported', 'NOT_SUPPORTED_ERR')
		}

		this._instance = new SpeechRecognition()
		this._listeners = {}

		const resolvedOptions: Required<VocalOptions> = {
			...Vocal.defaultOptions,
			...(options ?? {}),
		}

		for (const [key, value] of Object.entries(resolvedOptions) as [keyof VocalOptions, unknown][]) {
			let resolvedValue = value
			if (key === 'grammars' && !resolvedValue) {
				const SpeechGrammarList = Vocal._resolveSpeechGrammarList()
				if (SpeechGrammarList) {
					resolvedValue = new SpeechGrammarList()
				}
			}
			;(this._instance as unknown as Record<string, unknown>)[key] = resolvedValue
		}
	}

	get instance(): SpeechRecognition | null {
		return this._instance
	}

	set instance(_: SpeechRecognition | null) {
		throw new Error('You cannot set instance directly.')
	}

	async start(): Promise<this> {
		if (this._instance) {
			try {
				const stream = (await getUserMediaStream('microphone', { audio: true })) as MediaStream | null
				if (!stream) {
					throw new Error('Unable to retrieve the stream from media device')
				}
				this._instance.start()
			} catch (error) {
				const errorHandler = this._listeners?.error
				if (errorHandler) {
					errorHandler(error as Event)
				}
			}
		}

		return this
	}

	stop(): this {
		if (this._instance) {
			this._instance.stop()
		}

		return this
	}

	abort(): this {
		if (this._instance) {
			this._instance.abort()
		}

		return this
	}

	addEventListener(eventType: string, callback: EventHandler): this {
		if (this._instance && this._listeners && this._includesEventType(eventType)) {
			if (this._listeners[eventType]) {
				this.removeEventListener(eventType)
			}

			const handler: EventHandler = (event) => {
				const additionalArgs: unknown[] = []
				if (eventType === Vocal.eventTypes.RESULT) {
					const speechEvent = event as SpeechRecognitionEvent
					if (speechEvent.results?.length > 0) {
						additionalArgs.push(speechEvent.results[0][0].transcript)
					}
				}

				callback.apply(this, [event, ...additionalArgs])
			}
			this._instance.addEventListener(eventType, handler as EventListener)

			this._listeners[eventType] = handler
		}

		return this
	}

	removeEventListener(eventType: string): this {
		const handler = this._listeners![eventType]
		this._instance!.removeEventListener(eventType, handler as EventListener)
		delete this._listeners![eventType]

		return this
	}

	cleanup(): this {
		this.stop()

		Object.keys(this._listeners!).forEach((key) => this.removeEventListener(key))
		this._instance = null

		return this
	}

	private _includesEventType(eventType: string): boolean {
		return Object.values(Vocal.eventTypes).includes(eventType as EventType)
	}

	static _resolveSpeechRecognition(): typeof SpeechRecognition | undefined {
		return (
			window.SpeechRecognition ??
			window.webkitSpeechRecognition ??
			window.mozSpeechRecognition ??
			window.msSpeechRecognition
		)
	}

	static _resolveSpeechGrammarList(): typeof SpeechGrammarList | undefined {
		return (
			window.SpeechGrammarList ??
			window.webkitSpeechGrammarList ??
			window.mozSpeechGrammarList ??
			window.msSpeechGrammarList
		)
	}
}

export default Vocal
