import { vi, type Mock } from 'vitest'
import '@testing-library/jest-dom/vitest'

Object.defineProperty(global, 'navigator', {
	value: { userAgent: 'node.js' },
	writable: true,
	configurable: true,
})

interface MockPermissionStatus {
	state: string
	addEventListener: Mock
}

interface MockPermissions {
	query: Mock
}

interface MockMediaDevices {
	getUserMedia: Mock
}

type SayAlternative = string | { transcript: string; confidence: number }

interface MockSpeechRecognitionInstance {
	addEventListener: Mock
	removeEventListener: Mock
	dispatchEvent: Mock
	start: Mock
	stop: Mock
	abort: Mock
	say: Mock<[sentence: string, alternatives?: SayAlternative[], options?: { isFinal?: boolean }], void>
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
	const handlers: Record<string, ((event?: unknown) => void)[]> = {}

	const dispatch = (type: string, event?: unknown) => handlers[type]?.forEach((h) => h(event))

	return {
		addEventListener: vi.fn(function (type: string, callback: (event?: unknown) => void) {
			if (!handlers[type]) handlers[type] = []
			handlers[type].push(callback)
		}),
		removeEventListener: vi.fn(function (type: string, callback: (event?: unknown) => void) {
			if (handlers[type]) {
				handlers[type] = handlers[type].filter((h) => h !== callback)
			}
		}),
		dispatchEvent: vi.fn(),
		start: vi.fn(function () {
			dispatch('start', new Event('start'))
		}),
		stop: vi.fn(function () {
			dispatch('end', new Event('end'))
		}),
		abort: vi.fn(function () {
			dispatch('end', new Event('end'))
		}),
		say: vi.fn(function (
			sentence: string,
			alternatives?: (string | { transcript: string; confidence: number })[],
			options?: { isFinal?: boolean }
		) {
			dispatch('speechstart')

			const alts = alternatives ?? [sentence]
			const result = Object.assign(
				alts.map((t) => (typeof t === 'string' ? { transcript: t, confidence: 0 } : t)),
				{ isFinal: options?.isFinal ?? true }
			)
			const resultEvent = new Event('result') as Event & {
				resultIndex: number
				results: (typeof result)[]
			}
			resultEvent.resultIndex = 0
			resultEvent.results = [result]
			if (sentence) {
				dispatch('result', resultEvent)
			} else {
				dispatch('nomatch')
			}
			dispatch('speechend')
		}),
	} as MockSpeechRecognitionInstance
}) as unknown as typeof SpeechRecognition
