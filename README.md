# @untemps/vocal

Class wrapped around the SpeechRecognition Web API

![npm](https://img.shields.io/npm/v/@untemps/vocal?style=for-the-badge)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/untemps/vocal/publish.yml?style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/untemps/vocal?style=for-the-badge)

## Installation

```bash
yarn add @untemps/vocal
```

## Basic Usage

Import `Vocal` to a file.

```javascript
import { Vocal } from '@untemps/vocal'

// Check whether SpeechRecognition, Permissions and MediaDevices interfaces are supported
if (!Vocal.isSupported) {
  throw new Error('Vocal is not supported')
}

// Create a Vocal instance (see below for all available option properties)
const options = {
    lang: 'fr-FR',
}
const vocal = new Vocal(options)

// Subscribe to Vocal instance events (see below for all available events)
vocal.addEventListener('speechstart', (event) => console.log('Vocal starts recording'))
vocal.addEventListener('speechend', (event) => console.log('Vocal stops recording'))
vocal.addEventListener('result', (event, bestAlternative, alternatives) => console.log('Vocal catches a result:', bestAlternative, alternatives))
vocal.addEventListener('error', (event) => console.error(event.error, event.message))

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

// Remove all attached listeners and delete the Vocal instance
vocal.cleanup()
```

## Options

Options described below are those from the `SpeechRecognition` Web API.  
Please refer to [this section](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition#properties) for more information.

| Option           | Type              | Default    | Description                                                                                                       |
| ---------------- | ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| grammars         | SpeechGrammarList | null       | Grammars understood by the recognition [JSpeech Grammar Format](https://www.w3.org/TR/jsgf/)                      |
| lang             | string            | 'en-US'    | Language understood by the recognition [BCP 47 language tag](https://tools.ietf.org/html/bcp47)                   |
| continuous       | boolean           | false      | Whether continuous results are returned for each recognition, or only a single result                             |
| interimResults   | boolean           | false      | Whether interim results should be returned or not. Interim results are results that are not yet final             |
| maxAlternatives  | number            | 1          | Maximum number of SpeechRecognitionAlternatives provided per result                                               |

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
| result      | Fired when the recognition service returns a result — callback receives `(event, bestAlternative: string, alternatives: string[])` where `bestAlternative` is the alternative with the highest confidence |
| soundend    | Fired when any sound — recognisable or not — has stopped being detected                   |
| soundstart  | Fired when any sound — recognisable or not — has been detected                            |
| speechend   | Fired when speech recognized by the recognition service has stopped being detected        |
| speechstart | Fired when sound recognized by the recognition service as speech has been detected        |
| start       | fired when the recognition service has begun listening to incoming audio                  |

## Getters

| Getter      | Type                      | Description                                                                                                          |
| ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| isSupported | boolean                   | Whether the current environment supports the SpeechRecognition Web API (static)                                      |
| isRecording | boolean                   | Whether recognition is currently active — `true` after `start()`, `false` after `stop()`, `abort()`, or `end` event |

## Methods

### `start({ signal? })`

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

Stops recognition gracefully, allowing the current audio to be processed before disconnecting. Sets `isRecording` to `false`.

### `abort()`

Stops recognition immediately without processing pending audio. Sets `isRecording` to `false`.

### `addEventListener(eventType, callback)`

Registers a callback for the given event type. Multiple callbacks can be registered for the same type — they stack and all fire in registration order.

| Parameter | Type                                              | Description                                |
| --------- | ------------------------------------------------- | ------------------------------------------ |
| eventType | `EventType`                                       | One of the valid event type strings        |
| callback  | `ResultEventHandler \| ErrorEventHandler \| GenericEventHandler` | Callback invoked when the event fires |

Throws if `eventType` is not a valid `EventType`.

### `removeEventListener(eventType, callback?)`

Removes a listener for the given event type.

| Parameter | Type                                              | Default     | Description                                          |
| --------- | ------------------------------------------------- | ----------- | ---------------------------------------------------- |
| eventType | `EventType`                                       |             | One of the valid event type strings                  |
| callback  | `ResultEventHandler \| ErrorEventHandler \| GenericEventHandler` | `undefined` | Specific callback to remove. Omit to remove all listeners for this type |

Throws if `eventType` is not a valid `EventType`.

### `once(eventType, callback)`

Registers a one-shot listener that automatically unregisters itself after firing once.

| Parameter | Type                                              | Description                                |
| --------- | ------------------------------------------------- | ------------------------------------------ |
| eventType | `EventType`                                       | One of the valid event type strings        |
| callback  | `ResultEventHandler \| ErrorEventHandler \| GenericEventHandler` | Callback invoked once when the event fires |

```js
vocal.once('result', (event, bestAlternative, alternatives) => {
    console.log(bestAlternative)
    vocal.stop()
})
```

### `cleanup()`

Stops recognition, removes all registered listeners, and releases the internal `SpeechRecognition` instance. The `Vocal` object cannot be reused after `cleanup()`.

