# @untemps/vocal

Functional wrapper around the SpeechRecognition Web API

![npm](https://img.shields.io/npm/v/@untemps/vocal?style=for-the-badge)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/untemps/vocal/publish.yml?style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/untemps/vocal?style=for-the-badge)

## Requirements

- A modern browser exposing the `SpeechRecognition` Web API (Chrome, Edge, Safari ≥ 14.1). The library is browser-only — it cannot run on the server.
- **TypeScript ≥ 6.0** for full type resolution. The published declarations rely on `SpeechRecognitionEvent` and `SpeechRecognitionErrorEvent` shipped by `lib.dom` starting with TypeScript 6.0. If you target an older TypeScript release, install [`@types/dom-speech-recognition`](https://www.npmjs.com/package/@types/dom-speech-recognition) to provide the missing ambient declarations.

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

// Check whether SpeechRecognition, Permissions and MediaDevices interfaces are supported
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

To compensate for results being split across silent restart cycles, Vocal accumulates every final result (`isFinal: true`) received during a session. On explicit `stop()`, an extra `result` event is emitted just before `end`, carrying the joined transcripts as a single string. Interim results and `abort()` are excluded — `abort()` discards the buffer without emitting.

The aggregated event is a synthetic `Event` shaped to match `SpeechRecognitionEvent` (`resultIndex` + `results[0][0].transcript`); it is not a real `SpeechRecognitionEvent` instance, so `event instanceof SpeechRecognitionEvent` returns `false`. Read the transcript through the second argument of the listener (`bestAlternative`).

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
| result      | Fired when the recognition service returns a result — callback receives `(event, bestAlternative: string, alternatives: string[])` where `bestAlternative` is the alternative with the highest confidence. **In `continuous: true` mode, intermediate final results are deferred until explicit `stop()`.** |
| soundend    | Fired when any sound — recognisable or not — has stopped being detected                   |
| soundstart  | Fired when any sound — recognisable or not — has been detected                            |
| speechend   | Fired when speech recognized by the recognition service has stopped being detected        |
| speechstart | Fired when sound recognized by the recognition service as speech has been detected        |
| start       | fired when the recognition service has begun listening to incoming audio                  |

For convenience, `eventTypes` is exported as a constant map so consumers can reference type strings symbolically:

```js
import { eventTypes } from '@untemps/vocal'
vocal.on(eventTypes.RESULT, handler)
```

## Top-level exports

| Export        | Kind     | Description                                                                                                          |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `createVocal` | function | Factory that returns a `VocalInstance`. See [Methods](#methods).                                                     |
| `isSupported` | function | Returns `true` if the current environment supports the SpeechRecognition Web API. Call it (it is **not** a getter).  |
| `eventTypes`  | const    | Map of valid event type strings (e.g. `eventTypes.RESULT === 'result'`).                                             |

## Instance getter

| Getter      | Type      | Description                                                                                                          |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| isRecording | boolean   | Whether recognition is currently active — `true` after `start()`, `false` after `stop()`, `abort()`, or `end` event |

## Methods

### `start({ signal? })`

Starts recognition. Resolves once the engine is active. Rejects if microphone permission cannot be obtained.

| Parameter | Type          | Default     | Description                                                                   |
| --------- | ------------- | ----------- | ----------------------------------------------------------------------------- |
| signal    | AbortSignal   | `undefined` | Cancels the in-flight microphone permission request when the signal is aborted |

```js
const controller = new AbortController()
vocal.start({ signal: controller.signal })

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

Side-effect methods (`stop`, `abort`, `on`, `off`, `cleanup`) now return `void` — method chaining is no longer supported. `Vocal.eventTypes` is now exported as the top-level `eventTypes` const.
