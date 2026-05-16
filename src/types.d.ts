// Web Speech API types not yet in standard lib.dom.d.ts

declare interface SpeechRecognitionAlternative {
	readonly transcript: string
	readonly confidence: number
}

declare interface SpeechRecognitionResult {
	readonly length: number
	readonly isFinal: boolean
	item(index: number): SpeechRecognitionAlternative
	[index: number]: SpeechRecognitionAlternative
}

declare interface SpeechRecognitionResultList {
	readonly length: number
	item(index: number): SpeechRecognitionResult
	[index: number]: SpeechRecognitionResult
}

declare interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number
	readonly results: SpeechRecognitionResultList
}

declare interface SpeechRecognitionErrorEvent extends Event {
	readonly error: string
	readonly message: string
}

declare interface SpeechRecognition extends EventTarget {
	continuous: boolean
	grammars: SpeechGrammarList | null
	interimResults: boolean
	lang: string
	maxAlternatives: number
	start(): void
	stop(): void
	abort(): void
}

declare var SpeechRecognition: {
	new (): SpeechRecognition
	prototype: SpeechRecognition
}

declare interface SpeechGrammarList {
	length: number
}

declare var SpeechGrammarList: {
	new (): SpeechGrammarList
	prototype: SpeechGrammarList
}

declare interface Window {
	SpeechRecognition?: typeof SpeechRecognition
	webkitSpeechRecognition?: typeof SpeechRecognition
	mozSpeechRecognition?: typeof SpeechRecognition
	msSpeechRecognition?: typeof SpeechRecognition
	SpeechGrammarList?: typeof SpeechGrammarList
	webkitSpeechGrammarList?: typeof SpeechGrammarList
	mozSpeechGrammarList?: typeof SpeechGrammarList
	msSpeechGrammarList?: typeof SpeechGrammarList
}
