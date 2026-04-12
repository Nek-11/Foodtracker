import { useState, useEffect, useRef } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, Trash2, RefreshCw, Pencil, Check, X, AlertTriangle, Loader } from 'lucide-react'
import { hapticLight, hapticSuccess, hapticError, hapticWarning } from '../utils/haptics.js'
import { friendlyError } from '../utils/errorMessages.js'
import { getMeals, deleteMeal, updateMeal, getPendingData, clearPendingData, getSettings } from '../services/storage.js'
import { analyzeMeal, reanalyzeMeal } from '../services/analyzer.js'
import { fmt, formatDate, formatTime, MACRO_LABELS, getMealCategory, CATEGORY_STYLES } from '../utils/nutritionUtils.js'

function getDateKeyLocal(isoTimestamp, resetHour) {
  const d = new Date(isoTimestamp)
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function groupByDate(meals, resetHour) {
  const groups = {}
  meals.forEach(meal => {
    const key = getDateKeyLocal(meal.timestamp, resetHour)
    if (!groups[key]) groups[key] = []
    groups[key].push(meal)
  })
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

export default function History({ refreshKey, onRefresh }) {
  const [meals,    setMeals]    = useState([])
  const [expanded, setExpanded] = useState(null)
  const resetHour = getSettings().resetHour ?? 2

  function refresh() {
    setMeals(getMeals())
  }

  useEffect(() => { refresh() }, [refreshKey])

  // Poll while any meal is analyzing
  useEffect(() => {
    const hasAnalyzing = meals.some(m => m.status === 'analyzing')
    if (!hasAnalyzing) return
    const interval = setInterval(refresh, 1500)
    return () => clearInterval(interval)
  }, [meals])

  async function handleRetry(meal) {
    const pending = getPendingData(meal.id)
    if (!pending) return

    hapticLight()
    updateMeal(meal.id, { status: 'analyzing', errorMessage: null })
    refresh()

    try {
      const analysis = await analyzeMeal({
        foodImage:  pending.foodImage  || null,
        labelImage: pending.labelImage || null,
        note:       pending.note       || '',
      })
      updateMeal(meal.id, { analysis, status: 'done' })
      clearPendingData(meal.id)
    } catch (err) {
      updateMeal(meal.id, { status: 'error', errorMessage: friendlyError(err) })
    }
    refresh()
    if (onRefresh) onRefresh()
  }

  function handleDelete(id) {
    deleteMeal(id)
    refresh()
    if (expanded === id) setExpanded(null)
    if (onRefresh) onRefresh()
  }

  async function handleReanalyze(meal, overrideNote = null) {
    const pending = getPendingData(meal.id)
    // Build clarification note from override, userNotes, or original note
    const contextNote = overrideNote ?? [meal.userNotes, meal.note].filter(Boolean).join('\n')

    hapticLight()
    updateMeal(meal.id, { status: 'analyzing', errorMessage: null })
    refresh()

    try {
      const analysis = await reanalyzeMeal({
        foodImage:        pending?.foodImage  || null,
        labelImage:       pending?.labelImage || null,
        note:             contextNote,
        previousAnalysis: meal.analysis,
      })
      hapticSuccess()
      updateMeal(meal.id, { analysis, status: 'done' })
    } catch (err) {
      hapticError()
      updateMeal(meal.id, { status: 'error', errorMessage: friendlyError(err) })
    }
    refresh()
    if (onRefresh) onRefresh()
  }

  function handleNoteUpdate(id, note) {
    updateMeal(id, { userNotes: note })
    refresh()
  }

  if (!meals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-cream-200 dark:bg-pine-900 flex items-center justify-center">
          <ClipboardList size={32} className="text-cream-400 dark:text-pine-600" />
        </div>
        <div>
          <p className="font-medium text-pine-800 dark:text-cream-300">No meals logged yet</p>
          <p className="text-sm mt-1 text-cream-500 dark:text-pine-500">Head to Log to add your first meal</p>
        </div>
      </div>
    )
  }

  const groups = groupByDate(meals, resetHour)

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">History</h1>
        <p className="text-sm mt-0.5 text-cream-500 dark:text-pine-400">{meals.length} meal{meals.length !== 1 ? 's' : ''} logged</p>
      </div>

      {groups.map(([date, dateMeals]) => (
        <section key={date} className="mx-4 mt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-sm font-semibold text-cream-600 dark:text-pine-400">{formatDate(date)}</h2>
            <span className="text-xs text-cream-400 dark:text-pine-500">
              {fmt(dateMeals.reduce((s, m) => s + (m.analysis?.totals?.calories || 0), 0))} kcal
            </span>
          </div>
          <div className="space-y-2">
            {dateMeals.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                isExpanded={expanded === meal.id}
                onToggle={() => setExpanded(expanded === meal.id ? null : meal.id)}
                onDelete={() => handleDelete(meal.id)}
                onRetry={() => handleRetry(meal)}
                onReanalyze={(note) => handleReanalyze(meal, note)}
                onNoteUpdate={note => handleNoteUpdate(meal.id, note)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function MealCard({ meal, isExpanded, onToggle, onDelete, onRetry, onReanalyze, onNoteUpdate }) {
  const { analysis, thumbnail, timestamp, note, status, errorMessage, userNotes, _isMock } = meal
  const totals   = analysis?.totals || {}
  const flagged  = analysis?.flagged
  const category = getMealCategory(timestamp, totals.calories || 0)
  const catStyle = CATEGORY_STYLES[category]

  const isAnalyzing    = status === 'analyzing'
  const isInterrupted  = status === 'interrupted'
  const isError        = status === 'error'
  const canRetry       = (isInterrupted || isError) && !!getPendingData(meal.id)

  return (
    <div className={`rounded-2xl overflow-hidden transition-all animate-fade-in ${
      flagged
        ? 'ring-1 ring-amber-400/30'
        : isError || isInterrupted
          ? 'ring-1 ring-red-400/30'
          : 'ring-1 ring-transparent'
    } bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800`}>

      {/* Summary row */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-cream-100 dark:active:bg-pine-800 transition-colors">

        {/* Thumbnail or icon */}
        {thumbnail ? (
          <img src={thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-cream-200 dark:bg-pine-800 flex items-center justify-center flex-shrink-0">
            {isAnalyzing
              ? <Loader size={20} className="text-pine-400 animate-spin" />
              : isError || isInterrupted
                ? <AlertTriangle size={20} className="text-red-400" />
                : <ClipboardList size={20} className="text-cream-400 dark:text-pine-500" />
            }
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Analyzing shimmer */}
          {isAnalyzing ? (
            <div className="space-y-1.5">
              <div className="h-3.5 w-3/4 rounded-full bg-pine-800 shimmer" />
              <div className="h-2.5 w-1/2 rounded-full bg-pine-800 shimmer" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-pine-900 dark:text-cream-100 truncate">
                  {analysis?.mealSummary || note || 'Unnamed meal'}
                </p>
                {flagged && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />}
                {_isMock  && <span className="text-[10px] text-amber-500 dark:text-amber-400 flex-shrink-0">demo</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catStyle.pill}`}>
                  {category}
                </span>
                <p className="text-xs text-cream-500 dark:text-pine-400">
                  {formatTime(timestamp)}
                  {analysis && (
                    <>
                      <span className="mx-1.5 text-cream-300 dark:text-pine-600">·</span>
                      {fmt(totals.proteinG)}g P · {fmt(totals.carbsG)}g C · {fmt(totals.fatG)}g F
                    </>
                  )}
                  {(isError || isInterrupted) && (
                    <span className="text-red-400 ml-1">· Failed</span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Calorie badge */}
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
          {isAnalyzing ? (
            <div className="h-5 w-10 rounded bg-pine-800 shimmer" />
          ) : analysis ? (
            <>
              <p className="text-base font-bold text-pine-900 dark:text-cream-100">{fmt(totals.calories)}</p>
              <p className="text-xs text-cream-400 dark:text-pine-500">kcal</p>
            </>
          ) : null}
          {isExpanded
            ? <ChevronUp   size={14} className="text-cream-400 dark:text-pine-500" />
            : <ChevronDown size={14} className="text-cream-400 dark:text-pine-500" />
          }
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-cream-200 dark:border-pine-800 px-4 py-4 space-y-4 animate-fade-in">

          {/* Error / interrupted state */}
          {(isError || isInterrupted) && (
            <div className="rounded-xl p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-600 dark:text-red-300">{errorMessage || 'Analysis failed.'}</p>
              {canRetry && (
                <button onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-pine-500 dark:text-pine-300 hover:text-pine-400">
                  <RefreshCw size={12} /> Retry analysis
                </button>
              )}
            </div>
          )}

          {/* Nutrition */}
          {analysis && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {MACRO_LABELS.map(({ key, label, unit, color }) => (
                  <div key={key} className="text-center rounded-xl py-2 bg-cream-100 dark:bg-pine-800">
                    <p className="text-xs text-cream-500 dark:text-pine-400">{label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color }}>
                      {fmt(totals[key])}<span className="text-xs text-cream-400 dark:text-pine-500 ml-0.5 font-normal">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>

              {analysis.items?.length > 0 && (
                <div className="space-y-1">
                  {analysis.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-pine-700 dark:text-cream-300 truncate max-w-[65%]">{item.name} (~{fmt(item.estimatedWeightG)}g)</span>
                      <span className="text-cream-500 dark:text-pine-400 flex-shrink-0">{fmt(item.calories)} kcal</span>
                    </div>
                  ))}
                </div>
              )}

              {flagged && analysis.questions?.length > 0 && (
                <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">Flagged uncertainties</p>
                  {analysis.questions.map((q, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{i + 1}. {q}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Original note */}
          {note && (
            <p className="text-xs text-cream-500 dark:text-pine-400 italic">"{note}"</p>
          )}

          {/* User notes (editable) */}
          <UserNoteEditor value={userNotes || ''} onSave={onNoteUpdate} />

          {/* Reanalyze */}
          {analysis && (
            <button onClick={onReanalyze}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-pine-600 dark:text-pine-300 font-medium bg-pine-50 dark:bg-pine-800/60 hover:bg-pine-100 dark:hover:bg-pine-800 border border-pine-200 dark:border-pine-700 transition-colors active:scale-[0.98]">
              <RefreshCw size={14} /> Reanalyze
            </button>
          )}

          {/* Delete */}
          <button onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-red-500 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 border border-red-100 dark:border-red-800/30 transition-colors active:scale-[0.98]">
            <Trash2 size={14} /> Delete Meal
          </button>
        </div>
      )}
    </div>
  )
}

function UserNoteEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  function handleSave() {
    onSave(draft.trim())
    setEditing(false)
  }

  function handleCancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="animate-fade-in">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note… e.g. extra sauce, bigger portion than usual"
          rows={2}
          autoFocus
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-cream-100 dark:bg-pine-800 border border-pine-300 dark:border-pine-600 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400 resize-none"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950 text-xs font-semibold active:scale-95">
            <Check size={12} /> Save
          </button>
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-200 dark:bg-pine-800 text-pine-700 dark:text-cream-300 text-xs font-medium active:scale-95">
            <X size={12} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className="flex items-start gap-2 text-xs text-cream-500 dark:text-pine-400 hover:text-pine-500 dark:hover:text-pine-300 transition-colors w-full text-left">
      <Pencil size={12} className="mt-0.5 flex-shrink-0" />
      {value ? <span className="italic">{value}</span> : <span>Add a note to this meal…</span>}
    </button>
  )
}
