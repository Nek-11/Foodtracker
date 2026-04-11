import { useState } from 'react'
import { fmt, MACRO_LABELS } from '../utils/nutritionUtils.js'
import { startListening, isSpeechSupported } from '../services/speech.js'
import { useRef } from 'react'

export default function AnalysisResult({ analysis, thumbnail, onSave, onDiscard, onReanalyze, error }) {
  const [clarNote, setClarNote] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const stopRef = useRef(null)

  const { items = [], totals = {}, confidence, flagged, questions = [], mealSummary } = analysis

  function toggleRecording() {
    if (isRecording) {
      if (stopRef.current) stopRef.current()
      stopRef.current = null
      setIsRecording(false)
      return
    }
    setIsRecording(true)
    let accumulated = clarNote ? clarNote + ' ' : ''
    const stop = startListening(
      (text, isFinal) => {
        if (isFinal) {
          accumulated += text + ' '
          setClarNote(accumulated.trim())
        } else {
          setClarNote((accumulated + text).trim())
        }
      },
      () => setIsRecording(false)
    )
    stopRef.current = stop
  }

  function handleReanalyze() {
    if (!clarNote.trim()) return
    onReanalyze(clarNote.trim())
    setClarNote('')
  }

  const confidenceConfig = {
    high:   { color: 'text-emerald-400', label: 'High confidence' },
    medium: { color: 'text-amber-400',   label: 'Medium confidence' },
    low:    { color: 'text-red-400',     label: 'Low confidence' },
  }
  const conf = confidenceConfig[confidence] || confidenceConfig.medium

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2 flex items-start gap-3">
        {thumbnail && (
          <img src={thumbnail} alt="Meal" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">{mealSummary || 'Meal Analysis'}</h1>
          <span className={`text-xs font-medium ${conf.color}`}>{conf.label}</span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Total calories — hero number */}
      <div className="mx-4 mt-2 bg-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider">Total Calories</p>
          <p className="text-4xl font-bold text-white mt-1">{fmt(totals.calories)}</p>
          <p className="text-slate-400 text-xs mt-1">kcal</p>
        </div>
        <CalorieDonut items={items} />
      </div>

      {/* Macros grid */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        {MACRO_LABELS.map(({ key, label, unit, color }) => (
          <div key={key} className="bg-slate-800 rounded-xl px-3 py-3 text-center">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-lg font-bold mt-0.5" style={{ color }}>
              {fmt(totals[key])}
            </p>
            <p className="text-xs text-slate-500">{unit}</p>
          </div>
        ))}
      </div>

      {/* Food items breakdown */}
      <section className="mx-4 mt-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Breakdown
        </h2>
        <div className="bg-slate-800 rounded-2xl divide-y divide-slate-700">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  ~{fmt(item.estimatedWeightG)}g
                  <span className="mx-1.5 text-slate-600">·</span>
                  {fmt(item.proteinG)}g protein
                  <span className="mx-1.5 text-slate-600">·</span>
                  {fmt(item.carbsG)}g carbs
                  <span className="mx-1.5 text-slate-600">·</span>
                  {fmt(item.fatG)}g fat
                </p>
              </div>
              <p className="text-sm font-semibold text-white flex-shrink-0">
                {fmt(item.calories)} kcal
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Flagged / uncertainty section */}
      {flagged && questions.length > 0 && (
        <section className="mx-4 mt-4 bg-amber-900/30 border border-amber-700/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-amber-300">Claude has some questions</p>
          </div>
          <ul className="space-y-1 mb-4">
            {questions.map((q, i) => (
              <li key={i} className="text-sm text-amber-200 flex gap-2">
                <span className="text-amber-500 flex-shrink-0">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>

          {/* Clarification input */}
          <div className="flex items-start gap-2 mb-2">
            <button
              onClick={toggleRecording}
              disabled={!isSpeechSupported()}
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all mt-0.5 ${
                isRecording ? 'bg-red-500 animate-pulse' : 'bg-amber-700 hover:bg-amber-600 active:scale-95'
              } disabled:opacity-40`}
              aria-label={isRecording ? 'Stop' : 'Voice answer'}
            >
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm-1 1.93V19H9a1 1 0 000 2h6a1 1 0 000-2h-2v-2.07A5.003 5.003 0 0017 12v-1a1 1 0 00-2 0v1a3 3 0 01-6 0v-1a1 1 0 00-2 0v1a5.003 5.003 0 004 4.93z"/>
              </svg>
            </button>
            <textarea
              value={clarNote}
              onChange={e => setClarNote(e.target.value)}
              placeholder="Speak or type your answers…"
              rows={2}
              className="flex-1 bg-amber-950/40 border border-amber-700/40 rounded-xl px-3 py-2 text-sm text-amber-100 placeholder-amber-700 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
          <button
            onClick={handleReanalyze}
            disabled={!clarNote.trim()}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
          >
            Re-analyze with this info
          </button>
        </section>
      )}

      {/* Save / Discard */}
      <div className="mx-4 mt-5 flex gap-3">
        <button
          onClick={onDiscard}
          className="flex-1 py-4 bg-slate-700 hover:bg-slate-600 active:scale-95 rounded-2xl font-semibold text-sm text-slate-300 transition-all"
        >
          Discard
        </button>
        <button
          onClick={onSave}
          className="flex-[2] py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 rounded-2xl font-semibold text-base text-white transition-all"
        >
          Save Meal
        </button>
      </div>
    </div>
  )
}

// Mini donut showing calorie breakdown by item
function CalorieDonut({ items }) {
  if (!items?.length) return null
  const total = items.reduce((s, i) => s + (i.calories || 0), 0)
  if (!total) return null

  const colors = ['#10b981', '#60a5fa', '#f59e0b', '#f87171', '#a78bfa', '#fb923c']
  let offset = 0
  const r = 28
  const circ = 2 * Math.PI * r

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="flex-shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
      {items.map((item, i) => {
        const pct = (item.calories || 0) / total
        const dash = pct * circ
        const el = (
          <circle
            key={i}
            cx="36" cy="36" r={r}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 36 36)"
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}
