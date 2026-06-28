// Tiny transcript accumulator shared by the cloud demo engines. In `continuous` mode they
// buffer per-utterance finals here and flush a single aggregated `result` on stop(), mirroring
// the built-in WebSpeechEngine. The engine owns when to add/flush/clear and does the emitting.
export const createTranscriptAggregator = () => {
	let parts: string[] = []

	return {
		add(text: string): void {
			if (text) parts.push(text)
		},
		// Joined transcript (cleared as a side effect), or null when nothing was buffered.
		flush(): string | null {
			if (parts.length === 0) return null
			const joined = parts.join(' ').trim()
			parts = []
			return joined || null
		},
		clear(): void {
			parts = []
		},
	}
}
