import { isPermissionsSupported, watchPermission } from '@untemps/user-permissions-utils'
import { eventTypes, type SpeechEngineContext } from './types'

type PermissionListener = (...args: unknown[]) => void

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

	const subscribe = (callback: PermissionListener): void => {
		if (lastState !== null) {
			try {
				callback(makePermissionEvent(lastState), lastState)
			} catch (error) {
				console.error(error)
			}
		}
		ensure()
	}

	return { subscribe, teardown }
}
