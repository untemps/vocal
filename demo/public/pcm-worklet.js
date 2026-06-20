// AudioWorklet processor for the Gladia demo engine.
//
// Runs off the main thread: buffers the mono microphone input, converts it from
// Float32 [-1, 1] to little-endian 16-bit PCM and posts ~100 ms chunks back to the
// main thread, which forwards them over the Gladia WebSocket. Keeping the conversion
// here means transcription never janks the demo UI.
//
// Lives in public/ so it is served verbatim at /pcm-worklet.js — an AudioWorklet module
// must be fetched as a standalone script, never bundled, transformed or inlined.

const TARGET_SAMPLES = 1600 // ~100 ms at 16 kHz

class PCMProcessor extends AudioWorkletProcessor {
	constructor() {
		super()
		this._chunks = []
		this._count = 0
	}

	process(inputs) {
		const channel = inputs[0]?.[0]
		if (channel) {
			// slice(0) copies the sample data out of the render quantum, which the engine reuses.
			this._chunks.push(channel.slice(0))
			this._count += channel.length

			if (this._count >= TARGET_SAMPLES) {
				const pcm = new Int16Array(this._count)
				let offset = 0
				for (const chunk of this._chunks) {
					for (let i = 0; i < chunk.length; i++) {
						const s = Math.max(-1, Math.min(1, chunk[i]))
						pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff
					}
				}
				this.port.postMessage(pcm.buffer, [pcm.buffer])
				this._chunks = []
				this._count = 0
			}
		}
		return true
	}
}

registerProcessor('pcm-processor', PCMProcessor)
