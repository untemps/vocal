# @untemps/vocal

Class wrapped around the SpeechRecognition Web API

![npm](https://img.shields.io/npm/v/@untemps/vocal?style=for-the-badge)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/untemps/vocal/publish.yml?style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/untemps/vocal?style=for-the-badge)

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
vocal.addEventListener('result', (event, transcript, alternatives) => console.log('Vocal catches a result:', transcript, alternatives))
vocal.addEventListener('error', (error) => { throw error })

// Start recording
vocal.start()

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
| result      | Fired when the recognition service returns a result — callback receives `(event, transcript: string, alternatives: string[])` where `transcript === alternatives[0]`. **In `continuous: true` mode, intermediate final results are deferred until explicit `stop()`.** |
| soundend    | Fired when any sound — recognisable or not — has stopped being detected                   |
| soundstart  | Fired when any sound — recognisable or not — has been detected                            |
| speechend   | Fired when speech recognized by the recognition service has stopped being detected        |
| speechstart | Fired when sound recognized by the recognition service as speech has been detected        |
| start       | fired when the recognition service has begun listening to incoming audio                  |

## Getters

| Getter      | Type                      | Description                                                                                                          |
| ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| isSupported | boolean                   | Whether the current environment supports the SpeechRecognition Web API (static)                                      |
| instance    | SpeechRecognition \| null | The underlying SpeechRecognition instance                                                                            |
| isRecording | boolean                   | Whether recognition is currently active — `true` after `start()`, `false` after `stop()`, `abort()`, or `end` event |
