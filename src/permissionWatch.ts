import { isPermissionsSupported, watchPermission } from '@untemps/user-permissions-utils'
import { eventTypes, type EventType, type SpeechEngineContext, type SpeechEngineInstance } from './types'

type EventHandler = (...args: unknown[]) => void

const makePermissionEvent = (state: PermissionState): Event & { state: PermissionState } =>
	Object.assign(new Event(eventTypes.PERMISSION), { state })

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

	const subscribe = (type: EventType, callback: EventHandler): void => {
		if (type !== eventTypes.PERMISSION) return
		if (lastState !== null) callback(makePermissionEvent(lastState), lastState)
		ensure()
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
