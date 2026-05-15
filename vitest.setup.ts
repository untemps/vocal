import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

Object.defineProperty(global, 'navigator', {
	value: { userAgent: 'node.js' },
	writable: true,
	configurable: true,
})

interface MockPermissionStatus {
	state: string
	addEventListener: ReturnType<typeof vi.fn>
}

interface MockPermissions {
	query: ReturnType<typeof vi.fn>
}

interface MockMediaDevices {
	getUserMedia: ReturnType<typeof vi.fn>
}

interface MockSpeechRecognitionInstance {
	addEventListener: ReturnType<typeof vi.fn>
	removeEventListener: ReturnType<typeof vi.fn>
	dispatchEvent: ReturnType<typeof vi.fn>
	start: ReturnType<typeof vi.fn>
	stop: ReturnType<typeof vi.fn>
	abort: ReturnType<typeof vi.fn>
	say: ReturnType<typeof vi.fn>
	[key: string]: unknown
}

declare global {
	var PermissionStatus: new () => MockPermissionStatus
	var Permissions: new () => MockPermissions
	var MediaDevices: new () => MockMediaDevices
}

global.PermissionStatus = vi.fn(function (this: MockPermissionStatus) {
	return {
		state: 'granted',
		addEventListener: vi.fn(),
	}
}) as unknown as new () => MockPermissionStatus

global.Permissions = vi.fn(function (this: MockPermissions) {
	return {
		query: vi.fn().mockResolvedValue(new PermissionStatus()),
	}
}) as unknown as new () => MockPermissions

Object.defineProperty(global.navigator, 'permissions', {
	value: new Permissions(),
	writable: true,
	configurable: true,
})

global.MediaDevices = vi.fn(function (this: MockMediaDevices) {
	return {
		getUserMedia: vi.fn().mockResolvedValue('foo'),
	}
}) as unknown as new () => MockMediaDevices

Object.defineProperty(global.navigator, 'mediaDevices', {
	value: new MediaDevices(),
	writable: true,
	configurable: true,
})

global.SpeechGrammarList = vi.fn(function () {
	return {
		length: 0,
	}
}) as unknown as typeof SpeechGrammarList

global.SpeechRecognition = vi.fn(function () {
	const handlers: Record<string, (event?: unknown) => void> = {}
	return {
		addEventListener: vi.fn(function (type: string, callback: (event?: unknown) => void) {
			handlers[type] = callback
		}),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
		start: vi.fn(function () {
			handlers.start?.()
		}),
		stop: vi.fn(function () {
			handlers.end?.()
		}),
		abort: vi.fn(function () {
			handlers.end?.()
		}),
		say: vi.fn(function (sentence: string) {
			handlers.speechstart?.()

			const resultEvent = new Event('result') as Event & {
				resultIndex: number
				results: [{ transcript: string }][]
			}
			resultEvent.resultIndex = 0
			resultEvent.results = [[{ transcript: sentence }]]
			if (sentence) {
				handlers.result?.(resultEvent)
			} else {
				handlers.nomatch?.()
			}
			handlers.speechend?.()
		}),
	} as MockSpeechRecognitionInstance
}) as unknown as typeof SpeechRecognition
