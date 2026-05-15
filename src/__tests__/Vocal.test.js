import Vocal from '../Vocal'
import * as userPermissionsUtils from '@untemps/user-permissions-utils'

describe('Vocal', () => {
	describe('isSupported', () => {
		it('returns true when SpeechRecognition, permissions and mediaDevices are all supported', () => {
			expect(Vocal.isSupported).toBe(true)
		})

		it('returns false when SpeechRecognition is not available', () => {
			const original = window.SpeechRecognition
			window.SpeechRecognition = undefined
			expect(Vocal.isSupported).toBe(false)
			window.SpeechRecognition = original
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
	})

	describe('constructor', () => {
		it('throws DOMException when SpeechRecognition is not available', () => {
			const original = window.SpeechRecognition
			window.SpeechRecognition = undefined
			expect(() => new Vocal()).toThrow(DOMException)
			window.SpeechRecognition = original
		})

		it('applies default options', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance.lang).toBe('en-US')
			expect(wrapper.instance.continuous).toBe(false)
			expect(wrapper.instance.interimResults).toBe(false)
			expect(wrapper.instance.maxAlternatives).toBe(1)
		})

		it('applies custom options', () => {
			const wrapper = new Vocal({ lang: 'fr-FR', continuous: true })
			expect(wrapper.instance.lang).toBe('fr-FR')
			expect(wrapper.instance.continuous).toBe(true)
		})

		it('assigns SpeechGrammarList instance when grammars is null and SpeechGrammarList is available', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance.grammars).toBeDefined()
			expect(wrapper.instance.grammars).not.toBeNull()
		})

		it('leaves grammars null when SpeechGrammarList is not available', () => {
			const original = window.SpeechGrammarList
			window.SpeechGrammarList = undefined
			const wrapper = new Vocal()
			expect(wrapper.instance.grammars).toBeNull()
			window.SpeechGrammarList = original
		})

		it('uses provided grammars value when non-null', () => {
			const grammars = { items: [] }
			const wrapper = new Vocal({ grammars })
			expect(wrapper.instance.grammars).toBe(grammars)
		})
	})

	describe('instance', () => {
		it('returns the internal SpeechRecognition instance', () => {
			const wrapper = new Vocal()
			expect(wrapper.instance).toBeDefined()
		})

		it('throws when setting instance directly', () => {
			const wrapper = new Vocal()
			expect(() => (wrapper.instance = null)).toThrow()
		})
	})

	describe('start', () => {
		it('calls instance.start when getUserMediaStream returns a stream', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce('stream')
			const wrapper = new Vocal()
			await wrapper.start()
			expect(wrapper.instance.start).toHaveBeenCalled()
		})

		it('calls error handler when getUserMediaStream returns null', async () => {
			const onError = vi.fn()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(null)
			const wrapper = new Vocal()
			wrapper.addEventListener('error', onError)
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
			wrapper.addEventListener('error', onError)
			await wrapper.start()
			expect(onError).toHaveBeenCalledWith(error)
		})

		it('does not throw when getUserMediaStream fails and no error handler is registered', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce(null)
			const wrapper = new Vocal()
			await expect(wrapper.start()).resolves.toBe(wrapper)
		})

		it('does nothing when instance is null', async () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			await expect(wrapper.start()).resolves.toBe(wrapper)
		})

		it('returns this for chaining', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValueOnce('stream')
			const wrapper = new Vocal()
			expect(await wrapper.start()).toBe(wrapper)
		})
	})

	describe('stop', () => {
		it('calls instance.stop', () => {
			const wrapper = new Vocal()
			wrapper.stop()
			expect(wrapper.instance.stop).toHaveBeenCalled()
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
			expect(wrapper.instance.abort).toHaveBeenCalled()
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
			wrapper.addEventListener('start', onStart)
			wrapper.instance.start()
			expect(onStart).toHaveBeenCalled()
		})

		it('passes transcript as extra argument for RESULT events', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener('result', onResult)
			wrapper.instance.say('hello world')
			expect(onResult).toHaveBeenCalledWith(expect.any(Event), 'hello world')
		})

		it('does not pass transcript for RESULT events with empty results', () => {
			const onResult = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener('result', onResult)
			const [, handler] = wrapper.instance.addEventListener.mock.calls.find(([type]) => type === 'result')
			const event = new Event('result')
			event.results = []
			handler(event)
			expect(onResult).toHaveBeenCalledWith(event)
			expect(onResult).not.toHaveBeenCalledWith(expect.anything(), expect.any(String))
		})

		it('replaces existing listener when same event type is added twice', () => {
			const onStart1 = vi.fn()
			const onStart2 = vi.fn()
			const wrapper = new Vocal()
			wrapper.addEventListener('start', onStart1)
			wrapper.addEventListener('start', onStart2)
			wrapper.instance.start()
			expect(onStart1).not.toHaveBeenCalled()
			expect(onStart2).toHaveBeenCalled()
		})

		it('ignores invalid event types', () => {
			const cb = vi.fn()
			const wrapper = new Vocal()
			const callsBefore = wrapper.instance.addEventListener.mock.calls.length
			wrapper.addEventListener('invalid-type', cb)
			expect(wrapper.instance.addEventListener.mock.calls.length).toBe(callsBefore)
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.addEventListener('start', vi.fn())).toBe(wrapper)
		})
	})

	describe('removeEventListener', () => {
		it('calls removeEventListener on the underlying instance', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener('start', vi.fn())
			wrapper.removeEventListener('start')
			expect(wrapper.instance.removeEventListener).toHaveBeenCalled()
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener('start', vi.fn())
			expect(wrapper.removeEventListener('start')).toBe(wrapper)
		})
	})

	describe('cleanup', () => {
		it('calls stop on the instance', () => {
			const wrapper = new Vocal()
			const instance = wrapper.instance
			wrapper.cleanup()
			expect(instance.stop).toHaveBeenCalled()
		})

		it('removes all registered listeners', () => {
			const wrapper = new Vocal()
			wrapper.addEventListener('start', vi.fn())
			wrapper.addEventListener('end', vi.fn())
			const instance = wrapper.instance
			wrapper.cleanup()
			expect(instance.removeEventListener).toHaveBeenCalledTimes(2)
		})

		it('nulls the instance', () => {
			const wrapper = new Vocal()
			wrapper.cleanup()
			expect(wrapper.instance).toBeNull()
		})

		it('returns this for chaining', () => {
			const wrapper = new Vocal()
			expect(wrapper.cleanup()).toBe(wrapper)
		})
	})
})
