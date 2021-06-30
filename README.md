# @untemps/vocal

Class wrapped around the SpeechRecognition Web API

![npm](https://img.shields.io/npm/v/@untemps/vocal?style=for-the-badge)
![GitHub Workflow Status](https://img.shields.io/github/workflow/status/untemps/vocal/deploy?style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/untemps/vocal?style=for-the-badge)

## Installation

```bash
yarn add @untemps/vocal
```

## Basic Usage

Import `Vocal` to a file.

```javascript
import { Vocal } from '@untemps/vocal';

// Check if it is supported
if (!Vocal.isSupported()) {
  throw "Microphone API Not supported";
  return;
}

// Create Instance
const vocal = new Vocal();

// Start Recording
vocal.start();

// Stop/Pause recording
vocal.stop();

// Abort recording entirely
vocal.abort();

// Clean up and remove the Vocal instance
vocal.cleanup();
```

## Options

(todo)
