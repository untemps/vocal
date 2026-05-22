#!/usr/bin/env bash
# Verifies that the published tarball exposes a fully consumable TypeScript surface:
# - all public symbols (createVocal, isSupported, eventTypes) resolve;
# - the exported types compile against a strict tsconfig (skipLibCheck:false);
# - the dist re-export chain (index.d.ts -> Vocal.d.ts) carries the declare global block.
#
# Catches the class of regressions behind issue #93 (missing Vocal.d.ts in tarball,
# unresolved type re-exports, ambient-type drift) without waiting for user reports.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[verify-consumer-types] Packing tarball..."
TARBALL_NAME=$(npm pack --silent 2>&1 | tail -n 1)
TARBALL_PATH="$ROOT/$TARBALL_NAME"
trap 'rm -f "$TARBALL_PATH"' EXIT

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"; rm -f "$TARBALL_PATH"' EXIT

echo "[verify-consumer-types] Setting up consumer in $WORKDIR..."
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "vocal-consumer-smoke",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
JSON

cat > "$WORKDIR/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "noUnusedLocals": false
  }
}
JSON

cat > "$WORKDIR/consumer.ts" <<'TS'
import { createVocal, isSupported, eventTypes } from '@untemps/vocal'
import type {
	VocalInstance,
	VocalOptions,
	EventType,
	ResultEventHandler,
	ErrorEventHandler,
	GenericEventHandler,
	EventHandlerFor,
} from '@untemps/vocal'

const ok: boolean = isSupported()
const k: 'result' = eventTypes.RESULT

const opts: VocalOptions = {
	lang: 'fr-FR',
	continuous: true,
	interimResults: true,
	maxAlternatives: 3,
	grammars: null,
}
const vocal: VocalInstance = createVocal(opts)

async function lifecycle() {
	const controller = new AbortController()
	await vocal.start({ signal: controller.signal })
	const recording: boolean = vocal.isRecording
	vocal.stop()
	vocal.abort()
	vocal.cleanup()
	console.log(recording)
}

const onResult: ResultEventHandler = (event, best, alternatives) => {
	const idx: number = event.resultIndex
	const list: SpeechRecognitionResultList = event.results
	const first: SpeechRecognitionResult = list[idx]
	const isFinal: boolean = first.isFinal
	const alt: SpeechRecognitionAlternative = first[0]
	console.log(best, alternatives, idx, isFinal, alt.transcript, alt.confidence)
}
vocal.on('result', onResult)
vocal.on(eventTypes.RESULT, onResult)

const onError: ErrorEventHandler = (event) => {
	console.error(event.error, event.message)
}
vocal.on('error', onError)

const onAny: GenericEventHandler = (event) => console.log(event.type)
vocal.on('speechstart', onAny)
vocal.on('speechend', onAny)

type R = EventHandlerFor<'result'>
type E = EventHandlerFor<'error'>
type S = EventHandlerFor<'start'>
const r: R = onResult
const e: E = onError
const s: S = onAny

function dispatch(type: EventType) {
	console.log(type)
}
dispatch('result')

vocal.off('result', onResult)
vocal.off('error')

if (typeof SpeechGrammarList !== 'undefined') {
	const grammars = new SpeechGrammarList()
	const len: number = grammars.length
	createVocal({ grammars, lang: 'fr-FR' })
	console.log(len)
}

console.log(ok, k, r, e, s)
lifecycle().catch(console.error)
TS

cd "$WORKDIR"
echo "[verify-consumer-types] Installing $TARBALL_NAME..."
npm install --no-audit --no-fund "$TARBALL_PATH" >/dev/null

# Use the consumer's installed typescript if present; otherwise fall back to the host project's.
if [ -x node_modules/.bin/tsc ]; then
	TSC=node_modules/.bin/tsc
else
	TSC="$ROOT/node_modules/.bin/tsc"
fi

echo "[verify-consumer-types] Type-checking consumer with strict + skipLibCheck:false..."
"$TSC" --noEmit --project tsconfig.json

echo "[verify-consumer-types] OK — published types compile against a strict consumer."
