import { createVocal, isSupported as isVocalSupported, type VocalInstance } from '../src/index'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $supported    = document.getElementById('status-supported')!
const $recording    = document.getElementById('status-recording')!
const $transcript   = document.getElementById('result-transcript')!
const $alternatives = document.getElementById('result-alternatives')!
const $log          = document.getElementById('log')!
const $banner       = document.getElementById('unsupported-banner')!

const $optLang       = document.getElementById('opt-lang') as HTMLInputElement
const $optMaxAlt     = document.getElementById('opt-maxalt') as HTMLInputElement
const $optContinuous = document.getElementById('opt-continuous') as HTMLInputElement
const $optInterim    = document.getElementById('opt-interim') as HTMLInputElement

const $btnStart   = document.getElementById('btn-start') as HTMLButtonElement
const $btnStop    = document.getElementById('btn-stop') as HTMLButtonElement
const $btnAbort   = document.getElementById('btn-abort') as HTMLButtonElement
const $btnCleanup = document.getElementById('btn-cleanup') as HTMLButtonElement
const $btnReinit  = document.getElementById('btn-reinit') as HTMLButtonElement
const $btnClearLog = document.getElementById('btn-clear-log') as HTMLButtonElement

// ── State ─────────────────────────────────────────────────────────────────────

const isSupported = isVocalSupported()
let vocal: VocalInstance | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function time(): string {
	return new Date().toLocaleTimeString('fr-FR', { hour12: false })
}

function log(type: string, msg = '') {
	const empty = $log.querySelector('.log-empty')
	if (empty) empty.remove()

	const entry = document.createElement('div')
	entry.className = `log-entry event-${type}`

	const $time = document.createElement('span')
	$time.className = 'log-time'
	$time.textContent = time()

	const $type = document.createElement('span')
	$type.className = 'log-type'
	$type.textContent = type

	const $msg = document.createElement('span')
	$msg.className = 'log-msg'
	$msg.textContent = msg

	entry.append($time, $type, $msg)
	$log.appendChild(entry)
	$log.scrollTop = $log.scrollHeight
}

function setAlternatives(alts: string[], label = 'Alternatives') {
	$alternatives.replaceChildren()
	if (alts.length <= 1) return
	const heading = document.createElement('div')
	heading.className = 'alternatives-label'
	heading.textContent = label
	const ul = document.createElement('ul')
	ul.className = 'alternatives-list'
	alts.slice(1).forEach((a) => {
		const li = document.createElement('li')
		li.textContent = a
		ul.appendChild(li)
	})
	$alternatives.appendChild(heading)
	$alternatives.appendChild(ul)
}

function updateStatus() {
	setBadge($supported, isSupported)

	if (vocal) {
		const recording = vocal.isRecording
		setBadge($recording, recording, recording ? 'recording' : undefined)
	} else {
		setBadge($recording, false)
	}

	$btnStart.disabled   = !vocal || vocal.isRecording
	$btnStop.disabled    = !vocal || !vocal.isRecording
	$btnAbort.disabled   = !vocal || !vocal.isRecording
	$btnCleanup.disabled = !vocal
}

function setBadge(el: HTMLElement, value: boolean, trueClass?: string) {
	el.className = `badge ${value ? (trueClass ?? 'yes') : 'no'}`
	el.textContent = String(value)
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

function logEvent(type: string) {
	return () => { log(type); updateStatus() }
}

function initVocal() {
	if (vocal) {
		vocal.cleanup()
		vocal = null
	}

	const options = buildOptions()
	vocal = createVocal(options)

	vocal.on('result', (_, best, alts) => {
		$transcript.textContent = best
		setAlternatives(alts)
		log('result', best)
		updateStatus()
	})

	vocal.on('error', (event) => {
		log('error', event.error ?? String(event))
		updateStatus()
	})

	vocal.on('nomatch',     logEvent('nomatch'))
	vocal.on('speechstart', logEvent('speechstart'))
	vocal.on('speechend',   logEvent('speechend'))

	log('init', JSON.stringify(options))
	updateStatus()
}

// ── Collapsible panels (force open on desktop) ────────────────────────────────

function syncCollapsible() {
	document.querySelectorAll<HTMLDetailsElement>('details.collapsible').forEach((el) => {
		if (window.innerWidth > 768) el.open = true
	})
}
syncCollapsible()
window.addEventListener('resize', syncCollapsible)

// ── Init ──────────────────────────────────────────────────────────────────────

if (!isSupported) {
	$banner.style.display = 'block'
	;[$btnStart, $btnStop, $btnAbort, $btnCleanup, $btnReinit].forEach(
		(b) => (b.disabled = true)
	)
} else {
	initVocal()
}

// ── Bindings ──────────────────────────────────────────────────────────────────

$btnReinit.addEventListener('click', initVocal)

;[$optLang, $optMaxAlt, $optContinuous, $optInterim].forEach((el) =>
	el.addEventListener('change', initVocal)
)

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
	initVocal()
})

$btnClearLog.addEventListener('click', () => {
	const empty = document.createElement('div')
	empty.className = 'log-empty'
	empty.textContent = 'No events yet.'
	$log.replaceChildren(empty)
})
