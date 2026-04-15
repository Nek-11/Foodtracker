/**
 * Speech-to-text abstraction.
 *
 * Two implementations:
 *  1. Browser Web Speech API (webkitSpeechRecognition) — real-time, no key needed
 *  2. OpenAI Whisper — record audio via MediaRecorder, then POST to Whisper API
 *
 * LogScreen picks the right one based on whether an OpenAI key is configured.
 */

let recognition = null

// ── Web Speech API ─────────────────────────────────────────────────────────────

export function isSpeechSupported() {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

/**
 * Start continuous speech recognition (Web Speech API).
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

// ── OpenAI Whisper ─────────────────────────────────────────────────────────────

export function isMediaRecordingSupported() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * Start recording audio via MediaRecorder.
 *
 * @param {function} onError - called with (errorMessage: string) on mic access failure
 * @returns {Promise<function>} resolves to a stopAndGetBlob() async function.
 *   Call stopAndGetBlob() to stop recording and receive the audio Blob.
 */
export async function startMediaRecording(onError) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'Microphone permission denied.'
      : `Could not access microphone: ${err.message}`
    onError(msg)
    throw err
  }

  // Pick a supported MIME type (prefer mp4/aac for iOS, fall back to webm)
  const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    .find(t => MediaRecorder.isTypeSupported(t)) || ''

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
  const chunks = []

  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  // Brief warm-up: give the audio pipeline ~300 ms to stabilize before
  // starting capture so the very beginning of speech isn't clipped.
  await new Promise(r => setTimeout(r, 300))
  recorder.start()

  // Returns a Promise that resolves with the recorded Blob once recording stops
  return () =>
    new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        resolve(blob)
      }
      recorder.stop()
    })
}

/**
 * Send an audio Blob to OpenAI Whisper and return the transcript text.
 *
 * @param {Blob} audioBlob
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} transcript
 */
export async function transcribeWithWhisper(audioBlob, apiKey) {
  // Determine file extension from MIME type so Whisper accepts the file
  const mime = audioBlob.type || 'audio/webm'
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('ogg') ? 'ogg'
    : 'webm'

  const formData = new FormData()
  formData.append('file', new File([audioBlob], `recording.${ext}`, { type: mime }))
  formData.append('model', 'whisper-1')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Whisper API error ${response.status}`)
  }

  const data = await response.json()
  return (data.text || '').trim()
}
