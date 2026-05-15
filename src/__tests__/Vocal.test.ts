import Vocal from '../Vocal'
import * as userPermissionsUtils from '@untemps/user-permissions-utils'

type MockFn = {
	(...args: unknown[]): unknown
	mock: { calls: unknown[][] }
}

interface MockInstance {
	say: MockFn
	addEventListener: MockFn
	removeEventListener: MockFn
	start: MockFn
	stop: MockFn
	abort: MockFn
	[key: string]: unknown
}

const mockInstance = (wrapper: Vocal) => wrapper.instance as unknown as MockInstance
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
	})

	describe('constructor', () => {
		it('applies default options', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance!.lang).toBe('en-US')
			expect(wrapper.instance!.continuous).toBe(false)
			expect(wrapper.instance!.interimResults).toBe(false)
			expect(wrapper.instance!.maxAlternatives).toBe(1)
		})

		it('applies custom options', () => {
			const wrapper = new Vocal({ lang: 'fr-FR', continuous: true })
			expect(wrapper.instance!.lang).toBe('fr-FR')
			expect(wrapper.instance!.continuous).toBe(true)
		})

		it('assigns SpeechGrammarList instance when grammars is null and SpeechGrammarList is available', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance!.grammars).not.toBeNull()
		})

		it('uses provided grammars value when non-null', () => {
			const grammars = { items: [] } as unknown as SpeechGrammarList
			const wrapper = new Vocal({ grammars })
			expect(wrapper.instance!.grammars).toBe(grammars)
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
				expect(wrapper.instance!.grammars).toBeNull()
			})
		})
	})

	describe('instance', () => {
		it('returns the internal SpeechRecognition instance', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance).not.toBeNull()
		})

		it('throws when setting instance directly', () => {
			const wrapper = new Vocal()
			expect(() => (wrapper.instance = null)).toThrow()
		})
	})

	describe('start', () => {
		it('calls instance.start when getUserMediaStream returns a stream', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockStream)
			const wrapper = new Vocal()
			await wrapper.start()
			expect(mockInstance(wrapper).start).toHaveBeenCalled()
		})

		it('calls error handler when getUserMediaStream returns null', async () => {
			const onError = vi.fn()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockNull)
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.ERROR, onError)
			await wrapper.start()
			expect(onError).toHaveBeenCalledWith(new Error('Unable to retrieve the stream from media device'))
		})

		it('calls error handler when getUserMediaStream throws', async () => {
			const onError = vi.fn()
			const error = new Error('foo')
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementationOnce(() => {
				throw error
			})
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.ERROR, onError)
			await wrapper.start()
			expect(onError).toHaveBeenCalledWith(error)
		})

		it('does not throw when getUserMediaStream fails and no error handler is registered', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(mockNull)
			const wrapper = new Vocal()
			await expect(wrapper.start()).resolves.toBe(wrapper)
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

		it('passes transcript and alternatives array for RESULT events', () => {
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
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).find(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), {
				results: [
					[{ transcript: 'hello' }, { transcript: 'helo' }, { transcript: 'hell' }],
				],
			})
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello', ['hello', 'helo', 'hell'])
		})

		it('does not pass transcript for RESULT events with empty results', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.RESULT, onResult)
			const [, handler] = (mockInstance(wrapper).addEventListener.mock.calls as string[][]).find(
				([type]) => type === Vocal.eventTypes.RESULT
			)!
			const event = Object.assign(new Event(Vocal.eventTypes.RESULT), { results: [] })
			;(handler as unknown as (e: Event) => void)(event)
			expect(onResult).toHaveBeenCalledTimes(1)
			expect(onResult.mock.calls[0]).toHaveLength(1)
		})

		it('replaces existing listener when same event type is added twice', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener(Vocal.eventTypes.START, onStart1)
			wrapper.addEventListener(Vocal.eventTypes.START, onStart2)
			expect(mockInstance(wrapper).removeEventListener).toHaveBeenCalledTimes(1)
			mockInstance(wrapper).start()
			expect(onStart1).not.toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('ignores invalid event types', () => {
			const cb = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener('invalid-type', cb)
			expect(mockInstance(wrapper).addEventListener).not.toHaveBeenCalledWith(
				'invalid-type',
				expect.any(Function)
			)
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.addEventListener(Vocal.eventTypes.START, vi.fn())).toBe(wrapper)
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
			expect(instance.removeEventListener).toHaveBeenCalledTimes(2)
		})

		it('nulls the instance', () => {
			wrapper.cleanup()
			expect(wrapper.instance).toBeNull()
		})

		it('returns this for chaining', () => {
			expect(wrapper.cleanup()).toBe(wrapper)
		})
	})
})
