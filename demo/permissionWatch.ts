import { isPermissionsSupported, watchPermission } from '@untemps/user-permissions-utils'
import { eventTypes, type EventType, type SpeechEngineContext, type SpeechEngineInstance } from '../src/index'

type LooseHandler = (...args: unknown[]) => void

const makePermissionEvent = (state: PermissionState): Event & { state: PermissionState } =>
	Object.assign(new Event(eventTypes.PERMISSION), { state })

// Best-effort microphone permission watch shared by the cloud demo engines, built on
// @untemps/user-permissions-utils. Mirrors the built-in WebSpeechEngine: it opens a single
// watch on the first `permission` subscription (replaying the cached state to late
// subscribers) and tears it down when the last one leaves or the engine is cleaned up.
export const createPermissionWatch = (emit: SpeechEngineContext['emit']) => {
	let controller: AbortController | null = null
	let lastState: PermissionState | null = null

	const ensure = (): void => {
		if (controller || !isPermissionsSupported()) return
		const active = new AbortController()
		controller = active
		watchPermission(
			'microphone',
			(state) => {
				lastState = state
				emit(eventTypes.PERMISSION, makePermissionEvent(state), state)
			},
			{ signal: active.signal, emitImmediately: true }
		).catch(() => {})
	}

	const teardown = (): void => {
		controller?.abort()
		controller = null
		lastState = null
	}

	const subscribe = (type: EventType, callback: LooseHandler): void => {
		if (type !== eventTypes.PERMISSION) return
		if (controller) {
			// Watch already running → replay the cached state to the new subscriber only.
			if (lastState !== null) callback(makePermissionEvent(lastState), lastState)
		} else {
			// First subscriber → open the watch; emitImmediately seeds every listener with the state.
			ensure()
		}
	}

	const unsubscribe = (type: EventType): void => {
		if (type !== eventTypes.PERMISSION) return
		teardown()
	}

	return {
		subscribe: subscribe as SpeechEngineInstance['subscribe'],
		unsubscribe,
		teardown,
	}
}
