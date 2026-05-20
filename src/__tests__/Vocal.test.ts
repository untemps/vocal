import Vocal from '../Vocal'
import * as userPermissionsUtils from '@untemps/user-permissions-utils'

type MockFn = {
	(...args: unknown[]): unknown
	mock: { calls: unknown[][] }
}

type SayAlternative = string | { transcript: string; confidence: number }

interface MockInstance {
	say: ((sentence: string, alternatives?: SayAlternative[]) => void) & { mock: { calls: unknown[][] } }
	addEventListener: MockFn
	removeEventListener: MockFn
	start: MockFn
	stop: MockFn
	abort: MockFn
	[key: string]: unknown
}

const mockInstance = (wrapper: Vocal) => (wrapper as unknown as { _instance: MockInstance })._instance
const mockStream = 'stream' as unknown as MediaStream
const mockNull = null as unknown as MediaStream

describe('Vocal', () => {
	describe('isSupported', () => {
		it('returns true when SpeechRecognition, permissions and mediaDevices are all supported', () => {
			expect(Vocal.isSupported).toBe(true)
		})

		it('returns false when navigator.permissions is not supported', () => {
			vi.spyOn(userPermissionsUtils, 'isNavigatorPermissionsSupported').mockReturnValueOnce(false)
			expect(Vocal.isSupported).toBe(false)
		})

		it('returns false when navigator.mediaDevices is not supported', () => {
			vi.spyOn(userPermissionsUtils, 'isNavigatorMediaDevicesSupported').mockReturnValueOnce(false)
			expect(Vocal.isSupported).toBe(false)
		})

		it('throws when setting isSupported directly', () => {
			expect(() => (Vocal.isSupported = false)).toThrow()
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
				expect(Vocal.isSupported).toBe(false)
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
				expect(() => Vocal.isSupported).not.toThrow()
				expect(Vocal.isSupported).toBe(false)
			})
		})
	})

	describe('constructor', () => {
		it('applies default options', () => {
			const wrapper = new Vocal()
			expect(mockInstance(wrapper).lang).toBe('en-US')
			expect(mockInstance(wrapper).continuous).toBe(false)
			expect(mockInstance(wrapper).interimResults).toBe(false)
			expect(mockInstance(wrapper).maxAlternatives).toBe(1)
		})

		it('applies custom options', () => {
			const wrapper = new Vocal({ lang: 'fr-FR', continuous: true })
			expect(mockInstance(wrapper).lang).toBe('fr-FR')
			expect(mockInstance(wrapper).continuous).toBe(true)
		})

		it('assigns SpeechGrammarList instance when grammars is null and SpeechGrammarList is available', () => {
			const wrapper = new Vocal()
			expect(mockInstance(wrapper).grammars).not.toBeNull()
		})

		it('uses provided grammars value when non-null', () => {
			const grammars = { items: [] } as unknown as SpeechGrammarList
			const wrapper = new Vocal({ grammars })
			expect(mockInstance(wrapper).grammars).toBe(grammars)
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
				expect(() => new Vocal()).toThrow(DOMException)
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
				const wrapper = new Vocal()
				expect(mockInstance(wrapper).grammars).toBeNull()
			})
		})
	})

	describe('isRecording', () => {
		it('returns false by default', () => {
			const wrapper = new Vocal()
			expect(wrapper.isRecording).toBe(false)
		})

		it('returns true after a successful start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			expect(wrapper.isRecording).toBe(true)
		})

		it.each([
			['stop', (w: Vocal) => w.stop()],
			['abort', (w: Vocal) => w.abort()],
		] as const)('returns false after %s', async (_, action) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			action(wrapper)
			expect(wrapper.isRecording).toBe(false)
		})

		it('returns false when end event fires', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			mockInstance(wrapper)
				.addEventListener.mock.calls.filter(([type]: string[]) => type === 'end')
				.forEach(([, handler]: [string, EventListener]) => handler(new Event('end')))
			expect(wrapper.isRecording).toBe(false)
		})

		it('throws when setting isRecording directly', () => {
			const wrapper = new Vocal()
			expect(() => (wrapper.isRecording = true)).toThrow()
		})
	})

	describe('start', () => {
		it('calls instance.start when getUserMediaStream returns a stream', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			expect(mockInstance(wrapper).start).toHaveBeenCalled()
		})

		it('rejects when getUserMediaStream returns null', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockNull)
			const wrapper = new Vocal()
			await expect(wrapper.start()).rejects.toThrow('Unable to retrieve the stream from media device')
			expect(wrapper.isRecording).toBe(false)
		})

		it('rejects when getUserMediaStream throws', async () => {
			const error = new Error('foo')
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementationOnce(() => {
				throw error
			})
			const wrapper = new Vocal()
			await expect(wrapper.start()).rejects.toThrow(error)
			expect(wrapper.isRecording).toBe(false)
		})

		it('does nothing when instance is null', async () => {
			const wrapper = new Vocal()
			const instance = mockInstance(wrapper)
			wrapper.cleanup()
			await wrapper.start()
			expect(instance.start).not.toHaveBeenCalled()
		})

		it('returns this for chaining', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			expect(await wrapper.start()).toBe(wrapper)
		})

		it('resolves when getUserMediaStream is aborted', async () => {
			const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValueOnce(abortError)
			const wrapper = new Vocal()
			await expect(wrapper.start()).resolves.toBe(wrapper)
		})

		it('forwards signal to getUserMediaStream when provided', async () => {
			const spy = vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const signal = new AbortController().signal
			const wrapper = new Vocal()
			await wrapper.start({ signal })
			expect(spy).toHaveBeenCalledWith('microphone', { audio: true }, { signal })
		})

		it('calls getUserMediaStream without signal when not provided', async () => {
			const spy = vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			expect(spy).toHaveBeenCalledWith('microphone', { audio: true }, { signal: undefined })
		})
	})

	describe('stop', () => {
		it('calls instance.stop', () => {
			const wrapper = new Vocal()
			wrapper.stop()
			expect(mockInstance(wrapper).stop).toHaveBeenCalled()
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.stop()).toBe(wrapper)
		})

		it('does nothing when instance is null', () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			expect(() => wrapper.stop()).not.toThrow()
		})
	})

	describe('abort', () => {
		it('calls instance.abort', () => {
			const wrapper = new Vocal()
			wrapper.abort()
			expect(mockInstance(wrapper).abort).toHaveBeenCalled()
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.abort()).toBe(wrapper)
		})

		it('does nothing when instance is null', () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			expect(() => wrapper.abort()).not.toThrow()
		})
	})

	describe('addEventListener', () => {
		it('registers and calls callback for non-RESULT events', () => {
			const onStart = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart)
			mockInstance(wrapper).start()
			expect(onStart).toHaveBeenCalled()
		})

		it('passes best transcript and alternatives array for RESULT events', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			mockInstance(wrapper).say('hello world')
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('passes all alternatives when multiple are available', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			mockInstance(wrapper).say('hello', ['hello', 'helo', 'hell'])
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello', 'helo', 'hell'])
		})

		it('falls back to first alternative when confidence is unavailable', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), {
				resultIndex: 0,
				results: [[{ transcript: 'hello' }, { transcript: 'helo' }, { transcript: 'hell' }]],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello', 'helo', 'hell'])
		})

		it('selects the alternative with highest confidence as best transcript', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			mockInstance(wrapper).say('helo', [
				{ transcript: 'hello', confidence: 0.7 },
				{ transcript: 'helo', confidence: 0.9 },
				{ transcript: 'hell', confidence: 0.5 },
			])
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'helo', ['hello', 'helo', 'hell'])
		})

		it('uses resultIndex to select the current result in continuous mode', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), {
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
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), {
				resultIndex: 5,
				results: [[{ transcript: 'hello', confidence: 0.9 }]],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult.mock.calls[0]).toHaveLength(1)
		})

		it('does not pass transcript for RESULT events with empty results', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).findLast(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), { results: [] })
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult.mock.calls[0]).toHaveLength(1)
		})

		it('stacks multiple listeners for the same event type', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart1)
			wrapper.addEventListener(Vocal.eventTypes.START, onStart2)
			mockInstance(wrapper).start()
			expect(onStart1).toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('removes a specific listener by callback reference', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart1)
			wrapper.addEventListener(Vocal.eventTypes.START, onStart2)
			wrapper.removeEventListener(Vocal.eventTypes.START, onStart1)
			mockInstance(wrapper).start()
			expect(onStart1).not.toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('throws on invalid event types', () => {
			const wrapper = new Vocal()
			expect(() => wrapper.addEventListener('invalid-type', vi.fn())).toThrow('Unknown event type "invalid-type"')
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())).toBe(wrapper)
		})

		it('does nothing when instance is null', () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			expect(() => wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())).not.toThrow()
		})
	})

	describe('removeEventListener', () => {
		it('calls removeEventListener on the underlying instance', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())
			wrapper.removeEventListener(Vocal.eventTypes.START)
			expect(mockInstance(wrapper).removeEventListener).toHaveBeenCalled()
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())
			expect(wrapper.removeEventListener(Vocal.eventTypes.START)).toBe(wrapper)
		})

		it('does nothing when instance is null', () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			expect(() => wrapper.removeEventListener(Vocal.eventTypes.START)).not.toThrow()
		})

		it('throws on invalid event types', () => {
			const wrapper = new Vocal()
			expect(() => wrapper.removeEventListener('invalid-type')).toThrow('Unknown event type "invalid-type"')
		})

		it('does nothing when callback was never registered', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())
			expect(() => wrapper.removeEventListener(Vocal.eventTypes.START, vi.fn())).not.toThrow()
		})

		it('cleans up the listener entry when last callback is removed by reference', () => {
			const onStart = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart)
			wrapper.removeEventListener(Vocal.eventTypes.START, onStart)
			mockInstance(wrapper).start()
			expect(onStart).not.toHaveBeenCalled()
		})
	})

	describe('once', () => {
		it('fires callback only on the first event', () => {
			const onStart = vi.fn()
			const wrapper = new Vocal()
			wrapper.once(Vocal.eventTypes.START, onStart)
			mockInstance(wrapper).start()
			mockInstance(wrapper).start()
			expect(onStart).toHaveBeenCalledTimes(1)
		})

		it('removes the listener after first fire', () => {
			const onStart = vi.fn()
			const wrapper = new Vocal()
			wrapper.once(Vocal.eventTypes.START, onStart)
			mockInstance(wrapper).start()
			expect(mockInstance(wrapper).removeEventListener).toHaveBeenCalled()
		})

		it('throws on invalid event types', () => {
			const wrapper = new Vocal()
			expect(() => wrapper.once('invalid-type', vi.fn())).toThrow('Unknown event type "invalid-type"')
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.once(Vocal.eventTypes.START, vi.fn())).toBe(wrapper)
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
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('does not restart when continuous is false', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: false })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('does not restart after explicit stop()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			wrapper.stop()
			const startCallsAfterStop = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(startCallsAfterStop)
		})

		it('does not restart after explicit abort()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			wrapper.abort()
			const startCallsAfterAbort = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(startCallsAfterAbort)
		})

		it('throttles restart to at least 1000ms after last start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000 - 1)
			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)

			await vi.advanceTimersByTimeAsync(1)
			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('restarts immediately when more than 1000ms have elapsed since last start', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			await vi.advanceTimersByTimeAsync(1000 + 500)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(0)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('cancels the scheduled restart when stop() is called during the throttle window', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			wrapper.stop()
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('disables auto-restart on not-allowed error', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, 'not-allowed')
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
			expect(wrapper.isRecording).toBe(false)
		})

		it.each(['service-not-allowed', 'audio-capture'])('disables auto-restart on %s error', async (errorType) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, errorType)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it.each(['no-speech', 'network'])('keeps auto-restart active on transient %s error', async (errorType) => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireError(instance, errorType)
			fireEnd(instance)
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls + 1)
		})

		it('does not propagate intermediate end events to user listeners', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const onEnd = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.END, onEnd)

			fireEnd(mockInstance(wrapper))
			await vi.advanceTimersByTimeAsync(1000)

			expect(onEnd).not.toHaveBeenCalled()
		})

		it('does not propagate the restart start event to user listeners', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const onStart = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart)

			fireEnd(mockInstance(wrapper))
			await vi.advanceTimersByTimeAsync(1000)

			expect(onStart).not.toHaveBeenCalled()
		})

		it('still propagates end on explicit stop in continuous mode', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const onEnd = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.END, onEnd)

			wrapper.stop()

			expect(onEnd).toHaveBeenCalledTimes(1)
		})

		it('keeps isRecording true during the restart window', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()

			fireEnd(mockInstance(wrapper))
			expect(wrapper.isRecording).toBe(true)

			await vi.advanceTimersByTimeAsync(1000)
			expect(wrapper.isRecording).toBe(true)
		})

		it('cancels the scheduled restart on cleanup()', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)
			const initialStartCalls = (instance.start as MockFn).mock.calls.length

			fireEnd(instance)
			wrapper.cleanup()
			await vi.advanceTimersByTimeAsync(1000)

			expect((instance.start as MockFn).mock.calls.length).toBe(initialStartCalls)
		})

		it('resets isRecording when the engine throws on restart', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			fireEnd(instance)
			;(instance.start as unknown as { mockImplementationOnce: (fn: () => void) => void }).mockImplementationOnce(
				() => {
					throw new Error('InvalidStateError')
				}
			)

			await vi.advanceTimersByTimeAsync(1000)

			expect(wrapper.isRecording).toBe(false)
		})
	})

	describe('aggregated result on stop()', () => {
		it('emits a synthetic result event with the joined final transcripts', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)

			instance.say('hello')
			instance.say('world')
			onResult.mockClear()

			wrapper.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world', ['hello world'])
		})

		it('does not emit when no final result was received', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)

			wrapper.stop()

			expect(onResult).not.toHaveBeenCalled()
		})

		it('ignores non-final (interim) results', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)

			instance.say('partial', undefined, { isFinal: false })
			instance.say('final', undefined, { isFinal: true })
			onResult.mockClear()

			wrapper.stop()

			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'final', ['final'])
		})

		it('does not emit on abort() and clears the buffer', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			instance.say('hello')

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)

			wrapper.abort()

			expect(onResult).not.toHaveBeenCalled()
		})

		it('resets the buffer on subsequent start() so each session aggregates independently', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			instance.say('first')
			wrapper.stop()

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			await wrapper.start()

			instance.say('second')
			wrapper.stop()

			expect(onResult).toHaveBeenLastCalledWith(expect.any(Event), 'second', ['second'])
		})

		it('aggregates results captured across silent restart cycles', async () => {
			vi.useFakeTimers()
			try {
				vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
				const wrapper = new Vocal({ continuous: true })
				await wrapper.start()
				const instance = mockInstance(wrapper)

				instance.say('hello')
				;(instance.addEventListener.mock.calls as [string, EventListener][])
					.filter(([type]) => type === 'end')
					.forEach(([, handler]) => handler(new Event('end')))
				await vi.advanceTimersByTimeAsync(1000)

				instance.say('again')

				const onResult = vi.fn()
				wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
				wrapper.stop()

				expect(onResult).toHaveBeenCalledTimes(1)
				expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello again', ['hello again'])
			} finally {
				vi.useRealTimers()
			}
		})

		it('falls back to the first alternative when confidence is missing', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			instance.say('hello', [
				{ transcript: 'hello' } as unknown as { transcript: string; confidence: number },
				{ transcript: 'helo' } as unknown as { transcript: string; confidence: number },
			])

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			wrapper.stop()

			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello'])
		})

		it('picks the highest-confidence alternative when aggregating', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal({ continuous: true })
			await wrapper.start()
			const instance = mockInstance(wrapper)

			instance.say('helo', [
				{ transcript: 'hello', confidence: 0.3 },
				{ transcript: 'helo', confidence: 0.9 },
			])

			const onResult = vi.fn()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			wrapper.stop()

			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'helo', ['helo'])
		})
	})

	describe('cleanup', () => {
		let wrapper: Vocal
		let instance: MockInstance

		beforeEach(() => {
			wrapper = new Vocal()
			instance = mockInstance(wrapper)
		})

		it('calls stop on the instance', () => {
			wrapper.cleanup()
			expect(instance.stop).toHaveBeenCalled()
		})

		it('removes all registered listeners', () => {
			wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())
			wrapper.addEventListener(Vocal.eventTypes.END, vi.fn())
			wrapper.cleanup()
			expect(instance.removeEventListener).toHaveBeenCalledTimes(6)
		})

		it('removes the internal end, start, error and result listeners on cleanup', () => {
			wrapper.cleanup()
			expect(instance.removeEventListener).toHaveBeenCalledWith('end', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('start', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
			expect(instance.removeEventListener).toHaveBeenCalledWith('result', expect.any(Function))
		})

		it('nulls the instance', () => {
			wrapper.cleanup()
			expect(mockInstance(wrapper)).toBeNull()
		})

		it('returns this for chaining', () => {
			expect(wrapper.cleanup()).toBe(wrapper)
		})
	})
})
