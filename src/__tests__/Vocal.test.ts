import { createVocal, isSupported, eventTypes, type VocalInstance } from '../Vocal'
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

const mockStream = 'stream' as unknown as MediaStream
const mockNull = null as unknown as MediaStream

describe('Vocal', () => {
	describe('isSupported', () => {
		it('returns true when SpeechRecognition, permissions and mediaDevices are all supported', () => {
			expect(isSupported()).toBe(true)
		})

		it('returns false when navigator.permissions is not supported', () => {
			vi.spyOn(userPermissionsUtils, 'isNavigatorPermissionsSupported').mockReturnValueOnce(false)
			expect(isSupported()).toBe(false)
		})

		it('returns false when navigator.mediaDevices is not supported', () => {
			vi.spyOn(userPermissionsUtils, 'isNavigatorMediaDevicesSupported').mockReturnValueOnce(false)
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

		it('rejects when getUserMediaStream returns null', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockNull)
			const { vocal } = setup()
			await expect(vocal.start()).rejects.toThrow('Unable to retrieve the stream from media device')
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
		it('calls removeEventListener on the underlying instance', () => {
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, vi.fn())
			vocal.off(eventTypes.START)
			expect(instance.removeEventListener).toHaveBeenCalled()
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

		it('removes all registered listeners', () => {
			const { vocal, instance } = setup()
			vocal.on(eventTypes.START, vi.fn())
			vocal.on(eventTypes.END, vi.fn())
			vocal.cleanup()
			expect(instance.removeEventListener).toHaveBeenCalledTimes(6)
		})

		it('removes the internal end, start, error and result listeners on cleanup', () => {
			const { vocal, instance } = setup()
			vocal.cleanup()
			expect(instance.removeEventListener).toHaveBeenCalledWith('end', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('start', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('result', expect.any(Function))
		})
	})
})
