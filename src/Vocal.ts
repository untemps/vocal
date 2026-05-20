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

const RESTART_THROTTLE_MS = 1000
const FATAL_ERRORS: ReadonlySet<string> = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

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
	private _listeners: Record<string, Array<{ callback: EventHandler; handler: EventHandler }>> = {}
	private _isRecording: boolean = false
	private _explicitStop: boolean = false
	private _lastStartedAt: number = 0
	private _restartTimeoutId: ReturnType<typeof setTimeout> | null = null
	private _isRestarting: boolean = false
	private _finalTranscripts: string[] = []

	private _onEnd = (event: Event): void => {
		if (this._shouldAutoRestart()) {
			// Chrome enforces a ~7s silence timeout even with continuous=true; restart transparently.
			const delay = Math.max(0, RESTART_THROTTLE_MS - (Date.now() - this._lastStartedAt))
			this._isRestarting = true
			this._restartTimeoutId = setTimeout(() => this._restart(), delay)
			event.stopImmediatePropagation()
			return
		}
		this._isRecording = false
	}

	private _onStart = (event: Event): void => {
		if (this._isRestarting) {
			event.stopImmediatePropagation()
			// Defer reset so user-side 'start' wrappers in the same tick still see the flag and swallow.
			queueMicrotask(() => {
				this._isRestarting = false
			})
		}
	}

	private _onError = (event: Event): void => {
		if (FATAL_ERRORS.has((event as SpeechRecognitionErrorEvent).error)) {
			this._explicitStop = true
			this._clearRestartTimeout()
			this._isRecording = false
		}
	}

	private _onResult = (event: Event): void => {
		const speechEvent = event as SpeechRecognitionEvent
		const result = speechEvent.results?.[speechEvent.resultIndex]
		if (!result?.isFinal) return
		this._finalTranscripts.push(Vocal._pickBestAlternative(Array.from(result)).transcript)
	}

	constructor(options?: VocalOptions) {
		const SpeechRecognition = Vocal._resolveSpeechRecognition()
		if (!SpeechRecognition) {
			throw new DOMException('SpeechRecognition not supported', 'NOT_SUPPORTED_ERR')
		}

		this._instance = new SpeechRecognition()

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

		this._instance.addEventListener(Vocal.eventTypes.END, this._onEnd)
		this._instance.addEventListener(Vocal.eventTypes.START, this._onStart)
		this._instance.addEventListener(Vocal.eventTypes.ERROR, this._onError)
		this._instance.addEventListener(Vocal.eventTypes.RESULT, this._onResult)
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
				this._explicitStop = false
				this._finalTranscripts = []
				this._instance.start()
				this._isRecording = true
				this._lastStartedAt = Date.now()
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return this
				throw error
			}
		}

		return this
	}

	stop(): this {
		if (this._instance) {
			this._explicitStop = true
			this._clearRestartTimeout()
			this._emitAggregatedResult()
			this._instance.stop()
			this._isRecording = false
		}

		return this
	}

	abort(): this {
		if (this._instance) {
			this._explicitStop = true
			this._clearRestartTimeout()
			this._instance.abort()
			this._isRecording = false
			this._finalTranscripts = []
		}

		return this
	}

	addEventListener<T extends EventType>(eventType: T, callback: EventHandlerFor<T>): this
	addEventListener(eventType: string, callback: EventHandler): this {
		if (!this._includesEventType(eventType)) {
			throw new Error(this._unknownEventTypeMessage(eventType))
		}
		if (this._instance) {
			const handler: EventHandler = (event) => {
				// Swallow intermediate end/start emitted by the silent auto-restart cycle.
				if (
					this._isRestarting &&
					(eventType === Vocal.eventTypes.END || eventType === Vocal.eventTypes.START)
				) {
					return
				}
				const additionalArgs: unknown[] = []
				if (eventType === Vocal.eventTypes.RESULT) {
					const speechEvent = event as SpeechRecognitionEvent
					if (speechEvent.results?.length > 0 && speechEvent.resultIndex < speechEvent.results.length) {
						const alternatives = Array.from(speechEvent.results[speechEvent.resultIndex])
						additionalArgs.push(
							Vocal._pickBestAlternative(alternatives).transcript,
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
		if (instance && this._listeners[eventType]) {
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

		Object.keys(this._listeners).forEach((key) => this.removeEventListener(key as EventType))
		this._instance?.removeEventListener(Vocal.eventTypes.END, this._onEnd)
		this._instance?.removeEventListener(Vocal.eventTypes.START, this._onStart)
		this._instance?.removeEventListener(Vocal.eventTypes.ERROR, this._onError)
		this._instance?.removeEventListener(Vocal.eventTypes.RESULT, this._onResult)
		this._instance = null

		return this
	}

	private _restart = (): void => {
		this._restartTimeoutId = null
		try {
			this._instance!.start()
			this._lastStartedAt = Date.now()
		} catch {
			this._isRestarting = false
			this._isRecording = false
		}
	}

	private _emitAggregatedResult(): void {
		const transcripts = this._finalTranscripts
		this._finalTranscripts = []
		if (transcripts.length === 0) return

		const aggregated = transcripts.join(' ').trim()
		const result = Object.assign([{ transcript: aggregated, confidence: 1 }], { isFinal: true })
		const event = Object.assign(new Event(Vocal.eventTypes.RESULT), {
			resultIndex: 0,
			results: [result],
		})

		// Snapshot listeners to stay safe if a handler removes itself during dispatch.
		;[...(this._listeners[Vocal.eventTypes.RESULT] ?? [])].forEach(({ handler }) => handler(event))
	}

	private static _pickBestAlternative<T extends { confidence?: number }>(alternatives: T[]): T {
		return alternatives.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a))
	}

	private _shouldAutoRestart(): boolean {
		return !!this._instance && !this._explicitStop && this._instance.continuous
	}

	private _clearRestartTimeout(): void {
		if (this._restartTimeoutId !== null) {
			clearTimeout(this._restartTimeoutId)
			this._restartTimeoutId = null
		}
		this._isRestarting = false
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
