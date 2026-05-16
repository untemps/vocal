# [2.0.0-beta.15](https://github.com/untemps/vocal/compare/v2.0.0-beta.14...v2.0.0-beta.15) (2026-05-16)


### Features

* Support multiple listeners per event type in addEventListener ([#75](https://github.com/untemps/vocal/issues/75)) ([97a435d](https://github.com/untemps/vocal/commit/97a435dc09105fadb9d8c22052ddaa75cbb6ee26))


### BREAKING CHANGES

* addEventListener now stacks listeners instead of replacing. removeEventListener(eventType) removes all handlers for the type
removeEventListener(eventType, callback) removes only the specific callback.

# [2.0.0-beta.14](https://github.com/untemps/vocal/compare/v2.0.0-beta.13...v2.0.0-beta.14) (2026-05-16)

# [2.0.0-beta.13](https://github.com/untemps/vocal/compare/v2.0.0-beta.12...v2.0.0-beta.13) (2026-05-16)

# [2.0.0-beta.12](https://github.com/untemps/vocal/compare/v2.0.0-beta.11...v2.0.0-beta.12) (2026-05-16)

# [2.0.0-beta.11](https://github.com/untemps/vocal/compare/v2.0.0-beta.10...v2.0.0-beta.11) (2026-05-16)


### Bug Fixes

* Throw on invalid event type in addEventListener and removeEventListener ([#69](https://github.com/untemps/vocal/issues/69)) ([a474718](https://github.com/untemps/vocal/commit/a474718fc7f36e4828a5430cf7c19b851401189d))

# [2.0.0-beta.10](https://github.com/untemps/vocal/compare/v2.0.0-beta.9...v2.0.0-beta.10) (2026-05-16)


### Bug Fixes

* Remove internal end listener on cleanup ([#68](https://github.com/untemps/vocal/issues/68)) ([3179943](https://github.com/untemps/vocal/commit/31799433b054cca334d6159d8aae9e00c8971b6d))

# [2.0.0-beta.9](https://github.com/untemps/vocal/compare/v2.0.0-beta.8...v2.0.0-beta.9) (2026-05-16)

# [2.0.0-beta.8](https://github.com/untemps/vocal/compare/v2.0.0-beta.7...v2.0.0-beta.8) (2026-05-16)


### Bug Fixes

* Return false from isSupported in non-browser environments ([#65](https://github.com/untemps/vocal/issues/65)) ([56f67cc](https://github.com/untemps/vocal/commit/56f67cc6cc9ff6288472d1461a71d3e0cbc128ed))

# [2.0.0-beta.7](https://github.com/untemps/vocal/compare/v2.0.0-beta.6...v2.0.0-beta.7) (2026-05-16)


### Bug Fixes

* Use resultIndex to select current result in continuous mode ([#64](https://github.com/untemps/vocal/issues/64)) ([62d61c4](https://github.com/untemps/vocal/commit/62d61c41ec7713cb01d578568b462734324e722a))

# [2.0.0-beta.6](https://github.com/untemps/vocal/compare/v2.0.0-beta.5...v2.0.0-beta.6) (2026-05-16)


### chore

* Add type module and rename CJS dist to index.cjs ([#45](https://github.com/untemps/vocal/issues/45)) ([e9923af](https://github.com/untemps/vocal/commit/e9923af7032fe48fc0b214bb77e3d6708a4b1adb))


### BREAKING CHANGES

* "main" field: dist/index.js → dist/index.cjs. Consumers using the main field directly (not via the exports map) must update their import path.
Consumers using the exports map (require/import conditions) are not affected.

# [2.0.0-beta.5](https://github.com/untemps/vocal/compare/v2.0.0-beta.4...v2.0.0-beta.5) (2026-05-16)


* refactor!: Select best RESULT transcript by confidence ([#44](https://github.com/untemps/vocal/issues/44)) ([4713366](https://github.com/untemps/vocal/commit/471336641a156623a17b6f7e0602658a3086381d))


### BREAKING CHANGES

* The RESULT callback signature changes from (event, transcript: string, alternatives: string[]) to (event, bestAlternative: string, alternatives: string[]) where bestAlternative is the alternative with the highest confidence score instead of the first in the array.
Migration: no change needed if confidence ordering matches array order (standard browser behavior); replace transcript with bestAlternative if using the parameter name.

# [2.0.0-beta.4](https://github.com/untemps/vocal/compare/v2.0.0-beta.3...v2.0.0-beta.4) (2026-05-16)


### Features

* start() rejects on error instead of always resolving ([#43](https://github.com/untemps/vocal/issues/43)) ([4414f11](https://github.com/untemps/vocal/commit/4414f11608e795b94845d06e6be53e8e5a76e022))


### BREAKING CHANGES

* start(): no longer resolves when the microphone stream fails. Callers who did not handle rejections will receive an UnhandledPromiseRejection.
Migration: wrap await vocal.start() in try/catch, or use .catch().

# [2.0.0-beta.3](https://github.com/untemps/vocal/compare/v2.0.0-beta.2...v2.0.0-beta.3) (2026-05-15)


### Features

* Expose AbortSignal support in start() ([#42](https://github.com/untemps/vocal/issues/42)) ([a7f638b](https://github.com/untemps/vocal/commit/a7f638b541347a4377bce1f43a47aa5290ea2852))

# [2.0.0-beta.2](https://github.com/untemps/vocal/compare/v2.0.0-beta.1...v2.0.0-beta.2) (2026-05-15)


### Features

* Add isRecording getter to track recognition state ([#41](https://github.com/untemps/vocal/issues/41)) ([7abcc56](https://github.com/untemps/vocal/commit/7abcc566f40aa95af88078d2a7632ef8633cad5a))

# [2.0.0-beta.1](https://github.com/untemps/vocal/compare/v1.3.4-beta.1...v2.0.0-beta.1) (2026-05-15)


### Code Refactoring

* Remove deprecated serviceURI option ([#33](https://github.com/untemps/vocal/issues/33)) ([67e233a](https://github.com/untemps/vocal/commit/67e233ade674861cbf2627ac9eb2dbe2150f4ca8))


### BREAKING CHANGES

* VocalOptions.serviceURI removed. Passing it to Vocal() is now a TS error.
Runtime behavior unchanged — browsers already ignored this option.
Migration: remove serviceURI from options passed to new Vocal().

## [1.3.4-beta.1](https://github.com/untemps/vocal/compare/v1.3.3...v1.3.4-beta.1) (2026-05-15)

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
