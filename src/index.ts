export { createVocal, isSupported, eventTypes } from './Vocal'
export { WebSpeechEngine } from './WebSpeechEngine'
export { createEngine } from './createEngine'
export type { EngineBackend, EngineSession, EngineConnectContext } from './createEngine'
export type {
	VocalOptions,
	CreateVocalOptions,
	VocalInstance,
	EventType,
	ResultEventHandler,
	ErrorEventHandler,
	PermissionEventHandler,
	GenericEventHandler,
	EventHandlerFor,
	SpeechEngineInstance,
	SpeechEngineContext,
	SpeechEngineFactory,
} from './types'
