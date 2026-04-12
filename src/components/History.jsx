import { useState, useEffect, useRef } from 'react'
import {
  ClipboardList, ChevronDown, ChevronUp, Trash2, RefreshCw,
  Pencil, Check, X, AlertTriangle, Loader, Search, SlidersHorizontal,
} from 'lucide-react'
import { hapticLight, hapticSuccess, hapticError } from '../utils/haptics.js'
import { friendlyError } from '../utils/errorMessages.js'
import { getMeals, deleteMeal, saveMeal, updateMeal, getPendingData, clearPendingData, getSettings } from '../services/storage.js'
import { analyzeMeal, reanalyzeMeal } from '../services/analyzer.js'
import {
  fmt, formatDate, formatTime, MACRO_LABELS,
  getMealCategory, getMealTypes, CATEGORY_STYLES, ALL_MEAL_TYPES,
} from '../utils/nutritionUtils.js'

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

const NUTRITION_FILTERS = [
  { key: 'proteinG',  label: 'Protein ≥',  unit: 'g'  },
  { key: 'calories',  label: 'Calories ≥', unit: 'kcal' },
  { key: 'fatG',      label: 'Fat ≥',      unit: 'g'  },
  { key: 'sodiumMg',  label: 'Sodium ≥',   unit: 'mg' },
]

export default function History({ refreshKey, onRefresh }) {
  const [meals,              setMeals]              = useState([])
  const [expanded,           setExpanded]           = useState(null)
  const [searchQuery,        setSearchQuery]        = useState('')
  const [undoMeal,           setUndoMeal]           = useState(null)
  const [filterTypes,        setFilterTypes]        = useState([])
  const [filterNutrition,    setFilterNutrition]    = useState({ proteinG: '', calories: '', fatG: '', sodiumMg: '' })
  const [showNutritionFilter,setShowNutritionFilter]= useState(false)

  const undoTimerRef = useRef(null)
  const resetHour = getSettings().resetHour ?? 2

  function refresh() { setMeals(getMeals()) }
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
    const meal = meals.find(m => m.id === id)
    if (!meal) return
    hapticLight()
    deleteMeal(id)
    refresh()
    if (expanded === id) setExpanded(null)
    if (onRefresh) onRefresh()
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoMeal(meal)
    undoTimerRef.current = setTimeout(() => setUndoMeal(null), 4000)
  }

  function handleUndoDelete() {
    if (!undoMeal) return
    clearTimeout(undoTimerRef.current)
    saveMeal(undoMeal)
    setUndoMeal(null)
    refresh()
    if (onRefresh) onRefresh()
  }

  async function handleReanalyze(meal, overrideNote = null) {
    const pending = getPendingData(meal.id)
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

  function handleSaveEdit(meal, { customName, mealTypes, userNotes, reanalyzeNote }) {
    updateMeal(meal.id, {
      customName:  customName  || null,
      mealTypes:   mealTypes.length > 0 ? mealTypes : null,
      userNotes:   userNotes   || null,
    })
    refresh()
    if (reanalyzeNote.trim()) {
      handleReanalyze(meal, reanalyzeNote.trim())
    }
    if (onRefresh) onRefresh()
  }

  function toggleTypeFilter(type) {
    setFilterTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase()

  const filteredMeals = meals.filter(m => {
    // Text search
    if (q) {
      const name = (m.customName || m.analysis?.mealSummary || m.note || '').toLowerCase()
      const inNote  = m.note?.toLowerCase().includes(q)
      const inUser  = m.userNotes?.toLowerCase().includes(q)
      const inItems = m.analysis?.items?.some(item => item.name?.toLowerCase().includes(q))
      if (!name.includes(q) && !inNote && !inUser && !inItems) return false
    }
    // Type filter
    if (filterTypes.length > 0) {
      const types = getMealTypes(m)
      if (!filterTypes.some(t => types.includes(t))) return false
    }
    // Nutrition thresholds (only for analyzed meals)
    if (m.analysis) {
      const t = m.analysis.totals
      for (const { key } of NUTRITION_FILTERS) {
        const threshold = filterNutrition[key]
        if (threshold !== '' && threshold != null && (t[key] || 0) < Number(threshold)) return false
      }
    } else if (Object.values(filterNutrition).some(v => v !== '')) {
      // Meal not analyzed yet — exclude from nutrition filters
      return false
    }
    return true
  })

  const activeFilterCount =
    filterTypes.length +
    Object.values(filterNutrition).filter(v => v !== '').length

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

  const groups = groupByDate(filteredMeals, resetHour)

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8 relative">
      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">History</h1>
        <p className="text-sm mt-0.5 text-cream-500 dark:text-pine-400">
          {q || activeFilterCount > 0
            ? `${filteredMeals.length} of ${meals.length}`
            : meals.length}{' '}
          meal{meals.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400 dark:text-pine-500 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search meals…"
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400"
          />
        </div>
      </div>

      {/* Meal type filter chips */}
      <div className="px-4 pb-2 flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5 no-scrollbar">
          {ALL_MEAL_TYPES.map(type => {
            const active = filterTypes.includes(type)
            const style = CATEGORY_STYLES[type]
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  active
                    ? style.pill + ' border-current/30 ring-1 ring-current/20'
                    : 'bg-cream-100 dark:bg-pine-800 text-cream-500 dark:text-pine-400 border-cream-200 dark:border-pine-700'
                }`}
              >
                {type}
              </button>
            )
          })}
        </div>

        {/* Nutrition filter toggle */}
        <button
          onClick={() => setShowNutritionFilter(v => !v)}
          className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
            showNutritionFilter || Object.values(filterNutrition).some(v => v !== '')
              ? 'bg-pine-100 dark:bg-pine-700/50 text-pine-600 dark:text-pine-300 border-pine-300 dark:border-pine-600'
              : 'bg-cream-100 dark:bg-pine-800 text-cream-500 dark:text-pine-400 border-cream-200 dark:border-pine-700'
          }`}
        >
          <SlidersHorizontal size={10} />
          {Object.values(filterNutrition).filter(v => v !== '').length > 0
            ? Object.values(filterNutrition).filter(v => v !== '').length
            : 'More'}
        </button>
      </div>

      {/* Nutrition threshold filters (expandable) */}
      {showNutritionFilter && (
        <div className="mx-4 mb-2 rounded-xl p-3 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 animate-fade-in">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-2">
            Minimum values
          </p>
          <div className="grid grid-cols-2 gap-2">
            {NUTRITION_FILTERS.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="text-[10px] text-cream-500 dark:text-pine-400 mb-0.5 block">{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={filterNutrition[key]}
                    onChange={e => setFilterNutrition(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="—"
                    className="w-full rounded-lg px-2 py-1 text-xs bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 outline-none focus:ring-1 focus:ring-pine-400"
                  />
                  <span className="text-[10px] text-cream-400 dark:text-pine-500 flex-shrink-0">{unit}</span>
                </div>
              </div>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterTypes([]); setFilterNutrition({ proteinG: '', calories: '', fatG: '', sodiumMg: '' }) }}
              className="mt-2 text-xs text-red-400 hover:text-red-500 dark:text-red-400 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {(q || activeFilterCount > 0) && filteredMeals.length === 0 && (
        <p className="text-xs text-cream-400 dark:text-pine-500 mt-2 text-center px-4">No meals match the current filters</p>
      )}

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
                onSaveEdit={(updates) => handleSaveEdit(meal, updates)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Undo delete toast */}
      {undoMeal && (
        <div className="sticky bottom-4 left-0 right-0 flex justify-center px-4 animate-fade-in pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-pine-800 dark:bg-pine-700 text-cream-100 text-sm shadow-xl">
            <span className="opacity-80">Meal deleted</span>
            <button
              onClick={handleUndoDelete}
              className="font-semibold text-pine-300 dark:text-pine-200 hover:text-white transition-colors">
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MealCard ──────────────────────────────────────────────────────────────────

function MealCard({ meal, isExpanded, onToggle, onDelete, onRetry, onReanalyze, onSaveEdit }) {
  const { analysis, thumbnail, timestamp, note, status, errorMessage, userNotes, _isMock } = meal

  const [isEditing,    setIsEditing]    = useState(false)
  const [editName,     setEditName]     = useState('')
  const [editTypes,    setEditTypes]    = useState([])
  const [editUserNote, setEditUserNote] = useState('')
  const [editReNote,   setEditReNote]   = useState('')

  const totals     = analysis?.totals || {}
  const flagged    = analysis?.flagged
  const mealTypes  = getMealTypes(meal)

  const isAnalyzing   = status === 'analyzing'
  const isInterrupted = status === 'interrupted'
  const isError       = status === 'error'
  const canRetry      = (isInterrupted || isError) && !!getPendingData(meal.id)

  function openEdit() {
    setEditName(meal.customName || analysis?.mealSummary || '')
    setEditTypes(meal.mealTypes || [])
    setEditUserNote(userNotes || '')
    setEditReNote('')
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
  }

  function saveEdit() {
    onSaveEdit({
      customName:    editName.trim(),
      mealTypes:     editTypes,
      userNotes:     editUserNote.trim(),
      reanalyzeNote: editReNote.trim(),
    })
    setIsEditing(false)
  }

  function toggleEditType(type) {
    setEditTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  // Normalize questions for both old (string) and new (object) formats
  function normalizeQuestion(q) {
    if (typeof q === 'string') {
      return { text: q, options: parseQuestionOptions(q) }
    }
    return q
  }

  const displayName = meal.customName || analysis?.mealSummary || note || 'Unnamed meal'

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
          {isAnalyzing ? (
            <div className="space-y-1.5">
              <div className="h-3.5 w-3/4 rounded-full bg-pine-800 shimmer" />
              <div className="h-2.5 w-1/2 rounded-full bg-pine-800 shimmer" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-pine-900 dark:text-cream-100 truncate">
                  {displayName}
                </p>
                {flagged && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />}
                {_isMock  && <span className="text-[10px] text-amber-500 dark:text-amber-400 flex-shrink-0">demo</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {mealTypes.map(type => (
                  <span key={type} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${(CATEGORY_STYLES[type] || CATEGORY_STYLES.Snack).pill}`}>
                    {type}
                  </span>
                ))}
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

        {/* Calorie badge + chevron */}
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
          {analysis && !isEditing && (
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

              {/* Clarifying questions */}
              {flagged && analysis.questions?.length > 0 && (
                <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-3">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Tap an answer to reanalyze with that context
                  </p>
                  {analysis.questions.map((rawQ, i) => {
                    const q = normalizeQuestion(rawQ)
                    return (
                      <div key={i} className="space-y-1.5">
                        <p className="text-xs text-amber-700 dark:text-amber-300">{q.text}</p>
                        <div className="flex gap-2 flex-wrap">
                          {q.options.map(opt => (
                            <button
                              key={opt}
                              onClick={() => onReanalyze(`${q.text} → ${opt}`)}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 active:scale-95 transition-all hover:bg-amber-200 dark:hover:bg-amber-900/60">
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* AI notes (informational tips) */}
              {analysis.notes?.length > 0 && (
                <div className="space-y-1">
                  {analysis.notes.map((n, i) => (
                    <p key={i} className="text-xs text-cream-500 dark:text-pine-400 italic">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Original note */}
          {note && !isEditing && (
            <p className="text-xs text-cream-500 dark:text-pine-400 italic">"{note}"</p>
          )}

          {/* Saved personal note */}
          {userNotes && !isEditing && (
            <p className="text-xs text-pine-600 dark:text-pine-300 italic border-l-2 border-pine-300 dark:border-pine-600 pl-2">{userNotes}</p>
          )}

          {/* ── Edit mode ─────────────────────────────────────── */}
          {isEditing ? (
            <div className="space-y-3 animate-fade-in">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-cream-600 dark:text-pine-400 mb-1 block">Meal name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Chicken salad"
                  className="w-full rounded-xl px-3 py-2 text-sm bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400"
                />
              </div>

              {/* Meal types */}
              <div>
                <label className="text-xs font-medium text-cream-600 dark:text-pine-400 mb-1.5 block">Meal type</label>
                <div className="flex gap-1.5 flex-wrap">
                  {ALL_MEAL_TYPES.map(type => {
                    const active = editTypes.includes(type)
                    const style = CATEGORY_STYLES[type]
                    return (
                      <button
                        key={type}
                        onClick={() => toggleEditType(type)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                          active
                            ? style.pill + ' border-current/30 ring-1 ring-current/20'
                            : 'bg-cream-100 dark:bg-pine-800 text-cream-500 dark:text-pine-400 border-cream-200 dark:border-pine-700'
                        }`}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Personal note */}
              <div>
                <label className="text-xs font-medium text-cream-600 dark:text-pine-400 mb-1 block">Personal note</label>
                <textarea
                  value={editUserNote}
                  onChange={e => setEditUserNote(e.target.value)}
                  placeholder="e.g. bigger portion than usual, extra sauce"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400 resize-none"
                />
              </div>

              {/* Reanalysis note */}
              <div>
                <label className="text-xs font-medium text-cream-600 dark:text-pine-400 mb-1 block">
                  Add context to reanalyze <span className="font-normal text-cream-400 dark:text-pine-500">(optional)</span>
                </label>
                <textarea
                  value={editReNote}
                  onChange={e => setEditReNote(e.target.value)}
                  placeholder="e.g. it was fried, used 2 tbsp oil, sauce was cream-based"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-cream-100 dark:bg-pine-800 border border-pine-300 dark:border-pine-600 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400 resize-none"
                />
              </div>

              {/* Edit actions */}
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-200 dark:bg-pine-800 text-pine-700 dark:text-cream-300 text-xs font-medium active:scale-95 transition-all">
                  <X size={12} /> Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950">
                  <Check size={12} />
                  {editReNote.trim() ? 'Save & Reanalyze' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode action buttons ─────────────────────── */
            <div className="flex gap-2">
              <button
                onClick={openEdit}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-pine-600 dark:text-pine-300 font-medium bg-pine-50 dark:bg-pine-800/60 hover:bg-pine-100 dark:hover:bg-pine-800 border border-pine-200 dark:border-pine-700 transition-colors active:scale-[0.98]">
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={onDelete}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-red-500 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 border border-red-100 dark:border-red-800/30 transition-colors active:scale-[0.98]">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Extract tap-options from old-format string questions like "Was it fried or baked?"
 * Fallback for meals analyzed before the structured question format.
 */
function parseQuestionOptions(question) {
  const match = question.match(/\b([\w\s]{2,20})\s+or\s+([\w\s]{2,20}?)[\?.,]?\s*$/i)
  if (match) {
    const a = match[1].trim().replace(/^(was it|is it|were they|is this)\s+/i, '')
    const b = match[2].trim()
    if (a && b && a.split(' ').length <= 3 && b.split(' ').length <= 3) {
      return [a[0].toUpperCase() + a.slice(1), b[0].toUpperCase() + b.slice(1)]
    }
  }
  return ['Yes', 'No']
}
