import { createEngine, type EngineConnectContext, type EngineSession, type SpeechEngineFactory } from '../src/index'

const CLIENT_SECRETS_URL = '/openai-api/v1/realtime/client_secrets'
const CALLS_URL = '/openai-api/v1/realtime/calls'
const FLUSH_DELAY_MS = 500

interface OpenAIConfig {
	apiKey: string
	model?: string
}

interface OpenAIEvent {
	type?: string
	delta?: string
	transcript?: string
	error?: { message?: string }
}

export const createOpenAIRealtimeEngine = ({
	apiKey,
	model = 'gpt-4o-mini-transcribe',
}: OpenAIConfig): SpeechEngineFactory =>
	createEngine({
		isSupported: () => typeof RTCPeerConnection !== 'undefined',
		connect: async ({
			stream,
			signal,
			language,
			emitTranscript,
			emitError,
			end,
		}: EngineConnectContext): Promise<EngineSession> => {
			let pc: RTCPeerConnection | null = null
			let channel: RTCDataChannel | null = null
			let interim = ''
			let flushTimer: ReturnType<typeof setTimeout> | null = null
			let done = false

			const clearFlushTimer = (): void => {
				if (flushTimer !== null) {
					clearTimeout(flushTimer)
					flushTimer = null
				}
			}

			const teardown = (): void => {
				clearFlushTimer()
				stream.getTracks().forEach((track) => track.stop())
				channel?.close()
				pc?.close()
				channel = pc = null
			}

			const finish = ({ flush }: { flush: boolean }): void => {
				if (done) return
				done = true
				teardown()
				end({ flush })
			}

			const handleEvent = (raw: string): void => {
				if (done) return
				let message: OpenAIEvent
				try {
					message = JSON.parse(raw)
				} catch {
					return
				}
				switch (message.type) {
					case 'conversation.item.input_audio_transcription.delta':
						interim += message.delta ?? ''
						emitTranscript(interim, { isFinal: false })
						break
					case 'conversation.item.input_audio_transcription.completed': {
						const text = message.transcript || interim
						interim = ''
						emitTranscript(text, { isFinal: true })
						if (flushTimer !== null) {
							clearTimeout(flushTimer)
							flushTimer = setTimeout(() => finish({ flush: true }), FLUSH_DELAY_MS)
						}
						break
					}
					case 'conversation.item.input_audio_transcription.failed':
					case 'error':
						interim = ''
						emitError(message.error?.message ?? 'OpenAI Realtime error')
						break
				}
			}

			const mintEphemeralToken = async (): Promise<string> => {
				const response = await fetch(CLIENT_SECRETS_URL, {
					method: 'POST',
					signal,
					headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({
						session: {
							type: 'transcription',
							audio: { input: { transcription: { model, language } } },
						},
					}),
				})
				if (!response.ok) {
					throw new Error(`OpenAI token request failed (${response.status} ${response.statusText})`)
				}
				const data = (await response.json()) as { value?: string; client_secret?: { value?: string } }
				const token = data.value ?? data.client_secret?.value
				if (!token) throw new Error('OpenAI token response missing client secret')
				return token
			}

			const negotiate = async (token: string): Promise<void> => {
				const peer = new RTCPeerConnection()
				pc = peer
				peer.addEventListener('connectionstatechange', () => {
					if (pc === peer && peer.connectionState === 'failed') finish({ flush: true })
				})
				channel = peer.createDataChannel('oai-events')
				channel.addEventListener('message', (event: MessageEvent) => handleEvent(event.data as string))
				channel.addEventListener('open', () => {
					channel?.send(
						JSON.stringify({
							type: 'session.update',
							session: {
								type: 'transcription',
								audio: {
									input: {
										transcription: { model, language },
										turn_detection: { type: 'server_vad' },
									},
								},
							},
						})
					)
				})
				peer.addTrack(stream.getTracks()[0], stream)

				const offer = await peer.createOffer()
				await peer.setLocalDescription(offer)

				const sdpResponse = await fetch(CALLS_URL, {
					method: 'POST',
					signal,
					body: offer.sdp,
					headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
				})
				if (!sdpResponse.ok) {
					throw new Error(`OpenAI SDP exchange failed (${sdpResponse.status} ${sdpResponse.statusText})`)
				}
				await peer.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() })
			}

			try {
				const token = await mintEphemeralToken()
				await negotiate(token)
				return {
					stop() {
						if (done) return
						stream.getTracks().forEach((track) => track.stop())
						flushTimer = setTimeout(() => finish({ flush: true }), FLUSH_DELAY_MS)
					},
					abort() {
						if (done) return
						done = true
						teardown()
					},
				}
			} catch (error) {
				teardown()
				throw error
			}
		},
	})
