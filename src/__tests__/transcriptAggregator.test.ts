import { createTranscriptAggregator } from '../transcriptAggregator'

describe('createTranscriptAggregator', () => {
	it('joins added parts on flush', () => {
		const aggregator = createTranscriptAggregator()
		aggregator.add('hello')
		aggregator.add('world')
		expect(aggregator.flush()).toBe('hello world')
	})

	it('ignores empty additions', () => {
		const aggregator = createTranscriptAggregator()
		aggregator.add('')
		expect(aggregator.flush()).toBeNull()
	})

	it('returns null when nothing was added', () => {
		expect(createTranscriptAggregator().flush()).toBeNull()
	})

	it('returns null when the joined parts are blank', () => {
		const aggregator = createTranscriptAggregator()
		aggregator.add('   ')
		expect(aggregator.flush()).toBeNull()
	})

	it('empties the buffer after a flush', () => {
		const aggregator = createTranscriptAggregator()
		aggregator.add('once')
		aggregator.flush()
		expect(aggregator.flush()).toBeNull()
	})

	it('drops buffered parts on clear', () => {
		const aggregator = createTranscriptAggregator()
		aggregator.add('discarded')
		aggregator.clear()
		expect(aggregator.flush()).toBeNull()
	})
})
