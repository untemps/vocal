import { Vocal } from '../src/index'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $supported   = document.getElementById('status-supported')!
const $recording   = document.getElementById('status-recording')!
const $instance    = document.getElementById('status-instance')!
const $transcript  = document.getElementById('result-transcript')!
const $alternatives = document.getElementById('result-alternatives')!
const $log         = document.getElementById('log')!
const $abortInfo   = document.getElementById('abort-info')!
const $banner      = document.getElementById('unsupported-banner')!

const $optLang      = document.getElementById('opt-lang') as HTMLInputElement
const $optMaxAlt    = document.getElementById('opt-maxalt') as HTMLInputElement
const $optContinuous = document.getElementById('opt-continuous') as HTMLInputElement
const $optInterim   = document.getElementById('opt-interim') as HTMLInputElement

const $btnStart       = document.getElementById('btn-start') as HTMLButtonElement
const $btnStop        = document.getElementById('btn-stop') as HTMLButtonElement
const $btnAbort       = document.getElementById('btn-abort') as HTMLButtonElement
const $btnCleanup     = document.getElementById('btn-cleanup') as HTMLButtonElement
const $btnReinit      = document.getElementById('btn-reinit') as HTMLButtonElement
const $btnOnce        = document.getElementById('btn-once') as HTMLButtonElement
const $btnAbortSignal = document.getElementById('btn-abort-signal') as HTMLButtonElement
const $btnClearLog    = document.getElementById('btn-clear-log') as HTMLButtonElement

// ── State ─────────────────────────────────────────────────────────────────────

let vocal: Vocal | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function time(): string {
	return new Date().toLocaleTimeString('fr-FR', { hour12: false })
}

function log(type: string, msg = '') {
	const empty = $log.querySelector('.log-empty')
	if (empty) empty.remove()

	const entry = document.createElement('div')
	entry.className = `log-entry event-${type}`
	entry.innerHTML = `
		<span class="log-time">${time()}</span>
		<span class="log-type">${type}</span>
		<span class="log-msg">${msg}</span>
	`
	$log.prepend(entry)
}

function updateStatus() {
	const supported = Vocal.isSupported
	setBadge($supported, supported)

	if (vocal) {
		const recording = vocal.isRecording
		setBadge($recording, recording, recording ? 'recording' : undefined)
		setBadge($instance, true, undefined, 'active', 'null')
	} else {
		setBadge($recording, false)
		setBadge($instance, false, undefined, 'active', 'null')
	}

	$btnStart.disabled   = !vocal || vocal.isRecording
	$btnStop.disabled    = !vocal || !vocal.isRecording
	$btnAbort.disabled   = !vocal || !vocal.isRecording
	$btnCleanup.disabled = !vocal
	$btnOnce.disabled    = !vocal || vocal.isRecording
	$btnAbortSignal.disabled = !vocal || vocal.isRecording
}

function setBadge(
	el: HTMLElement,
	value: boolean,
	trueClass?: string,
	trueLabel = 'true',
	falseLabel = 'false'
) {
	el.className = `badge ${value ? (trueClass ?? 'yes') : 'no'}`
	el.textContent = value ? trueLabel : falseLabel
}

function buildOptions() {
	return {
		lang: $optLang.value || 'fr-FR',
		maxAlternatives: parseInt($optMaxAlt.value, 10) || 1,
		continuous: $optContinuous.checked,
		interimResults: $optInterim.checked,
	}
}

// ── Vocal lifecycle ───────────────────────────────────────────────────────────

function initVocal() {
	if (vocal) {
		vocal.cleanup()
		vocal = null
	}

	vocal = new Vocal(buildOptions())

	vocal.addEventListener('start', () => {
		log('start')
		updateStatus()
	})

	vocal.addEventListener('end', () => {
		log('end')
		updateStatus()
	})

	vocal.addEventListener('result', (_, best, alts) => {
		$transcript.textContent = best as string
		const alternatives = alts as string[]
		$alternatives.textContent = alternatives.length > 1
			? `Alternatives: ${alternatives.slice(1).join(' · ')}`
			: ''
		log('result', best as string)
		updateStatus()
	})

	vocal.addEventListener('error', (e) => {
		const err = e as SpeechRecognitionErrorEvent
		log('error', err.error ?? String(e))
		updateStatus()
	})

	vocal.addEventListener('nomatch', () => {
		log('nomatch')
		updateStatus()
	})

	vocal.addEventListener('audiostart',  () => { log('audiostart');  updateStatus() })
	vocal.addEventListener('audioend',    () => { log('audioend');    updateStatus() })
	vocal.addEventListener('soundstart',  () => { log('soundstart');  updateStatus() })
	vocal.addEventListener('soundend',    () => { log('soundend');    updateStatus() })
	vocal.addEventListener('speechstart', () => { log('speechstart'); updateStatus() })
	vocal.addEventListener('speechend',   () => { log('speechend');   updateStatus() })

	log('init', JSON.stringify(buildOptions()))
	updateStatus()
}

// ── Init ──────────────────────────────────────────────────────────────────────

if (!Vocal.isSupported) {
	$banner.style.display = 'block'
	;[$btnStart, $btnStop, $btnAbort, $btnCleanup, $btnOnce, $btnAbortSignal, $btnReinit].forEach(
		(b) => (b.disabled = true)
	)
} else {
	initVocal()
}

updateStatus()

// ── Bindings ──────────────────────────────────────────────────────────────────

$btnReinit.addEventListener('click', () => {
	initVocal()
})

$btnStart.addEventListener('click', async () => {
	if (!vocal) return
	try {
		await vocal.start()
	} catch (e) {
		log('error', String(e))
	}
	updateStatus()
})

$btnStop.addEventListener('click', () => {
	vocal?.stop()
	updateStatus()
})

$btnAbort.addEventListener('click', () => {
	vocal?.abort()
	updateStatus()
})

$btnCleanup.addEventListener('click', () => {
	vocal?.cleanup()
	vocal = null
	log('cleanup')
	updateStatus()
})

$btnOnce.addEventListener('click', async () => {
	if (!vocal) return
	vocal.once('result', (_, best, alts) => {
		$transcript.textContent = best as string
		const alternatives = alts as string[]
		$alternatives.textContent = alternatives.length > 1
			? `once() alternatives: ${alternatives.slice(1).join(' · ')}`
			: ''
		log('result [once]', best as string)
		updateStatus()
	})
	try {
		await vocal.start()
	} catch (e) {
		log('error', String(e))
	}
	updateStatus()
})

$btnAbortSignal.addEventListener('click', async () => {
	if (!vocal) return
	const controller = new AbortController()
	$abortInfo.textContent = 'Abort dans 3s...'
	$btnAbortSignal.disabled = true

	const timer = setTimeout(() => {
		controller.abort()
		$abortInfo.textContent = 'Aborted via AbortSignal.'
		$btnAbortSignal.disabled = false
		log('abort-signal', 'AbortController.abort() appelé après 3s')
		updateStatus()
	}, 3000)

	try {
		await vocal.start({ signal: controller.signal })
	} catch (e) {
		clearTimeout(timer)
		$abortInfo.textContent = ''
		$btnAbortSignal.disabled = false
		log('error', String(e))
	}
	updateStatus()
})

$btnClearLog.addEventListener('click', () => {
	$log.innerHTML = '<div class="log-empty">No events yet.</div>'
})
