# @untemps/vocal

Functional wrapper around the SpeechRecognition Web API

![npm](https://img.shields.io/npm/v/@untemps/vocal?style=for-the-badge)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/untemps/vocal/publish.yml?style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/untemps/vocal?style=for-the-badge)

## Requirements

- A modern browser exposing the `SpeechRecognition` Web API (see [browser support](#browser-support) below). The library is browser-only — it cannot run on the server.
- **TypeScript ≥ 6.0** for full type resolution. The published declarations rely on `SpeechRecognitionEvent` and `SpeechRecognitionErrorEvent` shipped by `lib.dom` starting with TypeScript 6.0. If you target an older TypeScript release, install [`@types/dom-speech-recognition`](https://www.npmjs.com/package/@types/dom-speech-recognition) to provide the missing ambient declarations.

### Browser support

| Browser | Desktop  | Mobile (iOS) | Mobile (Android) |
| ------- | -------- | ------------ | ---------------- |
| Chrome  | ✅ 25+   | ✅ 121+      | ✅ 25+           |
| Edge    | ✅ 79+   | ✅ 121+      | ✅ 79+           |
| Safari  | ✅ 14.1+ | ✅ 14.5+     | —                |
| Opera   | ✅ 27+   | ⚠️ partial   | ✅ 27+           |
| Firefox | ❌       | ❌           | ❌               |

Firefox does not implement the Web Speech `SpeechRecognition` API natively. `isSupported()` returns `false` there. Refer to [caniuse.com](https://caniuse.com/?search=SpeechRecognition) for the most up-to-date matrix.

Vendor-prefixed globals (`webkitSpeechRecognition`, `mozSpeechRecognition`, `msSpeechRecognition`, and the matching `*SpeechGrammarList` constructors) are detected transparently — consumers do not need to handle them themselves.

## Installation

```bash
# yarn
yarn add @untemps/vocal

# npm
npm install @untemps/vocal

# pnpm
pnpm add @untemps/vocal
```

## Basic Usage

```javascript
import { createVocal, isSupported } from '@untemps/vocal'

// Check whether the SpeechRecognition and MediaDevices interfaces are supported
if (!isSupported()) {
  throw new Error('Vocal is not supported')
}

// Create a Vocal instance (see below for all available option properties)
const vocal = createVocal({ lang: 'fr-FR' })

// Subscribe to instance events (see below for all available events)
vocal.on('speechstart', (event) => console.log('Vocal starts recording'))
vocal.on('speechend', (event) => console.log('Vocal stops recording'))
vocal.on('result', (event, bestAlternative, alternatives) => console.log('Vocal catches a result:', bestAlternative, alternatives))
vocal.on('error', (event) => console.error(event.error, event.message))

// Start recording — rejects on error
try {
  await vocal.start()
} catch (error) {
  // handle error
}

// Stop/Pause recording
vocal.stop()

// Abort recording entirely
vocal.abort()

// Remove all attached listeners and release the internal SpeechRecognition instance
vocal.cleanup()
```

## Options

Options described below are those from the `SpeechRecognition` Web API.  
Please refer to [this section](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition#properties) for more information.

| Option           | Type              | Default    | Description                                                                                                       |
| ---------------- | ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| grammars         | SpeechGrammarList | null       | Grammars understood by the recognition [JSpeech Grammar Format](https://www.w3.org/TR/jsgf/)                      |
| lang             | string            | 'en-US'    | Language understood by the recognition [BCP 47 language tag](https://tools.ietf.org/html/bcp47)                   |
| continuous       | boolean           | false      | Whether continuous results are returned for each recognition, or only a single result (see [Continuous mode](#continuous-mode)) |
| interimResults   | boolean           | false      | Whether interim results should be returned or not. Interim results are results that are not yet final             |
| maxAlternatives  | number            | 1          | Maximum number of SpeechRecognitionAlternatives provided per result                                               |

### Continuous mode

Browsers (notably Chrome) automatically end a recognition session after a few seconds of silence, even when `continuous` is `true`. Vocal transparently restarts the underlying engine after such a silence-induced `end`, so recording keeps running until `stop()` or `abort()` is explicitly called. The intermediate `end` and `start` events triggered by the restart are not forwarded to user listeners — `isRecording` stays `true` across the restart, and the cycle is throttled to at most one restart per second to avoid `InvalidStateError`.

The restart is disabled automatically when the recognition emits a fatal error (`not-allowed`, `service-not-allowed`, `audio-capture`).

#### Aggregated result on stop

To compensate for results being split across silent restart cycles, Vocal accumulates every final result (`isFinal: true`) received during a session. On explicit `stop()`, a single `result` event carrying the joined transcripts is emitted alongside the `end` event — in `continuous: true` mode, this aggregated event is the only `result` your listener receives (intermediate finals are suppressed). Interim results and `abort()` are excluded — `abort()` discards the buffer without emitting.

The aggregated event is a synthetic `Event` shaped to match `SpeechRecognitionEvent`: it carries `resultIndex: 0` and a `results` list with **one entry per captured utterance**, each preserving the real alternatives and confidences the browser reported. Entries support both index access (`results[i][j]`) and the lib.dom `.item()` accessor (`results.item(i).item(j)`). The event is not a real `SpeechRecognitionEvent` instance, so `event instanceof SpeechRecognitionEvent` returns `false`.

The simplest pattern is to read the joined transcript through the second argument of the listener — it returns the per-utterance best transcripts joined with spaces, and works identically for real and synthetic events:

```ts
vocal.on('result', (event, bestAlternative) => {
  console.log(bestAlternative) // joined transcript across all captured utterances
})
```

For per-utterance detail (confidence, alternative count, etc.), iterate over `event.results`:

```ts
vocal.on('result', (event) => {
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results.item(i)
    const best = result.item(0)
    console.log(best.transcript, best.confidence)
  }
})
```

## Events

Events described below are those from the `SpeechRecognition` Web API.  
Please refer to [this section](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition#events) for more information.

| Event       | Description                                                                               |
| ----------- | ----------------------------------------------------------------------------------------- |
| audioend    | Fired when the user agent has finished capturing audio for recognition                    |
| audiostart  | Fired when the user agent has started to capture audio for recognition                    |
| end         | Fired when the recognition service has disconnected                                       |
| error       | Fired when a recognition error occurs                                                     |
| nomatch     | Fired when the recognition service returns a final result with no significant recognition |
| result      | Fired when the recognition service returns a result — callback receives `(event, bestAlternative: string, alternatives: string[])` where `bestAlternative` is the alternative with the highest confidence. **In `continuous: true` mode, intermediate final results are deferred until explicit `stop()` (see [Aggregated result on stop](#aggregated-result-on-stop)).** |
| soundend    | Fired when any sound — recognisable or not — has stopped being detected                   |
| soundstart  | Fired when any sound — recognisable or not — has been detected                            |
| speechend   | Fired when speech recognized by the recognition service has stopped being detected        |
| speechstart | Fired when sound recognized by the recognition service as speech has been detected        |
| start       | fired when the recognition service has begun listening to incoming audio                  |
| permission  | **Library-synthetic** (not a native `SpeechRecognition` event). Fired with the current microphone permission state as soon as a `permission` handler is attached — even before `start()` — and on every transition while at least one handler stays subscribed (see [Microphone permission event](#microphone-permission-event)). |

For convenience, `eventTypes` is exported as a constant map so consumers can reference type strings symbolically:

```js
import { eventTypes } from '@untemps/vocal'
vocal.on(eventTypes.RESULT, handler)
```

### Microphone permission event

Unlike every other event above, `permission` is **synthesised by Vocal** — the native `SpeechRecognition` instance never emits it. Vocal observes the microphone permission through the [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API), so you can read and track it **independently of a session**. The handler receives the state both as a second argument and on `event.state`:

```ts
vocal.on('permission', (event, state) => {
  // state: 'granted' | 'denied' | 'prompt' (also available as event.state)
  console.log('Microphone permission:', state)
})
```

**Subscription-driven lifecycle.** Observation begins the moment the first `permission` handler is attached — even before `start()`, e.g. to seed a "mic status" badge on page load — and the handler is emitted the current state immediately. The state is then re-emitted on every transition (e.g. when the user grants or revokes access), including across a `start()`/`stop()` cycle and the transparent auto-restarts of continuous mode. The single underlying watch is torn down automatically once the **last** `permission` handler is removed via `off('permission')` or on `cleanup()` — no listener leaks. A handler attached while the watch is already running is immediately replayed the last known state, so every subscriber sees a value without waiting for the next transition.

The observation is **best-effort**: it never displays a prompt itself (only `start()` does, through `getUserMediaStream`), and it stays silent on browsers where the Permissions API is unavailable or where `microphone` is not queryable (Firefox, Safari). When there is no `permission` handler, no watch is opened at all.

## Top-level exports

| Export        | Kind     | Description                                                                                                          |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `createVocal` | function | Factory that returns a `VocalInstance`. See [Methods](#methods).                                                     |
| `isSupported` | function | Returns `true` when both the `SpeechRecognition` Web API and `navigator.mediaDevices.getUserMedia` are available. The Permissions API is **not** required (it is best-effort). Call it (it is **not** a getter). |
| `eventTypes`  | const    | Map of valid event type strings (e.g. `eventTypes.RESULT === 'result'`).                                             |

## Instance getter

| Getter      | Type      | Description                                                                                                          |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| isRecording | boolean   | Whether recognition is currently active — `true` after `start()`, `false` after `stop()`, `abort()`, or `end` event |

## Methods

### `start({ signal? })`

Starts recognition. Resolves once the engine is active. Acquires the microphone through `getUserMediaStream` (which surfaces the OS permission prompt). If a [`permission` handler](#microphone-permission-event) is subscribed, the resulting grant/deny shows up as a `permission` transition — but the watch is driven by subscription, not by `start()`.

Rejects if the microphone stream cannot be acquired. The rejection is the **original `DOMException`** thrown by `getUserMedia`, so it can be discriminated by `name`:

| `error.name`      | Meaning                                              |
| ----------------- | ---------------------------------------------------- |
| `NotAllowedError` | The user denied microphone permission                |
| `NotFoundError`   | No matching input device was found                   |
| _(others)_        | Any other `getUserMedia` `DOMException` is propagated as-is |

Cancelling the in-flight request via the `signal` resolves (it does **not** reject) — the `AbortError` is swallowed.

| Parameter | Type          | Default     | Description                                                                   |
| --------- | ------------- | ----------- | ----------------------------------------------------------------------------- |
| signal    | AbortSignal   | `undefined` | Cancels the in-flight microphone request when aborted (does not affect the permission watch, which is tied to subscription) |

```js
const controller = new AbortController()

try {
  await vocal.start({ signal: controller.signal })
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // microphone permission denied
  }
}

// Cancel the permission request at any later point
controller.abort()
```

### `stop()`

Stops recognition gracefully, allowing the current audio to be processed before disconnecting. Sets `isRecording` to `false`. In continuous mode, emits the aggregated `result` event just before `end`.

### `abort()`

Stops recognition immediately without processing pending audio. Sets `isRecording` to `false`. Discards any aggregated transcript without emitting.

### `on(eventType, callback)`

Registers a callback for the given event type. Multiple callbacks can be registered for the same type — they stack and all fire in registration order.

| Parameter | Type                                              | Description                                |
| --------- | ------------------------------------------------- | ------------------------------------------ |
| eventType | `EventType`                                       | One of the valid event type strings        |
| callback  | `ResultEventHandler \| ErrorEventHandler \| GenericEventHandler` | Callback invoked when the event fires |

Throws if `eventType` is not a valid `EventType`.

### `off(eventType, callback?)`

Removes a listener for the given event type.

| Parameter | Type                                              | Default     | Description                                          |
| --------- | ------------------------------------------------- | ----------- | ---------------------------------------------------- |
| eventType | `EventType`                                       |             | One of the valid event type strings                  |
| callback  | `ResultEventHandler \| ErrorEventHandler \| GenericEventHandler` | `undefined` | Specific callback to remove. Omit to remove all listeners for this type |

Throws if `eventType` is not a valid `EventType`.

### `cleanup()`

Stops recognition, removes all registered listeners, and releases the internal `SpeechRecognition` instance. The returned `VocalInstance` cannot be reused after `cleanup()`.

## Migration from the class-based API (v1.x)

```js
// Before
import { Vocal } from '@untemps/vocal'
if (!Vocal.isSupported) throw new Error()
const vocal = new Vocal({ lang: 'fr-FR' })
vocal.addEventListener('result', cb)
vocal.removeEventListener('result', cb)

// After
import { createVocal, isSupported } from '@untemps/vocal'
if (!isSupported()) throw new Error()
const vocal = createVocal({ lang: 'fr-FR' })
vocal.on('result', cb)
vocal.off('result', cb)
```

## Migration to v3 (behaviour changes)

v3 migrates the internal `@untemps/user-permissions-utils` dependency to v2. The public API surface is unchanged, but two observable behaviours differ:

- **`start()` rejection** — on a failed acquisition, `start()` now rejects with the **original `getUserMedia` `DOMException`** (`NotAllowedError`, `NotFoundError`, …) instead of the generic `Error('Unable to retrieve the stream from media device')`. Discriminate on `error.name` (see [`start()`](#start-signal-)). Code that matched the old message string must be updated.
- **`isSupported()` no longer requires the Permissions API** — it now returns `true` whenever `SpeechRecognition` and `navigator.mediaDevices.getUserMedia` are available. This **widens** support (e.g. older Safari builds without `navigator.permissions` where recognition actually works) and never narrows it.

The new [`permission` event](#microphone-permission-event) is purely additive — existing listeners are unaffected. It is **subscription-driven**: observation starts when the first `permission` handler is attached (even before `start()`) and stops when the last one is removed or on `cleanup()`, so the state is now observable outside a session — it is no longer tied to the `start()`/`stop()` lifecycle.

Side-effect methods (`stop`, `abort`, `on`, `off`, `cleanup`) now return `void` — method chaining is no longer supported. `Vocal.eventTypes` is now exported as the top-level `eventTypes` const.
