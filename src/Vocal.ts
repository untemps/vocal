import { WebSpeechEngine } from './WebSpeechEngine'
import {
	eventTypes,
	type CreateVocalOptions,
	type EventType,
	type SpeechEngineContext,
	type SpeechEngineFactory,
	type VocalInstance,
	type VocalOptions,
} from './types'

export { eventTypes } from './types'
export type {
	VocalOptions,
	VocalInstance,
	EventType,
	ResultEventHandler,
	ErrorEventHandler,
	PermissionEventHandler,
	GenericEventHandler,
	EventHandlerFor,
} from './types'

type EventHandler = (...args: unknown[]) => void

const defaultOptions: Required<VocalOptions> = {
	grammars: null,
	lang: 'en-US',
	continuous: false,
	interimResults: false,
	maxAlternatives: 1,
}

const includesEventType = (eventType: string): boolean => Object.values(eventTypes).includes(eventType as EventType)

const unknownEventTypeMessage = (eventType: string): string =>
	`Unknown event type "${eventType}". Valid types are: ${Object.values(eventTypes).join(', ')}.`

export const isSupported = (engineFactory: SpeechEngineFactory = WebSpeechEngine): boolean =>
	engineFactory.isSupported()

export const createVocal = (options?: CreateVocalOptions): VocalInstance => {
	const { engine: engineFactory = WebSpeechEngine, ...vocalOptions } = options ?? {}
	const resolvedOptions: Required<VocalOptions> = {
		...defaultOptions,
		...vocalOptions,
	}

	const listeners: Record<string, EventHandler[]> = {}
	let disposed = false

	const emit = ((type: string, ...payload: unknown[]): void => {
		const handlers = listeners[type]
		if (!handlers?.length) return
		const snapshot = [...handlers]
		snapshot.forEach((callback) => {
			try {
				callback(...payload)
			} catch (error) {
				console.error(error)
			}
		})
	}) as SpeechEngineContext['emit']

	const engine = engineFactory({ options: resolvedOptions, emit })
	const subscribe = engine.subscribe as (type: EventType, callback: EventHandler) => void
	const unsubscribe = engine.unsubscribe as (type: EventType) => void

	const on = (eventType: string, callback: EventHandler): void => {
		if (!includesEventType(eventType)) {
			throw new Error(unknownEventTypeMessage(eventType))
		}
		if (disposed) return

		if (!listeners[eventType]) listeners[eventType] = []
		listeners[eventType].push(callback)
		subscribe(eventType as EventType, callback)
	}

	const off = (eventType: string, callback?: EventHandler): void => {
		if (!includesEventType(eventType)) {
			throw new Error(unknownEventTypeMessage(eventType))
		}
		if (disposed || !listeners[eventType]) return

		if (callback !== undefined) {
			const idx = listeners[eventType].indexOf(callback)
			if (idx !== -1) {
				listeners[eventType].splice(idx, 1)
				if (listeners[eventType].length === 0) delete listeners[eventType]
			}
		} else {
			delete listeners[eventType]
		}

		if (!listeners[eventType]?.length) {
			unsubscribe(eventType as EventType)
		}
	}

	const cleanup = (): void => {
		if (disposed) return
		disposed = true
		engine.cleanup()
		Object.keys(listeners).forEach((key) => delete listeners[key])
	}

	return {
		get isRecording() {
			return disposed ? false : engine.isRecording
		},
		start: (startOptions) => (disposed ? Promise.resolve() : engine.start(startOptions)),
		stop: () => {
			if (!disposed) engine.stop()
		},
		abort: () => {
			if (!disposed) engine.abort()
		},
		on: on as VocalInstance['on'],
		off: off as VocalInstance['off'],
		cleanup,
	}
}
