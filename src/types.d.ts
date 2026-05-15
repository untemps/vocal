// Web Speech API types not yet in standard lib.dom.d.ts
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
