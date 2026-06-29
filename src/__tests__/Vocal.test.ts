import { createVocal, isSupported, eventTypes, type VocalInstance } from '../Vocal'
import type { SpeechEngineContext, SpeechEngineFactory, SpeechEngineInstance } from '../types'
import * as userPermissionsUtils from '@untemps/user-permissions-utils'

type MockFn = {
	(...args: unknown[]): unknown
	mock: { calls: unknown[][] }
}

type SayAlternative = string | { transcript: string; confidence: number }

interface MockInstance {
	say: ((sentence: string, alternatives?: SayAlternative[], options?: { isFinal?: boolean }) => void) & {
		mock: { calls: unknown[][] }
	}
	addEventListener: MockFn
	removeEventListener: MockFn
	start: MockFn
	stop: MockFn
	abort: MockFn
	[key: string]: unknown
}

const lastInstance = (): MockInstance => {
	const sr = SpeechRecognition as unknown as { mock: { results: Array<{ value: MockInstance }> } }
	return sr.mock.results[sr.mock.results.length - 1].value
}

const setup = (options?: Parameters<typeof createVocal>[0]): { vocal: VocalInstance; instance: MockInstance } => {
	const vocal = createVocal(options)
	return { vocal, instance: lastInstance() }
}

const mockTrackStop = vi.fn()
const mockStream = {
	getTracks: () => [{ stop: mockTrackStop } as unknown as MediaStreamTrack],
} as unknown as MediaStream

describe('Vocal', () => {
	describe('isSupported', () => {
		it('returns true when SpeechRecognition and mediaDevices are both supported', () => {
			expect(isSupported()).toBe(true)
		})

		it('returns false when mediaDevices is not supported', () => {
			vi.spyOn(userPermissionsUtils, 'isMediaDevicesSupported').mockReturnValueOnce(false)
			expect(isSupported()).toBe(false)
		})

		describe('when SpeechRecognition is unavailable', () => {
			let original: typeof SpeechRecognition | undefined
			beforeEach(() => {
				original = window.SpeechRecognition
				window.SpeechRecognition = undefined as unknown as typeof SpeechRecognition
			})
			afterEach(() => {
				window.SpeechRecognition = original as typeof SpeechRecognition
			})

			it('returns false', () => {
				expect(isSupported()).toBe(false)
			})
		})

		describe('when window is not defined (SSR)', () => {
			let originalWindow: typeof globalThis.window
			beforeEach(() => {
				originalWindow = globalThis.window
				delete (globalThis as unknown as Record<string, unknown>).window
			})
			afterEach(() => {
				globalThis.window = originalWindow
			})

			it('returns false without throwing', () => {
				expect(() => isSupported()).not.toThrow()
				expect(isSupported()).toBe(false)
			})
		})
	})

	describe('createVocal', () => {
		it('applies default options', () => {
			const { instance } = setup()
			expect(instance.lang).toBe('en-US')
			expect(instance.continuous).toBe(false)
			expect(instance.interimResults).toBe(false)
			expect(instance.maxAlternatives).toBe(1)
		})

		it('applies custom options', () => {
			const { instance } = setup({ lang: 'fr-FR', continuous: true })
			expect(instance.lang).toBe('fr-FR')
			expect(instance.continuous).toBe(true)
		})

		it('assigns SpeechGrammarList instance when grammars is null and SpeechGrammarList is available', () => {
			const { instance } = setup()
			expect(instance.grammars).not.toBeNull()
		})

		it('uses provided grammars value when non-null', () => {
			const grammars = { items: [] } as unknown as SpeechGrammarList
			const { instance } = setup({ grammars })
			expect(instance.grammars).toBe(grammars)
		})

		describe('when SpeechRecognition is unavailable', () => {
			let original: typeof SpeechRecognition | undefined
			beforeEach(() => {
				original = window.SpeechRecognition
				window.SpeechRecognition = undefined as unknown as typeof SpeechRecognition
			})
			afterEach(() => {
				window.SpeechRecognition = original as typeof SpeechRecognition
			})

			it('throws DOMException', () => {
				expect(() => createVocal()).toThrow(DOMException)
			})
		})

		describe('when SpeechGrammarList is unavailable', () => {
			let original: typeof SpeechGrammarList | undefined
			beforeEach(() => {
				original = window.SpeechGrammarList
				window.SpeechGrammarList = undefined as unknown as typeof SpeechGrammarList
			})
			afterEach(() => {
				window.SpeechGrammarList = original as typeof SpeechGrammarList
			})

			it('leaves grammars null', () => {
				const { instance } = setup()
				expect(instance.grammars).toBeNull()
			})
		})
	})

	describe('isRecording', () => {
		it('returns false by default', () => {
			const { vocal } = setup()
			expect(vocal.isRecording).toBe(false)
		})

		it('returns true after a successful start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal } = setup()
			await vocal.start()
			expect(vocal.isRecording).toBe(true)
		})

		it.each([
			['stop', (v: VocalInstance) => v.stop()],
			['abort', (v: VocalInstance) => v.abort()],
		] as const)('returns false after %s', async (_, action) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal } = setup()
			await vocal.start()
			action(vocal)
			expect(vocal.isRecording).toBe(false)
		})

		it('returns false when end event fires', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup()
			await vocal.start()
			instance.addEventListener.mock.calls
				.filter(([type]: string[]) => type === 'end')
				.forEach(([, handler]: [string, EventListener]) => handler(new Event('end')))
			expect(vocal.isRecording).toBe(false)
		})
	})

	describe('start', () => {
		it('calls instance.start when getUserMediaStream returns a stream', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup()
			await vocal.start()
			expect(instance.start).toHaveBeenCalled()
		})

		it('releases the acquired stream tracks once the prompt has been driven', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			mockTrackStop.mockClear()
			const { vocal } = setup()
			await vocal.start()
			expect(mockTrackStop).toHaveBeenCalledTimes(1)
		})

		it.each([
			['NotAllowedError', 'permission denied'],
			['NotFoundError', 'no device'],
		])('rejects with the original %s DOMException from getUserMediaStream', async (name, message) => {
			const error = new DOMException(message, name)
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValueOnce(error)
			const { vocal } = setup()
			await expect(vocal.start()).rejects.toBe(error)
			expect(vocal.isRecording).toBe(false)
		})

		it('rejects when getUserMediaStream throws', async () => {
			const error = new Error('foo')
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementationOnce(() => {
				throw error
			})
			const { vocal } = setup()
			await expect(vocal.start()).rejects.toThrow(error)
			expect(vocal.isRecording).toBe(false)
		})

		it('does nothing once cleaned up', async () => {
			const { vocal, instance } = setup()
			vocal.cleanup()
			const startCallsBefore = (instance.start as MockFn).mock.calls.length
			await vocal.start()
			expect((instance.start as MockFn).mock.calls.length).toBe(startCallsBefore)
		})

		it('resolves when getUserMediaStream is aborted', async () => {
			const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValueOnce(abortError)
			const { vocal } = setup()
			await expect(vocal.start()).resolves.toBeUndefined()
		})

		it('forwards signal to getUserMediaStream when provided', async () => {
			const spy = vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const signal = new AbortController().signal
			const { vocal } = setup()
			await vocal.start({ signal })
			expect(spy).toHaveBeenCalledWith('microphone', { audio: true }, { signal })
		})

		it('calls getUserMediaStream without signal when not provided', async () => {
			const spy = vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal } = setup()
			await vocal.start()
			expect(spy).toHaveBeenCalledWith('microphone', { audio: true }, { signal: undefined })
		})

		it('does not start recognition when signal aborts after the stream resolves', async () => {
			const controller = new AbortController()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementationOnce(async () => {
				controller.abort()
				return mockStream
			})
			const { vocal, instance } = setup()
			await vocal.start({ signal: controller.signal })
			expect(instance.start).not.toHaveBeenCalled()
			expect(vocal.isRecording).toBe(false)
		})

		it('does not start recognition when cleanup runs while getUserMediaStream is pending', async () => {
			let resolveStream!: (stream: MediaStream) => void
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementationOnce(
				() =>
					new Promise<MediaStream>((resolve) => {
						resolveStream = resolve
					})
			)
			const { vocal, instance } = setup()
			const startPromise = vocal.start()
			vocal.cleanup()
			resolveStream(mockStream)
			await expect(startPromise).resolves.toBeUndefined()
			expect(instance.start).not.toHaveBeenCalled()
			expect(vocal.isRecording).toBe(false)
		})
	})

	describe('permission event', () => {
		const grantOnWatch = (state: PermissionState = 'granted') =>
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, onChange) => {
				onChange(state)
				return Promise.resolve()
			})

		const captureWatchSignal = () => {
			const ref: { signal?: AbortSignal } = {}
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, _onChange, options) => {
				ref.signal = options?.signal
				return Promise.resolve()
			})
			return ref
		}

		it('is accepted as a valid event type', () => {
			const { vocal } = setup()
			expect(() => vocal.on(eventTypes.PERMISSION, vi.fn())).not.toThrow()
		})

		it('emits the current microphone permission state as soon as a handler subscribes', () => {
			grantOnWatch('granted')
			const onPermission = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, onPermission)
			expect(onPermission).toHaveBeenCalledWith(expect.any(Event), 'granted')
		})

		it('observes before any start() call', () => {
			const spy = grantOnWatch('prompt')
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			expect(spy).toHaveBeenCalledWith('microphone', expect.any(Function), {
				signal: expect.any(AbortSignal),
				emitImmediately: true,
			})
		})

		it('carries the state on the synthetic event', () => {
			grantOnWatch('granted')
			const onPermission = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, onPermission)
			const event = onPermission.mock.calls[0][0] as Event & { state: PermissionState }
			expect(event.state).toBe('granted')
		})

		it('re-emits on permission transition', () => {
			let emit!: (state: PermissionState) => void
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, onChange) => {
				emit = onChange
				onChange('prompt')
				return Promise.resolve()
			})
			const onPermission = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, onPermission)
			emit('denied')
			expect(onPermission).toHaveBeenCalledTimes(2)
			expect(onPermission).toHaveBeenNthCalledWith(1, expect.any(Event), 'prompt')
			expect(onPermission).toHaveBeenNthCalledWith(2, expect.any(Event), 'denied')
		})

		it('continues to emit transitions during an active session', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			let emit!: (state: PermissionState) => void
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, onChange) => {
				emit = onChange
				onChange('prompt')
				return Promise.resolve()
			})
			const onPermission = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, onPermission)
			await vocal.start()
			expect(vocal.isRecording).toBe(true)
			emit('granted')
			expect(onPermission).toHaveBeenLastCalledWith(expect.any(Event), 'granted')
		})

		it('does not open a watch when no permission handler is attached', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const spy = vi.spyOn(userPermissionsUtils, 'watchPermission')
			const { vocal } = setup()
			await vocal.start()
			expect(spy).not.toHaveBeenCalled()
		})

		it('opens a single watch even with multiple permission handlers', () => {
			const spy = grantOnWatch('granted')
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			vocal.on(eventTypes.PERMISSION, vi.fn())
			expect(spy).toHaveBeenCalledTimes(1)
		})

		it('replays the cached state to a handler attached after the watch started', () => {
			grantOnWatch('granted')
			const late = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			vocal.on(eventTypes.PERMISSION, late)
			expect(late).toHaveBeenCalledWith(expect.any(Event), 'granted')
		})

		it('does not call watchPermission when the Permissions API is unsupported', () => {
			vi.spyOn(userPermissionsUtils, 'isPermissionsSupported').mockReturnValue(false)
			const spy = vi.spyOn(userPermissionsUtils, 'watchPermission')
			const handler = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, handler)
			expect(() => vocal.off(eventTypes.PERMISSION, handler)).not.toThrow()
			expect(spy).not.toHaveBeenCalled()
		})

		it('ignores watch callbacks once every handler has been removed', () => {
			let emit!: (state: PermissionState) => void
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, onChange) => {
				emit = onChange
				return Promise.resolve()
			})
			const handler = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, handler)
			vocal.off(eventTypes.PERMISSION, handler)
			handler.mockClear()
			expect(() => emit('granted')).not.toThrow()
			expect(handler).not.toHaveBeenCalled()
		})

		it('is best-effort: a rejected watchPermission breaks neither subscribe nor start', async () => {
			const streamSpy = vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockRejectedValue(
				new DOMException('not supported', 'NotSupportedError')
			)
			const { vocal, instance } = setup()
			expect(() => vocal.on(eventTypes.PERMISSION, vi.fn())).not.toThrow()
			await expect(vocal.start()).resolves.toBeUndefined()
			expect(instance.start).toHaveBeenCalled()
			expect(streamSpy).toHaveBeenCalled()
		})

		it('tears down the watch when the last permission handler is removed', () => {
			const watch = captureWatchSignal()
			const handler = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, handler)
			expect(watch.signal?.aborted).toBe(false)
			vocal.off(eventTypes.PERMISSION, handler)
			expect(watch.signal?.aborted).toBe(true)
		})

		it('keeps the watch alive while at least one permission handler remains', () => {
			const watch = captureWatchSignal()
			const first = vi.fn()
			const second = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, first)
			vocal.on(eventTypes.PERMISSION, second)
			vocal.off(eventTypes.PERMISSION, first)
			expect(watch.signal?.aborted).toBe(false)
			vocal.off(eventTypes.PERMISSION, second)
			expect(watch.signal?.aborted).toBe(true)
		})

		it('tears down the watch when all permission handlers are removed at once', () => {
			const watch = captureWatchSignal()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			vocal.on(eventTypes.PERMISSION, vi.fn())
			vocal.off(eventTypes.PERMISSION)
			expect(watch.signal?.aborted).toBe(true)
		})

		it('tears down the watch on cleanup', () => {
			const watch = captureWatchSignal()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			expect(watch.signal?.aborted).toBe(false)
			vocal.cleanup()
			expect(watch.signal?.aborted).toBe(true)
		})

		it.each([
			['stop', (v: VocalInstance) => v.stop()],
			['abort', (v: VocalInstance) => v.abort()],
		] as const)('keeps observing permission after %s (outside-session lifetime)', async (_, action) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const watch = captureWatchSignal()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			await vocal.start()
			action(vocal)
			expect(watch.signal?.aborted).toBe(false)
		})

		it('does not tear down the watch when start() rejects', async () => {
			const watch = captureWatchSignal()
			const error = new DOMException('permission denied', 'NotAllowedError')
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValueOnce(error)
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, vi.fn())
			await expect(vocal.start()).rejects.toBe(error)
			expect(watch.signal?.aborted).toBe(false)
		})

		it('re-opens the watch after a teardown and a fresh subscription', () => {
			const spy = grantOnWatch('granted')
			const handler = vi.fn()
			const { vocal } = setup()
			vocal.on(eventTypes.PERMISSION, handler)
			vocal.off(eventTypes.PERMISSION, handler)
			vocal.on(eventTypes.PERMISSION, handler)
			expect(spy).toHaveBeenCalledTimes(2)
		})
	})

	describe('stop', () => {
		it('calls instance.stop', () => {
			const { vocal, instance } = setup()
			vocal.stop()
			expect(instance.stop).toHaveBeenCalled()
		})

		it('does nothing once cleaned up', () => {
			const { vocal } = setup()
			vocal.cleanup()
			expect(() => vocal.stop()).not.toThrow()
		})
	})

	describe('abort', () => {
		it('calls instance.abort', () => {
			const { vocal, instance } = setup()
			vocal.abort()
			expect(instance.abort).toHaveBeenCalled()
		})

		it('does nothing once cleaned up', () => {
			const { vocal } = setup()
			vocal.cleanup()
			expect(() => vocal.abort()).not.toThrow()
		})
	})

	describe('on', () => {
		it('registers and calls callback for non-RESULT events', () => {
			const onStart = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart)
			instance.start()
			expect(onStart).toHaveBeenCalled()
		})

		it('passes best transcript and alternatives array for RESULT events', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			instance.say('hello world')
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('exposes item() on mocked RESULT events for lib.dom-compliant consumers', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			instance.say('hello')
			const event = onResult.mock.calls[0][0] as SpeechRecognitionEvent
			expect(typeof event.results.item).toBe('function')
			const firstResult = event.results.item(0)
			expect(firstResult.isFinal).toBe(true)
			expect(typeof firstResult.item).toBe('function')
			expect(firstResult.item(0).transcript).toBe('hello')
		})

		it('passes all alternatives when multiple are available', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			instance.say('hello', ['hello', 'helo', 'hell'])
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello', 'helo', 'hell'])
		})

		it('falls back to first alternative when confidence is unavailable', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			const [, handler] = (instance.addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === eventTypes.RESULT
			)!
			const event = Object.assign(new Event(eventTypes.RESULT), {
				resultIndex: 0,
				results: [[{ transcript: 'hello' }, { transcript: 'helo' }, { transcript: 'hell' }]],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello', 'helo', 'hell'])
		})

		it('selects the alternative with highest confidence as best transcript', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			instance.say('helo', [
				{ transcript: 'hello', confidence: 0.7 },
				{ transcript: 'helo', confidence: 0.9 },
				{ transcript: 'hell', confidence: 0.5 },
			])
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'helo', ['hello', 'helo', 'hell'])
		})

		it('uses resultIndex to select the current result in continuous mode', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			const [, handler] = (instance.addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === eventTypes.RESULT
			)!
			const event = Object.assign(new Event(eventTypes.RESULT), {
				resultIndex: 1,
				results: [
					[{ transcript: 'first utterance', confidence: 0.9 }],
					[{ transcript: 'second utterance', confidence: 0.8 }],
				],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'second utterance', ['second utterance'])
		})

		it('does not pass transcript when resultIndex is out of bounds', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			const [, handler] = (instance.addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === eventTypes.RESULT
			)!
			const event = Object.assign(new Event(eventTypes.RESULT), {
				resultIndex: 5,
				results: [[{ transcript: 'hello', confidence: 0.9 }]],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult.mock.calls[0]).toHaveLength(1)
		})

		it('does not pass transcript for RESULT events with empty results', () => {
			const onResult = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.RESULT, onResult)
			const [, handler] = (instance.addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === eventTypes.RESULT
			)!
			const event = Object.assign(new Event(eventTypes.RESULT), { results: [] })
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult.mock.calls[0]).toHaveLength(1)
		})

		it('stacks multiple listeners for the same event type', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart1)
			vocal.on(eventTypes.START, onStart2)
			instance.start()
			expect(onStart1).toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('removes a specific listener by callback reference', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart1)
			vocal.on(eventTypes.START, onStart2)
			vocal.off(eventTypes.START, onStart1)
			instance.start()
			expect(onStart1).not.toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('throws on invalid event types', () => {
			const { vocal } = setup()
			expect(() => vocal.on('invalid-type', vi.fn())).toThrow('Unknown event type "invalid-type"')
		})

		it('does nothing once cleaned up', () => {
			const { vocal } = setup()
			vocal.cleanup()
			expect(() => vocal.on(eventTypes.START, vi.fn())).not.toThrow()
		})
	})

	describe('off', () => {
		it('stops forwarding events once all listeners for a type are removed', () => {
			const onStart = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart)
			vocal.off(eventTypes.START)
			instance.start()
			expect(onStart).not.toHaveBeenCalled()
		})

		it('does nothing once cleaned up', () => {
			const { vocal } = setup()
			vocal.cleanup()
			expect(() => vocal.off(eventTypes.START)).not.toThrow()
		})

		it('throws on invalid event types', () => {
			const { vocal } = setup()
			expect(() => vocal.off('invalid-type')).toThrow('Unknown event type "invalid-type"')
		})

		it('does nothing when callback was never registered', () => {
			const { vocal } = setup()
			vocal.on(eventTypes.START, vi.fn())
			expect(() => vocal.off(eventTypes.START, vi.fn())).not.toThrow()
		})

		it('cleans up the listener entry when last callback is removed by reference', () => {
			const onStart = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart)
			vocal.off(eventTypes.START, onStart)
			instance.start()
			expect(onStart).not.toHaveBeenCalled()
		})
	})

	describe('continuous auto-restart', () => {
		const fireEnd = (instance: MockInstance) => {
			;(instance.addEventListener.mock.calls as [string, EventListener][])
				.filter(([type]) => type === 'end')
				.forEach(([, handler]) => handler(new Event('end')))
		}

		const fireError = (instance: MockInstance, error: string) => {
			;(instance.addEventListener.mock.calls as [string, EventListener][])
				.filter(([type]) => type === 'error')
				.forEach(([, handler]) => handler(Object.assign(new Event('error'), { error }) as unknown as Event))
		}

		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('restarts the engine after silence end when continuous is true', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('does not restart when continuous is false', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: false })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('does not restart after explicit stop()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			vocal.stop()
			const startCallsAfterStop = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(startCallsAfterStop)
		})

		it('does not restart after explicit abort()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			vocal.abort()
			const startCallsAfterAbort = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(startCallsAfterAbort)
		})

		it('throttles restart to at least 1000ms after last start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000 - 1)
			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)

			await vi.advanceTimersByTimeAsync(1)
			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('restarts immediately when more than 1000ms have elapsed since last start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000 + 500)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(0)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('cancels the scheduled restart when stop() is called during the throttle window', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			vocal.stop()
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('cancels the scheduled restart when abort() is called during the throttle window', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			vocal.abort()
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('disables auto-restart on not-allowed error', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, 'not-allowed')
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
			expect(vocal.isRecording).toBe(false)
		})

		it.each(['service-not-allowed', 'audio-capture'])('disables auto-restart on %s error', async (errorType) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, errorType)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it.each(['no-speech', 'network'])('keeps auto-restart active on transient %s error', async (errorType) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, errorType)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('does not propagate intermediate end events to user listeners', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const onEnd = vi.fn()
			vocal.on(eventTypes.END, onEnd)

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect(onEnd).not.toHaveBeenCalled()
		})

		it('does not propagate the restart start event to user listeners', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const onStart = vi.fn()
			vocal.on(eventTypes.START, onStart)

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect(onStart).not.toHaveBeenCalled()
		})

		it('still propagates end on explicit stop in continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal } = setup({ continuous: true })
			await vocal.start()
			const onEnd = vi.fn()
			vocal.on(eventTypes.END, onEnd)

			vocal.stop()

			expect(onEnd).toHaveBeenCalledTimes(1)
		})

		it('keeps isRecording true during the restart window', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			fireEnd(instance)
			expect(vocal.isRecording).toBe(true)

			await vi.advanceTimersByTimeAsync(1000)
			expect(vocal.isRecording).toBe(true)
		})

		it('cancels the scheduled restart on cleanup()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			vocal.cleanup()
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('resets isRecording when the engine throws on restart', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			fireEnd(instance)
			;(instance.start as unknown as { mockImplementationOnce: (fn: () => void) => void }).mockImplementationOnce(
				() => {
					throw new Error('InvalidStateError')
				}
			)

			await vi.advanceTimersByTimeAsync(1000)

			expect(vocal.isRecording).toBe(false)
		})
	})

	describe('aggregated result on stop()', () => {
		it('does not propagate intermediate final results but still accumulates them in continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello')
			instance.say('world')

			expect(onResult).not.toHaveBeenCalled()

			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('still propagates interim results to user listeners in continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true, interimResults: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('partial', undefined, { isFinal: false })

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'partial', ['partial'])
		})

		it('forwards interims and aggregates finals in continuous + interimResults mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true, interimResults: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hel', undefined, { isFinal: false })
			instance.say('hello', undefined, { isFinal: false })
			instance.say('hello', undefined, { isFinal: true })

			expect(onResult).toHaveBeenCalledTimes(2)
			expect(onResult.mock.calls[0]).toEqual([expect.any(Event), 'hel', ['hel']])
			expect(onResult.mock.calls[1]).toEqual([expect.any(Event), 'hello', ['hello']])

			onResult.mockClear()
			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello'])
		})

		it('propagates final results to user listeners in non-continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: false })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello')

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello'])
		})

		it('emits the result only once on stop() in non-continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: false })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello')
			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello'])
		})

		it('includes trailing finals emitted between instance.stop() and end in the aggregate', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			instance.say('hello')

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			const calls = instance.addEventListener.mock.calls as unknown as [string, EventListener][]
			const fireToHandlers = (type: string, event: Event) =>
				calls.filter(([t]) => t === type).forEach(([, h]) => h(event))

			instance.stop.mockImplementationOnce(() => {
				const trailing = Object.assign(new Event('result'), {
					resultIndex: 0,
					results: [Object.assign([{ transcript: 'world', confidence: 0.9 }], { isFinal: true })],
				})
				fireToHandlers('result', trailing as Event)
				fireToHandlers('end', new Event('end'))
			})

			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('exposes per-utterance results on the synthetic aggregated event via item()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello')
			instance.say('world')
			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			const event = onResult.mock.calls[0][0] as SpeechRecognitionEvent
			expect(typeof event.results.item).toBe('function')
			expect(event.results.length).toBe(2)
			expect(event.results.item(0).isFinal).toBe(true)
			expect(event.results.item(0).item(0).transcript).toBe('hello')
			expect(event.results.item(1).isFinal).toBe(true)
			expect(event.results.item(1).item(0).transcript).toBe('world')
		})

		it('preserves real confidence per utterance in the aggregated event', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello', [{ transcript: 'hello', confidence: 0.82 }])
			instance.say('world', [{ transcript: 'world', confidence: 0.91 }])
			vocal.stop()

			const event = onResult.mock.calls[0][0] as SpeechRecognitionEvent
			expect(event.results[0][0].confidence).toBe(0.82)
			expect(event.results[1][0].confidence).toBe(0.91)
		})

		it('preserves all alternatives per utterance in the aggregated event', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true, maxAlternatives: 3 })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello', [
				{ transcript: 'hello', confidence: 0.9 },
				{ transcript: 'helo', confidence: 0.6 },
				{ transcript: 'hell', confidence: 0.4 },
			])
			instance.say('world', [
				{ transcript: 'world', confidence: 0.8 },
				{ transcript: 'whirl', confidence: 0.5 },
			])
			vocal.stop()

			const event = onResult.mock.calls[0][0] as SpeechRecognitionEvent
			expect(event.results[0].length).toBe(3)
			expect(Array.from(event.results[0]).map((a) => a.transcript)).toEqual(['hello', 'helo', 'hell'])
			expect(event.results[1].length).toBe(2)
			expect(Array.from(event.results[1]).map((a) => a.transcript)).toEqual(['world', 'whirl'])
		})

		it('emits a synthetic result event with the joined final transcripts', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('hello')
			instance.say('world')

			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('does not emit when no final result was received', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal } = setup()
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			vocal.stop()

			expect(onResult).not.toHaveBeenCalled()
		})

		it('ignores non-final (interim) results', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			instance.say('partial', undefined, { isFinal: false })
			instance.say('final', undefined, { isFinal: true })

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'partial', ['partial'])

			vocal.stop()

			expect(onResult).toHaveBeenCalledTimes(2)
			expect(onResult).toHaveBeenLastCalledWith(expect.any(Event), 'final', ['final'])
		})

		it('does not emit on abort() and clears the buffer', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			instance.say('hello')

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)

			vocal.abort()

			expect(onResult).not.toHaveBeenCalled()
		})

		it('resets the buffer on subsequent start() so each session aggregates independently', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			instance.say('first')
			vocal.stop()

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)
			await vocal.start()

			instance.say('second')
			vocal.stop()

			expect(onResult).toHaveBeenLastCalledWith(expect.any(Event), 'second', ['second'])
		})

		it('aggregates results captured across silent restart cycles', async () => {
			vi.useFakeTimers()
			try {
				vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
				const { vocal, instance } = setup({ continuous: true })
				await vocal.start()

				instance.say('hello')
				;(instance.addEventListener.mock.calls as [string, EventListener][])
					.filter(([type]) => type === 'end')
					.forEach(([, handler]) => handler(new Event('end')))
				await vi.advanceTimersByTimeAsync(1000)

				instance.say('again')

				const onResult = vi.fn()
				vocal.on(eventTypes.RESULT, onResult)
				vocal.stop()

				expect(onResult).toHaveBeenCalledTimes(1)
				expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello again', ['hello again'])
			} finally {
				vi.useRealTimers()
			}
		})

		it('falls back to the first alternative when confidence is missing', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			instance.say('hello', [
				{ transcript: 'hello' } as unknown as { transcript: string; confidence: number },
				{ transcript: 'helo' } as unknown as { transcript: string; confidence: number },
			])

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)
			vocal.stop()

			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello'])
		})

		it('picks the highest-confidence alternative when aggregating', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const { vocal, instance } = setup({ continuous: true })
			await vocal.start()

			instance.say('helo', [
				{ transcript: 'hello', confidence: 0.3 },
				{ transcript: 'helo', confidence: 0.9 },
			])

			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)
			vocal.stop()

			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'helo', ['helo'])
		})
	})

	describe('cleanup', () => {
		it('calls stop on the instance', () => {
			const { vocal, instance } = setup()
			vocal.cleanup()
			expect(instance.stop).toHaveBeenCalled()
		})

		it('stops forwarding events to user listeners after cleanup', () => {
			const onStart = vi.fn()
			const onEnd = vi.fn()
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, onStart)
			vocal.on(eventTypes.END, onEnd)
			vocal.cleanup()
			// cleanup() runs a final stop() (emitting a trailing 'end'); assert nothing flows afterwards.
			onStart.mockClear()
			onEnd.mockClear()
			instance.start()
			instance.stop()
			expect(onStart).not.toHaveBeenCalled()
			expect(onEnd).not.toHaveBeenCalled()
		})

		it('removes every native listener from the instance on cleanup', () => {
			const { vocal, instance } = setup()
			vocal.cleanup()
			const nativeTypes = [
				'end',
				'start',
				'error',
				'result',
				'audiostart',
				'audioend',
				'soundstart',
				'soundend',
				'speechstart',
				'speechend',
				'nomatch',
			]
			nativeTypes.forEach((type) =>
				expect(instance.removeEventListener).toHaveBeenCalledWith(type, expect.any(Function))
			)
		})
	})

	describe('custom engine', () => {
		const createMockEngine = (options: { supported?: boolean } = {}) => {
			const calls = {
				start: 0,
				stop: 0,
				abort: 0,
				cleanup: 0,
			}
			let recording = false
			let context: SpeechEngineContext | undefined
			const factory = ((ctx: SpeechEngineContext): SpeechEngineInstance => {
				context = ctx
				return {
					get isRecording() {
						return recording
					},
					async start() {
						recording = true
						calls.start++
					},
					stop() {
						recording = false
						calls.stop++
					},
					abort() {
						recording = false
						calls.abort++
					},
					cleanup() {
						recording = false
						calls.cleanup++
					},
				}
			}) as SpeechEngineFactory
			factory.isSupported = () => options.supported ?? true
			return { factory, calls, getContext: () => context! }
		}

		it('drives the provided engine factory instead of the default', async () => {
			const { factory, calls } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			await vocal.start()
			expect(calls.start).toBe(1)
			expect(vocal.isRecording).toBe(true)
			vocal.stop()
			expect(calls.stop).toBe(1)
			expect(vocal.isRecording).toBe(false)
		})

		it('passes the resolved options to the engine context', () => {
			const { factory, getContext } = createMockEngine()
			createVocal({ engine: factory, lang: 'fr-FR', continuous: true })
			expect(getContext().options).toEqual({
				grammars: null,
				lang: 'fr-FR',
				continuous: true,
				interimResults: false,
				maxAlternatives: 1,
			})
		})

		it('fans out the engine emit() to user listeners', () => {
			const { factory, getContext } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			const onResult = vi.fn()
			vocal.on(eventTypes.RESULT, onResult)
			const event = new Event(eventTypes.RESULT) as unknown as SpeechRecognitionEvent
			getContext().emit(eventTypes.RESULT, event, 'hello', ['hello'])
			expect(onResult).toHaveBeenCalledWith(event, 'hello', ['hello'])
		})

		it('keeps notifying listeners when one of them throws', () => {
			const { factory, getContext } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			const boom = vi.fn(() => {
				throw new Error('boom')
			})
			const after = vi.fn()
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			vocal.on(eventTypes.RESULT, boom)
			vocal.on(eventTypes.RESULT, after)
			const event = new Event(eventTypes.RESULT) as unknown as SpeechRecognitionEvent
			getContext().emit(eventTypes.RESULT, event, 'hi', ['hi'])
			expect(boom).toHaveBeenCalled()
			expect(after).toHaveBeenCalled()
			expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
			errorSpy.mockRestore()
		})

		it('drives the core permission watch regardless of the engine', () => {
			vi.spyOn(userPermissionsUtils, 'watchPermission').mockImplementation((_name, onChange) => {
				onChange('granted')
				return Promise.resolve()
			})
			const { factory } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			const onPermission = vi.fn()
			vocal.on(eventTypes.PERMISSION, onPermission)
			expect(onPermission).toHaveBeenCalledWith(expect.any(Event), 'granted')
		})

		it('delegates abort and cleanup to the engine', () => {
			const { factory, calls } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			vocal.abort()
			expect(calls.abort).toBe(1)
			vocal.cleanup()
			expect(calls.cleanup).toBe(1)
		})

		it('ignores start/stop/abort and reports not recording after cleanup', async () => {
			const { factory, calls } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			vocal.cleanup()
			await vocal.start()
			vocal.stop()
			vocal.abort()
			expect(calls.start).toBe(0)
			expect(calls.stop).toBe(0)
			expect(calls.abort).toBe(0)
			expect(vocal.isRecording).toBe(false)
		})

		it('only tears the engine down once across repeated cleanup calls', () => {
			const { factory, calls } = createMockEngine()
			const vocal = createVocal({ engine: factory })
			vocal.cleanup()
			vocal.cleanup()
			expect(calls.cleanup).toBe(1)
		})

		it('reports support through the provided factory', () => {
			expect(isSupported(createMockEngine({ supported: true }).factory)).toBe(true)
			expect(isSupported(createMockEngine({ supported: false }).factory)).toBe(false)
		})
	})
})
