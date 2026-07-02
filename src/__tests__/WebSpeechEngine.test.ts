import { WebSpeechEngine } from '../WebSpeechEngine'
import type { SpeechEngineContext, VocalOptions } from '../types'

type MockFn = { mock: { calls: unknown[][] } }

const makeContext = (): SpeechEngineContext => ({
	options: {
		grammars: null,
		lang: 'en-US',
		continuous: false,
		interimResults: false,
		maxAlternatives: 1,
	} as Required<VocalOptions>,
	emit: (() => {}) as SpeechEngineContext['emit'],
})

const lastInstance = (): { stop: MockFn; abort: MockFn } => {
	const sr = SpeechRecognition as unknown as { mock: { results: Array<{ value: { stop: MockFn; abort: MockFn } }> } }
	return sr.mock.results[sr.mock.results.length - 1].value
}

describe('WebSpeechEngine', () => {
	it('stops at most once across repeated cleanup calls', () => {
		const engine = WebSpeechEngine(makeContext())
		const instance = lastInstance()
		engine.cleanup()
		expect(() => engine.cleanup()).not.toThrow()
		expect(instance.stop.mock.calls.length).toBe(1)
	})

	it('ignores stop after cleanup', () => {
		const engine = WebSpeechEngine(makeContext())
		const instance = lastInstance()
		engine.cleanup()
		const stopCalls = instance.stop.mock.calls.length
		expect(() => engine.stop()).not.toThrow()
		expect(instance.stop.mock.calls.length).toBe(stopCalls)
	})

	it('ignores abort after cleanup', () => {
		const engine = WebSpeechEngine(makeContext())
		const instance = lastInstance()
		engine.cleanup()
		expect(() => engine.abort()).not.toThrow()
		expect(instance.abort.mock.calls.length).toBe(0)
	})
})
