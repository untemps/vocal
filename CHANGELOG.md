## [2.3.5](https://github.com/untemps/vocal/compare/v2.3.4...v2.3.5) (2026-07-04)

## [2.3.4](https://github.com/untemps/vocal/compare/v2.3.3...v2.3.4) (2026-07-04)

## [2.3.3](https://github.com/untemps/vocal/compare/v2.3.2...v2.3.3) (2026-07-04)


### Bug Fixes

* Pass an abort signal to start() so aborting cancels the handshake promptly ([#140](https://github.com/untemps/vocal/issues/140)) ([a919ae9](https://github.com/untemps/vocal/commit/a919ae9a8a91046b36b848ab71d249159e98d9ab))

## [2.3.2](https://github.com/untemps/vocal/compare/v2.3.1...v2.3.2) (2026-07-04)


### Bug Fixes

* Guard the starting flag against superseded start() activations ([#139](https://github.com/untemps/vocal/issues/139)) ([6ac05b4](https://github.com/untemps/vocal/commit/6ac05b4e17d6cb56b9dc35d7072d959e3fa3a55f))

## [2.3.1](https://github.com/untemps/vocal/compare/v2.3.0...v2.3.1) (2026-07-04)


### Bug Fixes

* Clean up Gladia close timer and keep abort reachable during start ([#138](https://github.com/untemps/vocal/issues/138)) ([f4c8be4](https://github.com/untemps/vocal/commit/f4c8be443355dc5a07dd215ef82fd0f30256ec10))

# [2.3.0](https://github.com/untemps/vocal/compare/v2.2.0...v2.3.0) (2026-07-04)


### Features

* Introduce a pluggable SpeechEngine abstraction to support backends beyond the Web Speech API ([#135](https://github.com/untemps/vocal/issues/135)) ([24c883d](https://github.com/untemps/vocal/commit/24c883d2abf09329aca851de3474411fbe119063))

# [2.2.0](https://github.com/untemps/vocal/compare/v2.1.0...v2.2.0) (2026-06-18)


### Features

* Expose microphone permission state outside a start() session ([#133](https://github.com/untemps/vocal/issues/133)) ([dfc1f2e](https://github.com/untemps/vocal/commit/dfc1f2e1e0eddf719fbb0f22f05ecb27eb06a7b3))

# [2.1.0](https://github.com/untemps/vocal/compare/v2.0.1...v2.1.0) (2026-06-18)


### Features

* Migrate to @untemps/user-permissions-utils v2 ([#131](https://github.com/untemps/vocal/issues/131)) ([fa03b03](https://github.com/untemps/vocal/commit/fa03b036e97601086df00dbf506a41a3a2973f20))

## [2.0.1](https://github.com/untemps/vocal/compare/v2.0.0...v2.0.1) (2026-05-23)

# [2.0.0](https://github.com/untemps/vocal/compare/v1.3.5...v2.0.0) (2026-05-23)


* refactor!: Select best RESULT transcript by confidence ([#44](https://github.com/untemps/vocal/issues/44)) ([2318302](https://github.com/untemps/vocal/commit/2318302c322ec73aea61b1a1328cfa95e1a48d91))


### Bug Fixes

* Expose item() on synthetic aggregated result event ([#122](https://github.com/untemps/vocal/issues/122)) ([9de2c7f](https://github.com/untemps/vocal/commit/9de2c7ffe1e0c028a9bda73289d0eaa14646178b))
* Re-check instance after getUserMediaStream awaits in start() ([#121](https://github.com/untemps/vocal/issues/121)) ([20b8edd](https://github.com/untemps/vocal/commit/20b8eddfb2bd2f80bec7d3ae4abc26d45d54eac5))
* Remove internal end listener on cleanup ([#68](https://github.com/untemps/vocal/issues/68)) ([457d312](https://github.com/untemps/vocal/commit/457d31235ca126654c2eb9219780a34a863452f6))
* Return false from isSupported in non-browser environments ([#65](https://github.com/untemps/vocal/issues/65)) ([0e81ec9](https://github.com/untemps/vocal/commit/0e81ec9f73def707bcffc6bbdeec65cf22f7528d))
* Suppress intermediate result events in continuous mode ([#90](https://github.com/untemps/vocal/issues/90)) ([df29a48](https://github.com/untemps/vocal/commit/df29a4808013c7952eac97ec19fc7e76b6ee91f9))
* Throw on invalid event type in addEventListener and removeEventListener ([#69](https://github.com/untemps/vocal/issues/69)) ([abdca5e](https://github.com/untemps/vocal/commit/abdca5e71696cd8717587454284ec9a64fa7cc0c))
* Use resultIndex to select current result in continuous mode ([#64](https://github.com/untemps/vocal/issues/64)) ([946ad72](https://github.com/untemps/vocal/commit/946ad72261df5b247d0504c85a55aa95c5a7bc18))


### chore

* Add type module and rename CJS dist to index.cjs ([#45](https://github.com/untemps/vocal/issues/45)) ([54901f9](https://github.com/untemps/vocal/commit/54901f97e7924336e10b6b934003b1c152eabc0e))
* Remove UMD bundle from distribution ([#78](https://github.com/untemps/vocal/issues/78)) ([c7f5c60](https://github.com/untemps/vocal/commit/c7f5c6065e2b0ab47a65d9c0524875bc72088fdc))


### Code Refactoring

* Move from class-based to functional API ([#88](https://github.com/untemps/vocal/issues/88)) ([1ec1f41](https://github.com/untemps/vocal/commit/1ec1f41f285060b2a45dd62d4351dbefc4466dd2))
* Remove deprecated serviceURI option ([#33](https://github.com/untemps/vocal/issues/33)) ([3ef86f5](https://github.com/untemps/vocal/commit/3ef86f5ffd07fb5cec60034a2abb0e56321f2a68))
* Remove once() method ([#87](https://github.com/untemps/vocal/issues/87)) ([d79eb74](https://github.com/untemps/vocal/commit/d79eb74b43bb5ebfc0bdbf9e71413165009a7847))


### Features

* Add isRecording getter to track recognition state ([#41](https://github.com/untemps/vocal/issues/41)) ([fa22546](https://github.com/untemps/vocal/commit/fa225465453256922c1da3bb3355ed2b51a7247d))
* Add once() method for one-shot event listener registration ([#76](https://github.com/untemps/vocal/issues/76)) ([54b4868](https://github.com/untemps/vocal/commit/54b48680aca1eed2a3397ca8013960cb576332e4))
* Auto-restart recognition on silence in continuous mode ([#84](https://github.com/untemps/vocal/issues/84)) ([280e4da](https://github.com/untemps/vocal/commit/280e4da411c6eb72723da05896f3c27cdf3fb5f8))
* Expose AbortSignal support in start() ([#42](https://github.com/untemps/vocal/issues/42)) ([f709801](https://github.com/untemps/vocal/commit/f7098013a1c6c4e59e7adcb46ee44437233d1e27))
* Preserve real confidence and alternatives in aggregated result event ([#125](https://github.com/untemps/vocal/issues/125)) ([ddf5f65](https://github.com/untemps/vocal/commit/ddf5f651e872156f19491ff61b582e83c004bfd3))
* Remove instance getter to prevent implementation leakage ([#77](https://github.com/untemps/vocal/issues/77)) ([94c8579](https://github.com/untemps/vocal/commit/94c8579127bbf7a8bd2ce5d1aa550495be317e9d))
* start() rejects on error instead of always resolving ([#43](https://github.com/untemps/vocal/issues/43)) ([fb80f3e](https://github.com/untemps/vocal/commit/fb80f3e0a595301ab819bc13307a5be9021660b4))
* Support multiple listeners per event type in addEventListener ([#75](https://github.com/untemps/vocal/issues/75)) ([8157811](https://github.com/untemps/vocal/commit/8157811fdb11179835c3158ed11db44b6d2b4147))


### BREAKING CHANGES

* event.results no longer contains a single fake result. It now contains N entries (1 per captured final utterance), each with its real alternatives and confidences. Consumers that read `event.results[0][0].transcript` to obtain the joined transcript now get only the first utterance's best transcript. Migration: read `bestAlternative` (the 2nd argument of the listener) for the joined transcript — its value is unchanged. To enumerate per-utterance detail, iterate `event.results`.
* every public entry point changes shape:
- `new Vocal(options)` → `createVocal(options)`
- `Vocal.isSupported` (static getter) → `isSupported()` (function)
- `Vocal.eventTypes` (static) → `eventTypes` (named export)
- `vocal.addEventListener(type, cb)` → `vocal.on(type, cb)`
- `vocal.removeEventListener(type, cb?)` → `vocal.off(type, cb?)`
- Side-effect methods (`stop`, `abort`, `on`, `off`, `cleanup`) now
  return `void` instead of `this` — chaining is no longer supported.
- The `Vocal` class is no longer exported; the new `VocalInstance`
  interface describes the object returned by `createVocal()`.
Migration:
  // before
  import { Vocal } from '@untemps/vocal'
  if (!Vocal.isSupported) throw new Error()
  const vocal = new Vocal({ lang: 'fr-FR' })
  vocal.addEventListener('result', cb)
  // after
  import { createVocal, isSupported } from '@untemps/vocal'
  if (!isSupported()) throw new Error()
  const vocal = createVocal({ lang: 'fr-FR' })
  vocal.on('result', cb)
* vocal.once(eventType, callback) is removed. Consumers relying on it must replace the call with a manual addEventListener + removeEventListener pair:
   const handler = (event, best) => {
      vocal.removeEventListener('result', handler)
      // ...
   }
   vocal.addEventListener('result', handler)
* continuous mode now keeps the session alive across silence and aggregates results — semantics that callers using `continuous: true` must adapt to:
- Recording no longer ends after ~7s of silence; call `stop()` or `abort()` explicitly to terminate the session.
- A synthetic `result` event is emitted just before `end` on `stop()`, carrying the joined final transcripts. `event instanceof SpeechRecognitionEvent` returns `false` for this event — read the transcript through the listener's second argument (`(event, bestAlternative, alternatives) => ...`).
- Intermediate `end` and `start` events fired by the browser during silent restart cycles are no longer forwarded to user listeners. `isRecording` stays `true` across the cycle.
- `abort()` discards the aggregated buffer without emitting.
`continuous: false` consumers see no behavioural change.
* dist/index.umd.js is no longer published. Consumers loading via <script> tags or AMD loaders should use dist/index.es.js with a module-aware loader instead.
* vocal.instance is removed. Consumers who accessed the raw SpeechRecognition object must migrate to Vocal API methods.
* addEventListener now stacks listeners instead of replacing. removeEventListener(eventType) removes all handlers for the type
removeEventListener(eventType, callback) removes only the specific callback.
* "main" field: dist/index.js → dist/index.cjs. Consumers using the main field directly (not via the exports map) must update their import path.
Consumers using the exports map (require/import conditions) are not affected.
* The RESULT callback signature changes from (event, transcript: string, alternatives: string[]) to (event, bestAlternative: string, alternatives: string[]) where bestAlternative is the alternative with the highest confidence score instead of the first in the array.
Migration: no change needed if confidence ordering matches array order (standard browser behavior); replace transcript with bestAlternative if using the parameter name.
* start(): no longer resolves when the microphone stream fails. Callers who did not handle rejections will receive an UnhandledPromiseRejection.
Migration: wrap await vocal.start() in try/catch, or use .catch().
* VocalOptions.serviceURI removed. Passing it to Vocal() is now a TS error.
Runtime behavior unchanged — browsers already ignored this option.
Migration: remove serviceURI from options passed to new Vocal().

## [1.3.5](https://github.com/untemps/vocal/compare/v1.3.4...v1.3.5) (2026-05-17)

## [1.3.4](https://github.com/untemps/vocal/compare/v1.3.3...v1.3.4) (2026-05-15)

## [1.3.3](https://github.com/untemps/vocal/compare/v1.3.2...v1.3.3) (2026-05-15)

## [1.3.2](https://github.com/untemps/vocal/compare/v1.3.1...v1.3.2) (2026-05-15)


### Bug Fixes

* Expose all RESULT alternatives as third callback argument ([#35](https://github.com/untemps/vocal/issues/35)) ([87760ea](https://github.com/untemps/vocal/commit/87760eac36f05083de8d84a9bb606ec47dd395e8))

## [1.3.1](https://github.com/untemps/vocal/compare/v1.3.0...v1.3.1) (2026-05-15)

# [1.3.0](https://github.com/untemps/vocal/compare/v1.2.1...v1.3.0) (2021-05-24)


### Features

* Improve isSupported getter by checking navigator.permissions and navigator.mediaDevices support ([#11](https://github.com/untemps/vocal/issues/11)) ([ddb67ac](https://github.com/untemps/vocal/commit/ddb67ac039743f0c658bb68a787bf6c4b21ae0f2))

## [1.2.1](https://github.com/untemps/vocal/compare/v1.2.0...v1.2.1) (2021-05-23)

# [1.2.0](https://github.com/untemps/vocal/compare/v1.1.1...v1.2.0) (2021-05-23)


### Features

* Remove SpeechGrammarList check from isSupported getter and add extra check in constructor ([#4](https://github.com/untemps/vocal/issues/4)) ([39f8b80](https://github.com/untemps/vocal/commit/39f8b80a018b0eeaef9b027e0dd763df5166b425))

## [1.1.1](https://github.com/untemps/vocal/compare/v1.1.0...v1.1.1) (2021-05-21)


### Bug Fixes

* Check if SpeechGrammarList API is supported along with SpeechRecognition API, [#1](https://github.com/untemps/vocal/issues/1) ([2fb5e3b](https://github.com/untemps/vocal/commit/2fb5e3b353d3b37b166d694a97538297251c419e))

# [1.1.0](https://github.com/untemps/vocal/compare/v1.0.0...v1.1.0) (2021-05-20)


### Features

* Make the Vocal event API more predictable ([8f1b922](https://github.com/untemps/vocal/commit/8f1b922b1d42c8ccfe3e4e4e5f37e5d8612e285d))

# 1.0.0 (2021-05-20)


### Features

* Initialize project ([9d8c635](https://github.com/untemps/vocal/commit/9d8c635333c8f214633d78dba5ec80cdf199bf09))
