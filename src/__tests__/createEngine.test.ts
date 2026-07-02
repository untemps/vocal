import * as userPermissionsUtils from '@untemps/user-permissions-utils'
import { createEngine, type EngineBackend, type EngineConnectContext, type EngineSession } from '../createEngine'
import type { SpeechEngineContext, VocalOptions } from '../types'

type EmittedEvent = { type: string; payload: unknown[] }

const makeContext = (options: Partial<Required<VocalOptions>> = {}) => {
	const events: EmittedEvent[] = []
	const emit = ((type: string, ...payload: unknown[]) => {
		events.push({ type, payload })
	}) as SpeechEngineContext['emit']
	const resolved: Required<VocalOptions> = {
		grammars: null,
		lang: 'fr-FR',
		continuous: false,
		interimResults: false,
		maxAlternatives: 1,
		...options,
	}
	const context: SpeechEngineContext = { options: resolved, emit }
	return { context, events }
}

const makeStream = () => {
	const stop = vi.fn()
	const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
	return { stream, stop }
}

const typesOf = (events: EmittedEvent[]): string[] => events.map((event) => event.type)
const lastOf = (events: EmittedEvent[], type: string): unknown[] | undefined =>
	[...events].reverse().find((event) => event.type === type)?.payload
const countOf = (events: EmittedEvent[], type: string): number => events.filter((event) => event.type === type).length

const setupEngine = (options: Partial<Required<VocalOptions>> = {}) => {
	const { stream, stop } = makeStream()
	vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
	const session: EngineSession = { stop: vi.fn(), abort: vi.fn() }
	let captured: EngineConnectContext | undefined
	const connect = vi.fn(async (ctx: EngineConnectContext): Promise<EngineSession> => {
		captured = ctx
		return session
	})
	const backend: EngineBackend = { isSupported: () => true, connect }
	const { context, events } = makeContext(options)
	const instance = createEngine(backend)(context)
	return { instance, connect, session, events, streamStop: stop, ctx: () => captured! }
}

describe('createEngine', () => {
	describe('start', () => {
		it('acquires the mic, connects, and emits start', async () => {
			const { instance, connect, events } = setupEngine()
			await instance.start()
			expect(connect).toHaveBeenCalledTimes(1)
			expect(instance.isRecording).toBe(true)
			expect(typesOf(events)).toContain('start')
		})

		it('passes the reduced language, resolved options, and stream to connect', async () => {
			const { instance, ctx } = setupEngine({ lang: 'en-GB', continuous: true })
			await instance.start()
			expect(ctx().language).toBe('en')
			expect(ctx().options.continuous).toBe(true)
			expect(ctx().stream).toBeDefined()
		})

		it('falls back to the raw lang when the leading segment is empty', async () => {
			const { instance, ctx } = setupEngine({ lang: '-x' })
			await instance.start()
			expect(ctx().language).toBe('-x')
		})

		it('ignores a second start while already recording', async () => {
			const { instance, connect } = setupEngine()
			await instance.start()
			await instance.start()
			expect(connect).toHaveBeenCalledTimes(1)
		})

		it('ignores a concurrent start while one is already in flight', async () => {
			const session: EngineSession = { stop: vi.fn(), abort: vi.fn() }
			let release!: (stream: MediaStream) => void
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockReturnValue(
				new Promise<MediaStream>((resolve) => {
					release = resolve
				})
			)
			const connect = vi.fn(async (): Promise<EngineSession> => session)
			const backend: EngineBackend = { connect }
			const { context } = makeContext()
			const instance = createEngine(backend)(context)
			const first = instance.start()
			const second = instance.start()
			release(makeStream().stream)
			await Promise.all([first, second])
			expect(connect).toHaveBeenCalledTimes(1)
		})

		it('stops the stream and skips connect when aborted before connecting', async () => {
			const controller = new AbortController()
			const { stream, stop } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockImplementation(async () => {
				controller.abort()
				return stream
			})
			const connect = vi.fn()
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			await instance.start({ signal: controller.signal })
			expect(connect).not.toHaveBeenCalled()
			expect(stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('aborts the session and skips start when aborted during connect', async () => {
			const controller = new AbortController()
			const { stream } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
			const session: EngineSession = { stop: vi.fn(), abort: vi.fn() }
			const connect = vi.fn(async (): Promise<EngineSession> => {
				controller.abort()
				return session
			})
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			await instance.start({ signal: controller.signal })
			expect(session.abort).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('stops the stream and skips connect when disposed before connecting', async () => {
			const { stream, stop } = makeStream()
			let releaseStream!: () => void
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockReturnValue(
				new Promise<MediaStream>((resolve) => {
					releaseStream = () => resolve(stream)
				})
			)
			const connect = vi.fn()
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			const pending = instance.start()
			instance.cleanup()
			releaseStream()
			await pending
			expect(connect).not.toHaveBeenCalled()
			expect(stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('aborts the session and skips start when disposed during connect', async () => {
			const { stream } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
			const session: EngineSession = { stop: vi.fn(), abort: vi.fn() }
			let release!: () => void
			let connectEntered!: () => void
			const entered = new Promise<void>((resolve) => {
				connectEntered = resolve
			})
			const connect = vi.fn(() => {
				connectEntered()
				return new Promise<EngineSession>((resolve) => {
					release = () => resolve(session)
				})
			})
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			const pending = instance.start()
			await entered
			instance.cleanup()
			release()
			await pending
			expect(session.abort).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('cancels the in-flight start on abort before connecting', async () => {
			const { stream, stop } = makeStream()
			let releaseStream!: () => void
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockReturnValue(
				new Promise<MediaStream>((resolve) => {
					releaseStream = () => resolve(stream)
				})
			)
			const connect = vi.fn()
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			const pending = instance.start()
			instance.abort()
			releaseStream()
			await pending
			expect(connect).not.toHaveBeenCalled()
			expect(stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('cancels the in-flight start on abort during connect', async () => {
			const { stream } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
			const session: EngineSession = { stop: vi.fn(), abort: vi.fn() }
			let release!: () => void
			let connectEntered!: () => void
			const entered = new Promise<void>((resolve) => {
				connectEntered = resolve
			})
			const connect = vi.fn(() => {
				connectEntered()
				return new Promise<EngineSession>((resolve) => {
					release = () => resolve(session)
				})
			})
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			const pending = instance.start()
			await entered
			instance.abort()
			release()
			await pending
			expect(session.abort).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('cancels the in-flight start on stop before connecting', async () => {
			const { stream, stop } = makeStream()
			let releaseStream!: () => void
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockReturnValue(
				new Promise<MediaStream>((resolve) => {
					releaseStream = () => resolve(stream)
				})
			)
			const connect = vi.fn()
			const backend: EngineBackend = { connect }
			const { context, events } = makeContext()
			const instance = createEngine(backend)(context)
			const pending = instance.start()
			instance.stop()
			releaseStream()
			await pending
			expect(connect).not.toHaveBeenCalled()
			expect(stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('start')
		})

		it('stops the stream and rethrows when connect fails', async () => {
			const { stream, stop } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
			const connect = vi.fn(async (): Promise<EngineSession> => {
				throw new Error('boom')
			})
			const backend: EngineBackend = { connect }
			const { context } = makeContext()
			const instance = createEngine(backend)(context)
			await expect(instance.start()).rejects.toThrow('boom')
			expect(stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
		})

		it('swallows an AbortError from connect', async () => {
			const { stream } = makeStream()
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockResolvedValue(stream)
			const error = new Error('aborted')
			error.name = 'AbortError'
			const connect = vi.fn(async (): Promise<EngineSession> => {
				throw error
			})
			const backend: EngineBackend = { connect }
			const { context } = makeContext()
			const instance = createEngine(backend)(context)
			await expect(instance.start()).resolves.toBeUndefined()
			expect(instance.isRecording).toBe(false)
		})

		it('swallows an AbortError from getUserMediaStream', async () => {
			const error = new Error('aborted')
			error.name = 'AbortError'
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValue(error)
			const connect = vi.fn()
			const backend: EngineBackend = { connect }
			const { context } = makeContext()
			const instance = createEngine(backend)(context)
			await expect(instance.start()).resolves.toBeUndefined()
			expect(connect).not.toHaveBeenCalled()
		})

		it('rethrows a non-abort getUserMediaStream error', async () => {
			vi.spyOn(userPermissionsUtils, 'getUserMediaStream').mockRejectedValue(new Error('denied'))
			const backend: EngineBackend = { connect: vi.fn() }
			const { context } = makeContext()
			const instance = createEngine(backend)(context)
			await expect(instance.start()).rejects.toThrow('denied')
		})
	})

	describe('transcripts', () => {
		it('emits a final transcript as a result in non-continuous mode', async () => {
			const { instance, ctx, events } = setupEngine({ continuous: false })
			await instance.start()
			ctx().emitTranscript('hello', { isFinal: true })
			expect(lastOf(events, 'result')).toEqual([expect.any(Event), 'hello', ['hello']])
		})

		it('shapes the result event with a lib.dom results list', async () => {
			const { instance, ctx, events } = setupEngine({ continuous: false })
			await instance.start()
			ctx().emitTranscript('hello', { isFinal: true })
			const event = lastOf(events, 'result')![0] as SpeechRecognitionEvent
			expect(event.resultIndex).toBe(0)
			expect(event.results.length).toBe(1)
			expect(event.results.item(0).isFinal).toBe(true)
			expect(event.results.item(0).item(0).transcript).toBe('hello')
		})

		it('aggregates final transcripts in continuous mode and flushes them on end', async () => {
			const { instance, ctx, events } = setupEngine({ continuous: true })
			await instance.start()
			ctx().emitTranscript('one', { isFinal: true })
			ctx().emitTranscript('two', { isFinal: true })
			expect(typesOf(events)).not.toContain('result')
			ctx().end({ flush: true })
			expect(lastOf(events, 'result')).toEqual([expect.any(Event), 'one two', ['one two']])
			expect(typesOf(events)).toContain('end')
		})

		it('drops interim transcripts unless interimResults is enabled', async () => {
			const { instance, ctx, events } = setupEngine({ interimResults: false })
			await instance.start()
			ctx().emitTranscript('partial', { isFinal: false })
			expect(typesOf(events)).not.toContain('result')
		})

		it('emits interim transcripts when interimResults is enabled', async () => {
			const { instance, ctx, events } = setupEngine({ interimResults: true })
			await instance.start()
			ctx().emitTranscript('partial', { isFinal: false })
			expect(lastOf(events, 'result')).toEqual([expect.any(Event), 'partial', ['partial']])
		})

		it('ignores an empty transcript', async () => {
			const { instance, ctx, events } = setupEngine()
			await instance.start()
			ctx().emitTranscript('', { isFinal: true })
			expect(typesOf(events)).not.toContain('result')
		})
	})

	describe('errors', () => {
		it('emits a well-formed error with the default code', async () => {
			const { instance, ctx, events } = setupEngine()
			await instance.start()
			ctx().emitError('went wrong')
			const event = lastOf(events, 'error')![0] as Event & { error: string; message: string }
			expect(event.error).toBe('network')
			expect(event.message).toBe('went wrong')
		})

		it('emits an error with a custom code', async () => {
			const { instance, ctx, events } = setupEngine()
			await instance.start()
			ctx().emitError('no audio', 'audio-capture')
			const event = lastOf(events, 'error')![0] as Event & { error: string }
			expect(event.error).toBe('audio-capture')
		})
	})

	describe('end', () => {
		it('emits end without a result when there is nothing to flush', async () => {
			const { instance, ctx, events } = setupEngine({ continuous: true })
			await instance.start()
			ctx().end({ flush: true })
			expect(typesOf(events)).not.toContain('result')
			expect(typesOf(events)).toContain('end')
		})

		it('emits end and discards the buffer when ending without flush', async () => {
			const { instance, ctx, events } = setupEngine({ continuous: true })
			await instance.start()
			ctx().emitTranscript('dropped', { isFinal: true })
			ctx().end()
			expect(typesOf(events)).not.toContain('result')
			expect(typesOf(events)).toContain('end')
		})

		it('does not emit end again once already ended', async () => {
			const { instance, ctx, events } = setupEngine()
			await instance.start()
			ctx().end()
			ctx().end()
			expect(countOf(events, 'end')).toBe(1)
		})
	})

	describe('stop, abort, cleanup', () => {
		it('reports not recording during the stop window and ends when the backend closes', async () => {
			const { instance, session, ctx, events } = setupEngine()
			await instance.start()
			instance.stop()
			expect(session.stop).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('end')
			ctx().end({ flush: true })
			expect(typesOf(events)).toContain('end')
		})

		it('ignores stop when not recording', () => {
			const { instance, session } = setupEngine()
			instance.stop()
			expect(session.stop).not.toHaveBeenCalled()
		})

		it('ignores a second stop during the stop window', async () => {
			const { instance, session } = setupEngine()
			await instance.start()
			instance.stop()
			instance.stop()
			expect(session.stop).toHaveBeenCalledTimes(1)
		})

		it('tears down and emits end on abort', async () => {
			const { instance, session, events } = setupEngine()
			await instance.start()
			instance.abort()
			expect(session.abort).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).toContain('end')
		})

		it('ignores abort when not recording', () => {
			const { instance, session, events } = setupEngine()
			instance.abort()
			expect(session.abort).not.toHaveBeenCalled()
			expect(typesOf(events)).not.toContain('end')
		})

		it('tears down quietly on cleanup', async () => {
			const { instance, session, events } = setupEngine()
			await instance.start()
			instance.cleanup()
			expect(session.abort).toHaveBeenCalled()
			expect(instance.isRecording).toBe(false)
			expect(typesOf(events)).not.toContain('end')
		})

		it('cleans up safely before any session exists', () => {
			const { instance, session } = setupEngine()
			expect(() => instance.cleanup()).not.toThrow()
			expect(session.abort).not.toHaveBeenCalled()
		})

		it('flushes the pending transcript and restarts during the stop window', async () => {
			const { instance, session, connect, ctx, events } = setupEngine({ continuous: true })
			await instance.start()
			ctx().emitTranscript('pending', { isFinal: true })
			instance.stop()
			await instance.start()
			expect(session.abort).toHaveBeenCalled()
			expect(lastOf(events, 'result')).toEqual([expect.any(Event), 'pending', ['pending']])
			expect(connect).toHaveBeenCalledTimes(2)
			expect(typesOf(events)).toContain('end')
			expect(instance.isRecording).toBe(true)
		})
	})

	describe('isSupported', () => {
		it('is true when media devices and the backend both support it', () => {
			vi.spyOn(userPermissionsUtils, 'isMediaDevicesSupported').mockReturnValue(true)
			const factory = createEngine({ isSupported: () => true, connect: vi.fn() })
			expect(factory.isSupported()).toBe(true)
		})

		it('is false when media devices are unsupported', () => {
			vi.spyOn(userPermissionsUtils, 'isMediaDevicesSupported').mockReturnValue(false)
			const factory = createEngine({ isSupported: () => true, connect: vi.fn() })
			expect(factory.isSupported()).toBe(false)
		})

		it('is false when the backend reports no support', () => {
			vi.spyOn(userPermissionsUtils, 'isMediaDevicesSupported').mockReturnValue(true)
			const factory = createEngine({ isSupported: () => false, connect: vi.fn() })
			expect(factory.isSupported()).toBe(false)
		})

		it('defaults to supported when the backend omits isSupported', () => {
			vi.spyOn(userPermissionsUtils, 'isMediaDevicesSupported').mockReturnValue(true)
			const factory = createEngine({ connect: vi.fn() })
			expect(factory.isSupported()).toBe(true)
		})
	})
})
