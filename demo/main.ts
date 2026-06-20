import { createVocal, isSupported as isVocalSupported, type SpeechEngineFactory, type VocalInstance } from '../src/index'
import { createGladiaEngine } from './gladiaEngine'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $supported    = document.getElementById('status-supported')!
const $recording    = document.getElementById('status-recording')!
const $permission   = document.getElementById('status-permission')!
const $transcript   = document.getElementById('result-transcript')!
const $alternatives = document.getElementById('result-alternatives')!
const $log          = document.getElementById('log')!
const $banner       = document.getElementById('unsupported-banner')!

const $optLang       = document.getElementById('opt-lang') as HTMLInputElement
const $optMaxAlt     = document.getElementById('opt-maxalt') as HTMLInputElement
const $optContinuous = document.getElementById('opt-continuous') as HTMLInputElement
const $optInterim    = document.getElementById('opt-interim') as HTMLInputElement
const $optEngine     = document.getElementById('opt-engine') as HTMLSelectElement
const $optGladiaKey  = document.getElementById('opt-gladia-key') as HTMLInputElement
const $gladiaField   = document.getElementById('gladia-key-field') as HTMLElement
const $gladiaNote    = document.getElementById('gladia-note') as HTMLElement

const $btnStart   		= document.getElementById('btn-start') as HTMLButtonElement
const $btnStop    		= document.getElementById('btn-stop') as HTMLButtonElement
const $btnAbort   		= document.getElementById('btn-abort') as HTMLButtonElement
const $btnCleanup 		= document.getElementById('btn-cleanup') as HTMLButtonElement
const $btnResetOptions  = document.getElementById('btn-reset-options') as HTMLButtonElement
const $btnClearLog 		= document.getElementById('btn-clear-log') as HTMLButtonElement

// ── State ─────────────────────────────────────────────────────────────────────

let vocal: VocalInstance | null = null

// Vite exposes VITE_*-prefixed vars on import.meta.env. A key here only pre-fills the
// field (handy in local dev via .env.local); it is never committed.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

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

// ── Engine selection ────────────────────────────────────────────────────────────

function gladiaKey(): string {
	return $optGladiaKey.value.trim()
}

// null → the built-in Web Speech engine; otherwise a custom factory passed to createVocal.
function currentEngineFactory(): SpeechEngineFactory | null {
	if ($optEngine.value !== 'gladia') return null
	return createGladiaEngine({ apiKey: gladiaKey() })
}

function isCurrentSupported(): boolean {
	const factory = currentEngineFactory()
	return factory ? isVocalSupported(factory) : isVocalSupported()
}

function needsMissingKey(): boolean {
	return $optEngine.value === 'gladia' && !gladiaKey()
}

function syncEngineUI() {
	const isGladia = $optEngine.value === 'gladia'
	$gladiaField.style.display = isGladia ? '' : 'none'
	$gladiaNote.style.display = isGladia ? '' : 'none'
	// Gladia streams continuously and returns a single hypothesis, so these have no effect there.
	$optMaxAlt.disabled = isGladia
	$optContinuous.disabled = isGladia
}

function updateStatus() {
	setBadge($supported, isCurrentSupported())

	if (vocal) {
		const recording = vocal.isRecording
		setBadge($recording, recording, recording ? 'recording' : undefined)
	} else {
		setBadge($recording, false)
	}

	$btnStart.disabled   = !vocal || vocal.isRecording || needsMissingKey()
	$btnStop.disabled    = !vocal || !vocal.isRecording
	$btnAbort.disabled   = !vocal || !vocal.isRecording
	$btnCleanup.disabled = !vocal
}

function setBadge(el: HTMLElement, value: boolean, trueClass?: string) {
	el.className = `badge ${value ? (trueClass ?? 'yes') : 'no'}`
	el.textContent = String(value)
}

function setPermission(state: string) {
	const cls = state === 'granted' ? 'yes' : state === 'denied' ? 'no' : 'warn'
	$permission.className = `badge ${cls}`
	$permission.textContent = state
}

function resetOptions() {
	$optLang.value = 'fr-FR'
	$optMaxAlt.value = '3'
	$optContinuous.checked = false
	$optInterim.checked = false
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

	const engine = currentEngineFactory()
	const supported = engine ? isVocalSupported(engine) : isVocalSupported()
	$banner.style.display = supported ? 'none' : 'block'
	if (!supported) {
		updateStatus()
		return
	}

	const options = buildOptions()
	vocal = createVocal(engine ? { ...options, engine } : options)

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

	vocal.on('permission', (_event, state) => {
		setPermission(state)
		log('permission', state)
		updateStatus()
	})

	vocal.on('nomatch',     logEvent('nomatch'))
	vocal.on('start', logEvent('start'))
	vocal.on('end',   logEvent('end'))
	vocal.on('speechstart', logEvent('speechstart'))
	vocal.on('speechend',   logEvent('speechend'))

	log('init', JSON.stringify({ engine: $optEngine.value, ...options }))
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

$optGladiaKey.value = env.VITE_GLADIA_API_KEY ?? ''
syncEngineUI()
initVocal()

// ── Bindings ──────────────────────────────────────────────────────────────────

$btnResetOptions.addEventListener('click', () => {
	resetOptions()
	vocal?.cleanup()
	vocal = null
	log('Reset Options')
	initVocal()
})

;[$optLang, $optMaxAlt, $optContinuous, $optInterim, $optGladiaKey].forEach((el) =>
	el.addEventListener('change', initVocal)
)

$optEngine.addEventListener('change', () => {
	syncEngineUI()
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
	initVocal()
})

$btnClearLog.addEventListener('click', () => {
	const empty = document.createElement('div')
	empty.className = 'log-empty'
	empty.textContent = 'No events yet.'
	$log.replaceChildren(empty)
})
