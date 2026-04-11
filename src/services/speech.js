/**
 * Speech-to-text abstraction.
 *
 * Current implementation: browser Web Speech API (webkitSpeechRecognition).
 * Future: swap startListening/stopListening for a Whisper API call
 * by replacing this module's implementation without touching any component.
 */

let recognition = null

export function isSpeechSupported() {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

/**
 * Start continuous speech recognition.
 *
 * @param {function} onTranscript - called with (transcript: string, isFinal: boolean)
 * @param {function} onError     - called with (errorMessage: string)
 * @returns {function} stop — call to stop listening
 */
export function startListening(onTranscript, onError) {
  if (!isSpeechSupported()) {
    onError('Speech recognition is not supported in this browser.')
    return () => {}
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SpeechRecognition()
  recognition.lang = 'en-US'
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onresult = (event) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        final += text + ' '
      } else {
        interim += text
      }
    }
    if (final) onTranscript(final.trim(), true)
    else if (interim) onTranscript(interim.trim(), false)
  }

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone permission denied.',
      'no-speech': 'No speech detected. Try again.',
      'network': 'Network error during transcription.',
    }
    onError(messages[event.error] || `Speech error: ${event.error}`)
  }

  recognition.onend = () => {
    recognition = null
  }

  recognition.start()

  return () => {
    if (recognition) {
      recognition.stop()
      recognition = null
    }
  }
}

export function stopListening() {
  if (recognition) {
    recognition.stop()
    recognition = null
  }
}
