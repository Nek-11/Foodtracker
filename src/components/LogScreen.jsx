import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Camera, Mic, MicOff, FileText, X, Sparkles, Loader, ScanBarcode } from 'lucide-react'
import { compressImage, makeThumbnail } from '../utils/imageUtils.js'
import { analyzeMeal, NoApiKeyError } from '../services/analyzer.js'
import { saveMeal, savePendingData, updateMeal, clearPendingData, getSettings } from '../services/storage.js'
import {
  startListening, isSpeechSupported,
  startMediaRecording, transcribeWithWhisper, isMediaRecordingSupported,
} from '../services/speech.js'
import { startBarcodeScanner, fetchProductFromBarcode, formatProductForAnalysis } from '../services/barcode.js'
import { hapticSuccess, hapticError, hapticLight } from '../utils/haptics.js'
import { friendlyError } from '../utils/errorMessages.js'

export default function LogScreen({ onMealSubmitted }) {
  const [foodImage,      setFoodImage]      = useState(null)
  const [labelImage,     setLabelImage]     = useState(null)
  const [thumbnail,      setThumbnail]      = useState(null)
  const [note,           setNote]           = useState('')
  const [isRecording,    setIsRecording]    = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error,          setError]          = useState(null)
  const [isLoading,      setIsLoading]      = useState(false)

  // Barcode scanner state
  const [showScanner,    setShowScanner]    = useState(false)
  const [isScannerReady, setIsScannerReady] = useState(false)
  const [scannerError,   setScannerError]   = useState(null)
  const [scannedProduct, setScannedProduct] = useState(null)
  const [isFetchingProduct, setIsFetchingProduct] = useState(false)

  const stopListeningRef  = useRef(null) // Web Speech stop fn
  const whisperStopRef    = useRef(null) // Whisper async stop fn
  const foodInputRef      = useRef(null)
  const labelInputRef     = useRef(null)
  const scannerVideoRef   = useRef(null)
  const stopScannerRef    = useRef(null)

  // Determine recording mode
  const settings    = getSettings()
  const openaiKey   = settings.openaiApiKey
  const useWhisper  = !!(openaiKey && openaiKey.startsWith('sk-') && isMediaRecordingSupported())
  const canRecord   = useWhisper || isSpeechSupported()

  // ── Barcode scanner ────────────────────────────────────────────────────────

  async function openBarcodeScanner() {
    hapticLight()
    setScannerError(null)
    setIsScannerReady(false)
    setShowScanner(true)
  }

  useEffect(() => {
    if (!showScanner || !scannerVideoRef.current) return

    let stopFn = null

    async function initScanner() {
      stopFn = await startBarcodeScanner(
        scannerVideoRef.current,
        async (barcode) => {
          // Stop scanning immediately
          if (stopFn) stopFn()
          stopScannerRef.current = null
          setShowScanner(false)
          setIsFetchingProduct(true)
          hapticSuccess()

          const product = await fetchProductFromBarcode(barcode)
          setIsFetchingProduct(false)

          if (product) {
            setScannedProduct(product)
          } else {
            setError(`Barcode ${barcode} not found in the product database. Try adding a description manually.`)
          }
        },
        (errMsg) => {
          setScannerError(errMsg)
          setIsScannerReady(false)
        }
      )
      stopScannerRef.current = stopFn
      setIsScannerReady(true)
    }

    initScanner()

    return () => {
      if (stopScannerRef.current) {
        stopScannerRef.current()
        stopScannerRef.current = null
      }
    }
  }, [showScanner])

  function closeBarcodeScanner() {
    if (stopScannerRef.current) {
      stopScannerRef.current()
      stopScannerRef.current = null
    }
    setShowScanner(false)
    setScannerError(null)
  }

  function removeScannedProduct() {
    setScannedProduct(null)
  }

  // ── Image picking ──────────────────────────────────────────────────────────

  async function handleFoodImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const [compressed, thumb] = await Promise.all([compressImage(file), makeThumbnail(file)])
    setFoodImage(compressed)
    setThumbnail(thumb)
  }

  async function handleLabelImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLabelImage(await compressImage(file))
  }

  function clearFood() {
    setFoodImage(null); setThumbnail(null); setLabelImage(null)
    setNote(''); setError(null); setScannedProduct(null)
    if (foodInputRef.current)  foodInputRef.current.value = ''
    if (labelInputRef.current) labelInputRef.current.value = ''
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  async function toggleRecording() {
    hapticLight()

    if (isRecording) {
      // ── Stop ──
      if (useWhisper) {
        if (whisperStopRef.current) {
          // stopAndGetBlob is an async fn — call it; it'll set isTranscribing
          const stopFn = whisperStopRef.current
          whisperStopRef.current = null
          setIsRecording(false)
          setIsTranscribing(true)
          try {
            const blob = await stopFn()
            const text = await transcribeWithWhisper(blob, openaiKey)
            if (text) setNote(prev => (prev ? prev + ' ' : '') + text)
          } catch {
            setError('Transcription failed. Try again or type your note manually.')
          } finally {
            setIsTranscribing(false)
          }
        }
      } else {
        stopListeningRef.current?.()
        stopListeningRef.current = null
        setIsRecording(false)
      }
      return
    }

    // ── Start ──
    setError(null)
    setIsRecording(true)

    if (useWhisper) {
      try {
        const stopAndGetBlob = await startMediaRecording(
          err => { setError(err); setIsRecording(false) }
        )
        whisperStopRef.current = stopAndGetBlob
      } catch {
        setIsRecording(false)
      }
    } else {
      let accumulated = note ? note + ' ' : ''
      const stop = startListening(
        (text, isFinal) => {
          if (isFinal) { accumulated += text + ' '; setNote(accumulated.trim()) }
          else          { setNote((accumulated + text).trim()) }
        },
        err => { setError(err); setIsRecording(false); stopListeningRef.current = null }
      )
      stopListeningRef.current = stop
      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (stopListeningRef.current) {
          stopListeningRef.current(); stopListeningRef.current = null; setIsRecording(false)
        }
      }, 60000)
    }
  }

  // ── Submit (background processing) ────────────────────────────────────────

  async function handleSubmit() {
    if (!foodImage && !labelImage && !note.trim() && !scannedProduct) {
      hapticError()
      setError('Add a photo, scan a barcode, or describe your meal first.')
      return
    }
    setIsLoading(true)
    setError(null)

    // Build the final note: combine user note + scanned product context
    const productContext = scannedProduct ? formatProductForAnalysis(scannedProduct) : null
    const fullNote = [note.trim(), productContext].filter(Boolean).join('\n\n')

    const mealId = uuidv4()
    const pendingMeal = {
      id:           mealId,
      timestamp:    new Date().toISOString(),
      thumbnail:    thumbnail || null,
      note:         fullNote,
      analysis:     null,
      status:       'analyzing',
      errorMessage: null,
      userNotes:    null,
    }

    saveMeal(pendingMeal)
    savePendingData(mealId, { foodImage, labelImage, note: fullNote })

    hapticSuccess()
    clearFood()
    setIsLoading(false)
    onMealSubmitted()

    try {
      const analysis = await analyzeMeal({
        foodImage:  foodImage  || null,
        labelImage: labelImage || null,
        note:       fullNote,
      })
      updateMeal(mealId, { analysis, status: 'done' })
      clearPendingData(mealId)
    } catch (err) {
      hapticError()
      updateMeal(mealId, { status: 'error', errorMessage: friendlyError(err) })
      // Keep pending data for NoApiKeyError so user can retry after adding a key
      if (!(err instanceof NoApiKeyError)) clearPendingData(mealId)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const canSubmit = !isLoading && (!!foodImage || !!labelImage || !!note.trim() || !!scannedProduct)

  // Recording hint text
  const recordingHint = isTranscribing
    ? 'Transcribing…'
    : isRecording
      ? useWhisper
        ? 'Recording… tap to stop and transcribe'
        : 'Listening… tap to stop'
      : foodImage
        ? 'Add a voice or text note'
        : 'Describe your meal'

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">

      {/* Barcode scanner overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 pt-safe">
            <p className="text-white font-semibold">Scan a barcode</p>
            <button
              onClick={closeBarcodeScanner}
              className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:bg-white/30"
            >
              <X size={18} className="text-white" />
            </button>
          </div>

          {/* Camera view */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={scannerVideoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />

            {/* Targeting overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-36">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-sm" />
                {/* Scanning line animation */}
                {isScannerReady && (
                  <div className="absolute left-1 right-1 h-0.5 bg-pine-400 opacity-80 animate-scan-line" />
                )}
              </div>
            </div>

            {/* Loading / error states */}
            {!isScannerReady && !scannerError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader size={32} className="text-white animate-spin" />
              </div>
            )}
            {scannerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
                <p className="text-white text-sm">{scannerError}</p>
                <button
                  onClick={closeBarcodeScanner}
                  className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm font-medium active:bg-white/30"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-4 text-center">
            <p className="text-white/60 text-sm">Point at a product barcode</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">Log a Meal</h1>
        <p className="text-sm mt-0.5 text-cream-500 dark:text-pine-400">Photo, barcode, voice note, or a mix</p>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-xl px-4 py-3 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 animate-fade-in">
          {error}
        </div>
      )}

      {/* Fetching product indicator */}
      {isFetchingProduct && (
        <div className="mx-4 mt-3 rounded-xl px-4 py-3 text-sm bg-pine-50 dark:bg-pine-900/60 border border-pine-200 dark:border-pine-700 text-pine-700 dark:text-pine-300 flex items-center gap-2 animate-fade-in">
          <Loader size={14} className="animate-spin flex-shrink-0" />
          Looking up product…
        </div>
      )}

      {/* Scanned product card */}
      {scannedProduct && (
        <div className="mx-4 mt-3 rounded-2xl bg-pine-50 dark:bg-pine-900/60 border border-pine-200 dark:border-pine-700 px-4 py-3 flex items-start gap-3 animate-fade-in">
          <div className="w-8 h-8 rounded-lg bg-pine-100 dark:bg-pine-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ScanBarcode size={16} className="text-pine-500 dark:text-pine-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-pine-800 dark:text-cream-200 truncate">{scannedProduct.name}</p>
            {scannedProduct.brand && (
              <p className="text-xs text-pine-500 dark:text-pine-400">{scannedProduct.brand}</p>
            )}
            <p className="text-xs text-pine-500 dark:text-pine-400 mt-0.5">
              Per 100g: {scannedProduct.per100g.calories} kcal · {scannedProduct.per100g.proteinG}g P · {scannedProduct.per100g.carbsG}g C · {scannedProduct.per100g.fatG}g F
            </p>
          </div>
          <button
            onClick={removeScannedProduct}
            className="text-pine-400 dark:text-pine-500 hover:text-pine-600 dark:hover:text-pine-300 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Food photo */}
      <section className="mx-4 mt-4">
        {foodImage ? (
          <div className="relative rounded-2xl overflow-hidden shadow-md">
            <img src={foodImage} alt="Food" className="w-full object-cover max-h-64 rounded-2xl" />
            <button
              onClick={clearFood}
              className="absolute top-2.5 right-2.5 bg-pine-950/60 backdrop-blur-sm rounded-full p-1.5 text-white"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {/* Photo upload */}
            <label htmlFor="food-input"
              className="flex-1 flex flex-col items-center justify-center gap-2.5 h-40 rounded-2xl border-2 border-dashed border-cream-300 dark:border-pine-700 bg-cream-50 dark:bg-pine-900 cursor-pointer active:border-pine-400 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-cream-200 dark:bg-pine-800 flex items-center justify-center">
                <Camera size={22} className="text-pine-400 dark:text-pine-300" />
              </div>
              <p className="text-xs font-medium text-pine-600 dark:text-cream-400 text-center">Take or upload a photo</p>
            </label>

            {/* Barcode scanner */}
            <button
              onClick={openBarcodeScanner}
              className="flex flex-col items-center justify-center gap-2.5 w-28 h-40 rounded-2xl border-2 border-dashed border-cream-300 dark:border-pine-700 bg-cream-50 dark:bg-pine-900 cursor-pointer active:border-pine-400 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-cream-200 dark:bg-pine-800 flex items-center justify-center">
                <ScanBarcode size={22} className="text-pine-400 dark:text-pine-300" />
              </div>
              <p className="text-xs font-medium text-pine-600 dark:text-cream-400 text-center">Scan barcode</p>
            </button>
          </div>
        )}
        <input id="food-input" ref={foodInputRef} type="file" accept="image/*" capture="environment" onChange={handleFoodImage} />
      </section>

      {/* Nutrition label — shown always (not only after food photo) */}
      <section className="mx-4 mt-3">
        {labelImage ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
            <img src={labelImage} alt="Label" className="w-12 h-12 object-cover rounded-lg" />
            <div className="flex-1">
              <p className="text-sm font-medium text-pine-800 dark:text-cream-200">Nutrition label added</p>
              <p className="text-xs text-cream-500 dark:text-pine-400">AI will use exact label values</p>
            </div>
            <button onClick={() => { setLabelImage(null); if (labelInputRef.current) labelInputRef.current.value = '' }}
              className="text-cream-400 dark:text-pine-500 hover:text-pine-500 dark:hover:text-pine-300">
              <X size={18} />
            </button>
          </div>
        ) : (
          <label htmlFor="label-input"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 cursor-pointer active:bg-cream-100 dark:active:bg-pine-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-cream-200 dark:bg-pine-800 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-cream-500 dark:text-pine-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-pine-700 dark:text-cream-300">Add nutrition label</p>
              <p className="text-xs text-cream-400 dark:text-pine-500">For packaged food — optional</p>
            </div>
          </label>
        )}
        <input id="label-input" ref={labelInputRef} type="file" accept="image/*" capture="environment" onChange={handleLabelImage} />
      </section>

      {/* Voice / text note */}
      <section className="mx-4 mt-3">
        <div className="rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 p-4">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={toggleRecording}
              disabled={!canRecord || isTranscribing}
              aria-label={isRecording ? 'Stop recording' : 'Start voice note'}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                isRecording
                  ? 'bg-red-500 animate-pulse'
                  : isTranscribing
                    ? 'bg-amber-500'
                    : 'bg-cream-200 dark:bg-pine-800 hover:bg-cream-300 dark:hover:bg-pine-700 active:scale-95'
              } disabled:opacity-40`}
            >
              {isTranscribing
                ? <Loader size={18} className="text-white animate-spin" />
                : isRecording
                  ? <MicOff size={18} className="text-white" />
                  : <Mic    size={18} className="text-pine-600 dark:text-pine-300" />
              }
            </button>
            <p className="text-sm text-cream-500 dark:text-pine-400">{recordingHint}</p>
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={foodImage
              ? 'e.g. "sauce was cream-based, large portion"'
              : 'e.g. "bowl of oatmeal with banana and almond milk"'}
            rows={3}
            className="w-full rounded-xl px-3 py-2.5 text-sm bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400 resize-none"
          />
        </div>
      </section>

      {/* Submit */}
      <div className="mx-4 mt-5">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-pine-500 hover:bg-pine-400 dark:bg-pine-400 dark:hover:bg-pine-300 dark:text-pine-950 text-white shadow-md"
        >
          <Sparkles size={18} />
          {isLoading ? 'Submitting…' : 'Log Meal'}
        </button>
      </div>
    </div>
  )
}
