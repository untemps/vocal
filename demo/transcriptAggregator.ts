export const createTranscriptAggregator = () => {
	let parts: string[] = []

	return {
		add(text: string): void {
			if (text) parts.push(text)
		},
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
