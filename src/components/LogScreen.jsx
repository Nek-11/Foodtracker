import { useState, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { compressImage, makeThumbnail } from '../utils/imageUtils.js'
import { analyzeMeal, reanalyzeMeal, isDemoMode } from '../services/analyze.js'
import { saveMeal } from '../services/storage.js'
import { startListening, isSpeechSupported } from '../services/speech.js'
import { fmt } from '../utils/nutritionUtils.js'
import AnalysisResult from './AnalysisResult.jsx'

const MODE_IDLE    = 'idle'
const MODE_PREVIEW = 'preview'
const MODE_LOADING = 'loading'
const MODE_RESULT  = 'result'
const MODE_SAVED   = 'saved'

export default function LogScreen({ onMealSaved }) {
  const [mode, setMode] = useState(MODE_IDLE)
  const [foodImage, setFoodImage] = useState(null)       // compressed data URL
  const [labelImage, setLabelImage] = useState(null)     // compressed data URL
  const [thumbnail, setThumbnail] = useState(null)       // small data URL for storage
  const [note, setNote] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [pendingMealId, setPendingMealId] = useState(null)

  const stopListeningRef = useRef(null)
  const foodInputRef = useRef(null)
  const labelInputRef = useRef(null)

  // --- Image picking ---

  async function handleFoodImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const [compressed, thumb] = await Promise.all([
      compressImage(file),
      makeThumbnail(file),
    ])
    setFoodImage(compressed)
    setThumbnail(thumb)
    setLabelImage(null)
    setNote('')
    setAnalysis(null)
    setMode(MODE_PREVIEW)
  }

  async function handleLabelImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setLabelImage(compressed)
  }

  function clearFoodImage() {
    setFoodImage(null)
    setThumbnail(null)
    setLabelImage(null)
    setNote('')
    setAnalysis(null)
    setError(null)
    setMode(MODE_IDLE)
    if (foodInputRef.current) foodInputRef.current.value = ''
    if (labelInputRef.current) labelInputRef.current.value = ''
  }

  // --- Voice recording ---

  function toggleRecording() {
    if (isRecording) {
      if (stopListeningRef.current) stopListeningRef.current()
      stopListeningRef.current = null
      setIsRecording(false)
      return
    }

    setIsRecording(true)
    let accumulatedFinal = note ? note + ' ' : ''

    const stop = startListening(
      (transcript, isFinal) => {
        if (isFinal) {
          accumulatedFinal += transcript + ' '
          setNote(accumulatedFinal.trim())
        } else {
          setNote((accumulatedFinal + transcript).trim())
        }
      },
      (err) => {
        setError(err)
        setIsRecording(false)
        stopListeningRef.current = null
      }
    )
    stopListeningRef.current = stop

    // Auto-stop after 60s
    setTimeout(() => {
      if (stopListeningRef.current) {
        stopListeningRef.current()
        stopListeningRef.current = null
        setIsRecording(false)
      }
    }, 60000)
  }

  // --- Analysis ---

  async function handleAnalyze() {
    if (!foodImage && !note.trim()) {
      setError('Add a photo or describe your meal.')
      return
    }

    setError(null)
    setMode(MODE_LOADING)

    try {
      const result = await analyzeMeal({
        foodImage: foodImage || null,
        labelImage: labelImage || null,
        note: note.trim(),
      })
      setAnalysis(result)
      setPendingMealId(uuidv4())
      setMode(MODE_RESULT)
    } catch (err) {
      setError(err.message)
      setMode(foodImage ? MODE_PREVIEW : MODE_IDLE)
    }
  }

  async function handleReanalyze(clarificationNote) {
    setMode(MODE_LOADING)
    setError(null)
    try {
      const result = await reanalyzeMeal({
        foodImage: foodImage || null,
        labelImage: labelImage || null,
        note: clarificationNote,
        previousAnalysis: analysis,
      })
      setAnalysis(result)
      setMode(MODE_RESULT)
    } catch (err) {
      setError(err.message)
      setMode(MODE_RESULT)
    }
  }

  function handleSave() {
    const meal = {
      id: pendingMealId || uuidv4(),
      timestamp: new Date().toISOString(),
      thumbnail: thumbnail || null,
      note: note.trim(),
      analysis,
    }
    saveMeal(meal)
    setMode(MODE_SAVED)
    setTimeout(() => {
      // Reset for next meal
      setFoodImage(null)
      setThumbnail(null)
      setLabelImage(null)
      setNote('')
      setAnalysis(null)
      setError(null)
      setPendingMealId(null)
      setMode(MODE_IDLE)
      if (foodInputRef.current) foodInputRef.current.value = ''
      if (labelInputRef.current) labelInputRef.current.value = ''
      if (onMealSaved) onMealSaved()
    }, 1500)
  }

  function handleDiscard() {
    clearFoodImage()
  }

  // --- Render ---

  if (mode === MODE_LOADING) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-emerald-400 spinner" />
        <p className="text-slate-400 text-sm">Analyzing your meal…</p>
      </div>
    )
  }

  if (mode === MODE_SAVED) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Meal saved!</p>
      </div>
    )
  }

  if (mode === MODE_RESULT && analysis) {
    return (
      <AnalysisResult
        analysis={analysis}
        thumbnail={thumbnail}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onReanalyze={handleReanalyze}
        error={error}
      />
    )
  }

  // IDLE or PREVIEW mode
  const demo = isDemoMode()
  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Log a Meal</h1>
        <p className="text-slate-400 text-sm mt-1">Photo, voice note, or both</p>
      </div>

      {demo && (
        <div className="mx-4 mt-3 bg-blue-900/30 border border-blue-700/50 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-blue-300">Demo mode — add your API key in Settings for real analysis</p>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Food photo */}
      <section className="mx-4 mt-4">
        {foodImage ? (
          <div className="relative rounded-2xl overflow-hidden">
            <img src={foodImage} alt="Food" className="w-full object-cover max-h-64 rounded-2xl" />
            <button
              onClick={clearFoodImage}
              className="absolute top-2 right-2 bg-slate-900/70 rounded-full p-2"
              aria-label="Remove photo"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <label
            htmlFor="food-input"
            className="flex flex-col items-center justify-center gap-3 h-48 bg-slate-800 rounded-2xl border-2 border-dashed border-slate-600 cursor-pointer active:border-emerald-500 transition-colors"
          >
            <div className="w-14 h-14 bg-slate-700 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-slate-300 font-medium">Take or upload a photo</span>
            <span className="text-slate-500 text-xs">tap to open camera</span>
          </label>
        )}
        <input
          id="food-input"
          ref={foodInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFoodImage}
        />
      </section>

      {/* Nutrition label (only shown if food photo exists) */}
      {foodImage && (
        <section className="mx-4 mt-3">
          {labelImage ? (
            <div className="flex items-center gap-3 bg-slate-800 rounded-2xl px-4 py-3">
              <img src={labelImage} alt="Label" className="w-12 h-12 object-cover rounded-lg" />
              <div className="flex-1">
                <p className="text-sm font-medium">Nutrition label added</p>
                <p className="text-xs text-slate-400">Claude will use label values</p>
              </div>
              <button
                onClick={() => { setLabelImage(null); if (labelInputRef.current) labelInputRef.current.value = '' }}
                className="text-slate-400 hover:text-white"
                aria-label="Remove label"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <label
              htmlFor="label-input"
              className="flex items-center gap-3 bg-slate-800 rounded-2xl px-4 py-3 cursor-pointer active:bg-slate-700 transition-colors"
            >
              <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">Add nutrition label</p>
                <p className="text-xs text-slate-500">For packaged food — optional</p>
              </div>
            </label>
          )}
          <input
            id="label-input"
            ref={labelInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleLabelImage}
          />
        </section>
      )}

      {/* Voice note */}
      <section className="mx-4 mt-3">
        <div className="bg-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={toggleRecording}
              disabled={!isSpeechSupported()}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                isRecording
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-slate-700 hover:bg-slate-600 active:scale-95'
              } disabled:opacity-40`}
              aria-label={isRecording ? 'Stop recording' : 'Start voice note'}
            >
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm-1 1.93V19H9a1 1 0 000 2h6a1 1 0 000-2h-2v-2.07A5.003 5.003 0 0017 12v-1a1 1 0 00-2 0v1a3 3 0 01-6 0v-1a1 1 0 00-2 0v1a5.003 5.003 0 004 4.93z"/>
              </svg>
            </button>
            <p className="text-sm text-slate-400">
              {isRecording ? 'Listening… tap mic to stop' : !foodImage ? 'Describe your meal' : 'Add a note (optional)'}
            </p>
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={foodImage ? 'e.g. "the sauce was cream-based, portion was quite large"' : 'e.g. "I had a bowl of oatmeal with banana and almond milk"'}
            rows={3}
            className="w-full bg-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>
      </section>

      {/* Analyze button */}
      <div className="mx-4 mt-5">
        <button
          onClick={handleAnalyze}
          disabled={!foodImage && !note.trim()}
          className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl font-semibold text-base transition-all text-white"
        >
          Analyze Meal
        </button>
      </div>
    </div>
  )
}
