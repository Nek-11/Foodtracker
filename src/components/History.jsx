import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardList, ChevronDown, ChevronUp, Trash2, RefreshCw,
  Pencil, Check, X, AlertTriangle, Loader, Search, SlidersHorizontal,
  Mic, MicOff, ChevronLeft,
} from 'lucide-react'
import { hapticLight, hapticSuccess, hapticError } from '../utils/haptics.js'
import { friendlyError } from '../utils/errorMessages.js'
import { getMeals, deleteMeal, saveMeal, updateMeal, getPendingData, clearPendingData, getSettings } from '../services/storage.js'
import { analyzeMeal, reanalyzeMeal } from '../services/analyzer.js'
import {
  fmt, formatDate, formatTime, MACRO_LABELS,
  getMealCategory, getMealTypes, CATEGORY_STYLES, ALL_MEAL_TYPES,
} from '../utils/nutritionUtils.js'
import {
  startListening, isSpeechSupported,
  startMediaRecording, transcribeWithWhisper, isMediaRecordingSupported,
} from '../services/speech.js'
import PullToRefresh from './PullToRefresh.jsx'
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

const INITIAL_DAYS_SHOWN = 2

export default function History({ refreshKey, onRefresh }) {
  const [meals,              setMeals]              = useState([])
  const [expanded,           setExpanded]           = useState(null)
  const [searchQuery,        setSearchQuery]        = useState('')
  const [undoMeal,           setUndoMeal]           = useState(null)
  const [filterTypes,        setFilterTypes]        = useState([])
  const [filterNutrition,    setFilterNutrition]    = useState({ proteinG: '', calories: '', fatG: '', sodiumMg: '' })
  const [showNutritionFilter,setShowNutritionFilter]= useState(false)
  const [visibleDaysCount,   setVisibleDaysCount]   = useState(INITIAL_DAYS_SHOWN)
  const [drag,               setDrag]               = useState(null) // { meal, x, y, hoveredDate }

  const undoTimerRef = useRef(null)
  const settings   = getSettings()
  const resetHour  = settings.resetHour ?? 2
  const timeSlots  = settings.mealTimeSlots

  function refresh() { setMeals(getMeals()) }
  useEffect(() => { refresh() }, [refreshKey])

  // Reset to latest 2 days whenever filters/search change
  useEffect(() => { setVisibleDaysCount(INITIAL_DAYS_SHOWN) }, [searchQuery, filterTypes, filterNutrition])

  // Poll while any meal is analyzing
  useEffect(() => {
    const hasAnalyzing = meals.some(m => m.status === 'analyzing')
    if (!hasAnalyzing) return
    const interval = setInterval(refresh, 1500)
    return () => clearInterval(interval)
  }, [meals])

  async function handleRetry(meal) {
    const pending = getPendingData(meal.id)
    // Pending data means we have the original image + note — do a fresh analyze.
    // Otherwise, if a previous analysis exists (e.g. reanalyze failed), retry that.
    const canFreshAnalyze = !!pending
    const canReanalyze    = !!meal.analysis
    if (!canFreshAnalyze && !canReanalyze) return

    hapticLight()
    updateMeal(meal.id, { status: 'analyzing', errorMessage: null })
    refresh()
    try {
      if (canFreshAnalyze) {
        const analysis = await analyzeMeal({
          foodImage:  pending.foodImage  || null,
          labelImage: pending.labelImage || null,
          note:       pending.note       || '',
        })
        updateMeal(meal.id, { analysis, status: 'done' })
        clearPendingData(meal.id)
      } else {
        const contextNote = [meal.userNotes, meal.note].filter(Boolean).join('\n')
        const analysis = await reanalyzeMeal({
          foodImage:        null,
          labelImage:       null,
          note:             contextNote,
          previousAnalysis: meal.analysis,
        })
        updateMeal(meal.id, { analysis: { ...analysis, flagged: false }, status: 'done' })
      }
      hapticSuccess()
    } catch (err) {
      hapticError()
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
    // Always include all available context: new override + saved notes + original log note
    const contextNote = [overrideNote, meal.userNotes, meal.note].filter(Boolean).join('\n')
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
      // Force flagged=false after explicit re-analysis — user has acknowledged the uncertainty
      updateMeal(meal.id, { analysis: { ...analysis, flagged: false }, status: 'done' })
    } catch (err) {
      hapticError()
      updateMeal(meal.id, { status: 'error', errorMessage: friendlyError(err) })
    }
    refresh()
    if (onRefresh) onRefresh()
  }

  function handleSaveEdit(meal, { customName, mealTypes, note, timestamp, shouldReanalyze }) {
    const updates = {
      customName:  customName || null,
      mealTypes:   mealTypes.length > 0 ? mealTypes : null,
      userNotes:   note || null,
    }
    if (timestamp && timestamp !== meal.timestamp) updates.timestamp = timestamp
    updateMeal(meal.id, updates)
    refresh()
    if (shouldReanalyze && note.trim()) {
      // Pass the updated meal object so reanalyze reads the new userNotes
      handleReanalyze({ ...meal, userNotes: note }, note.trim())
    }
    if (onRefresh) onRefresh()
  }

  function toggleTypeFilter(type) {
    setFilterTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  // ── Long-press drag to move a meal to another day ────────────────────────
  function handleDragStart(meal, x, y) {
    hapticLight()
    document.body.style.touchAction = 'none'
    setDrag({ meal, x, y, hoveredDate: null })
  }
  function handleDragMove(x, y) {
    setDrag(d => {
      if (!d) return d
      const els = document.elementsFromPoint(x, y) || []
      const headerEl = els.find(el => el?.dataset?.dateHeader)
      return { ...d, x, y, hoveredDate: headerEl?.dataset?.dateHeader || null }
    })
  }
  function handleDragEnd() {
    setDrag(d => {
      document.body.style.touchAction = ''
      if (!d) return null
      if (d.hoveredDate) {
        const currentDate = getDateKeyLocal(d.meal.timestamp, resetHour)
        if (d.hoveredDate !== currentDate) {
          // Preserve time-of-day, change just the date
          const oldTs = new Date(d.meal.timestamp)
          const [yr, mo, day] = d.hoveredDate.split('-').map(Number)
          const newTs = new Date(oldTs)
          newTs.setFullYear(yr, mo - 1, day)
          updateMeal(d.meal.id, { timestamp: newTs.toISOString() })
          hapticSuccess()
          refresh()
          if (onRefresh) onRefresh()
        }
      }
      return null
    })
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
      const types = getMealTypes(m, timeSlots)
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

  const allGroups = groupByDate(filteredMeals, resetHour)
  const isFiltering = !!(q || activeFilterCount > 0)
  // When filtering/searching show all days; otherwise paginate by day
  const visibleGroups = isFiltering ? allGroups : allGroups.slice(0, visibleDaysCount)
  const hasOlderDays  = !isFiltering && allGroups.length > visibleDaysCount

  return (
    <PullToRefresh onRefresh={refresh} className="flex flex-col h-full overflow-y-auto scroll-touch pb-8 relative">
      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">History</h1>
        <p className="text-sm mt-0.5 text-cream-500 dark:text-pine-400">
          {isFiltering
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

      {isFiltering && filteredMeals.length === 0 && (
        <p className="text-xs text-cream-400 dark:text-pine-500 mt-2 text-center px-4">No meals match the current filters</p>
      )}

      {visibleGroups.map(([date, dateMeals]) => {
        const isDropTarget = drag && drag.hoveredDate === date
        return (
          <section key={date} className="mx-4 mt-4">
            <div
              data-date-header={date}
              className={`flex items-center justify-between mb-2 px-2 py-1 rounded-lg transition-colors ${
                isDropTarget ? 'bg-pine-100 dark:bg-pine-700/40 ring-2 ring-pine-400' : ''
              }`}
            >
              <h2 className="text-sm font-semibold text-cream-600 dark:text-pine-400 pointer-events-none">{formatDate(date)}</h2>
              <span className="text-xs text-cream-400 dark:text-pine-500 pointer-events-none">
                {fmt(dateMeals.reduce((s, m) => s + (m.analysis?.totals?.calories || 0), 0))} kcal
              </span>
            </div>
            <div className="space-y-2">
              {dateMeals.map(meal => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  timeSlots={timeSlots}
                  isExpanded={expanded === meal.id}
                  isDragging={drag?.meal?.id === meal.id}
                  onToggle={() => setExpanded(expanded === meal.id ? null : meal.id)}
                  onDelete={() => handleDelete(meal.id)}
                  onRetry={() => handleRetry(meal)}
                  onReanalyze={(note) => handleReanalyze(meal, note)}
                  onSaveEdit={(updates) => handleSaveEdit(meal, updates)}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Load older days */}
      {hasOlderDays && (
        <div className="mx-4 mt-4 mb-2">
          <button
            onClick={() => setVisibleDaysCount(c => c + 1)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-pine-600 dark:text-pine-300 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 active:bg-cream-100 dark:active:bg-pine-800 transition-colors"
          >
            <ChevronLeft size={14} />
            Show {allGroups[visibleDaysCount] ? formatDate(allGroups[visibleDaysCount][0]) : 'older day'}
          </button>
        </div>
      )}

      {/* Drag ghost — follows finger while long-press dragging */}
      {drag && createPortal(
        <div
          className="fixed pointer-events-none z-[9000] px-3 py-2 rounded-xl shadow-xl bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950 text-xs font-semibold max-w-[220px] truncate"
          style={{ left: drag.x + 12, top: drag.y - 24 }}
        >
          {drag.meal.customName || drag.meal.analysis?.mealSummary || drag.meal.note || 'Meal'}
          <div className="text-[10px] font-normal opacity-80 mt-0.5">
            {drag.hoveredDate ? `Drop on ${formatDate(drag.hoveredDate)}` : 'Drag onto a day…'}
          </div>
        </div>,
        document.body
      )}

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
    </PullToRefresh>
  )
}

// ── MealCard ──────────────────────────────────────────────────────────────────

function MealCard({ meal, timeSlots, isExpanded, isDragging, onToggle, onDelete, onRetry, onReanalyze, onSaveEdit, onDragStart, onDragMove, onDragEnd }) {
  const { analysis, thumbnail, timestamp, note, status, errorMessage, userNotes, _isMock } = meal

  // Long-press drag detection. The button still toggles expansion on a quick
  // tap; press-and-hold (~500ms) enters drag mode so the user can drop the
  // card on another day's header to move the meal.
  const longPressRef    = useRef(null)
  const suppressClickRef = useRef(false)

  function startLongPressTimer(t) {
    longPressRef.current = {
      timerId: setTimeout(() => {
        if (longPressRef.current) {
          longPressRef.current.dragging = true
          onDragStart?.(meal, t.clientX, t.clientY)
        }
      }, 500),
      startX: t.clientX,
      startY: t.clientY,
      dragging: false,
    }
  }

  function handleCardTouchStart(e) {
    if (!onDragStart) return
    if (e.touches.length !== 1) return
    startLongPressTimer(e.touches[0])
  }

  function handleCardTouchMove(e) {
    const lp = longPressRef.current
    if (!lp) return
    const t = e.touches[0]
    if (lp.dragging) {
      onDragMove?.(t.clientX, t.clientY)
      return
    }
    const dx = Math.abs(t.clientX - lp.startX)
    const dy = Math.abs(t.clientY - lp.startY)
    if (dx > 10 || dy > 10) {
      clearTimeout(lp.timerId)
      longPressRef.current = null
    }
  }

  function handleCardTouchEnd() {
    const lp = longPressRef.current
    if (!lp) return
    clearTimeout(lp.timerId)
    if (lp.dragging) {
      suppressClickRef.current = true
      // Reset shortly — covers both the immediate click after touchend and
      // any stale state if the click never fires.
      setTimeout(() => { suppressClickRef.current = false }, 300)
      onDragEnd?.()
    }
    longPressRef.current = null
  }

  function handleSummaryClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onToggle()
  }

  const [isEditing,         setIsEditing]         = useState(false)
  const [editName,          setEditName]           = useState('')
  const [editTypes,         setEditTypes]          = useState([])
  const [editNote,          setEditNote]           = useState('')
  const [selectedAnswers,   setSelectedAnswers]    = useState({})
  const [isNoteRecording,   setIsNoteRecording]    = useState(false)
  const [isNoteTranscribing,setIsNoteTranscribing] = useState(false)
  const [showAiNotes,       setShowAiNotes]        = useState(false)
  const [editDateTime,      setEditDateTime]       = useState('')

  const noteWhisperStopRef    = useRef(null)
  const noteStopListeningRef  = useRef(null)

  const _settings  = getSettings()
  const _openaiKey = _settings.openaiApiKey
  const _useWhisper = !!(_openaiKey && _openaiKey.startsWith('sk-') && isMediaRecordingSupported())
  const _canRecord  = _useWhisper || isSpeechSupported()

  async function toggleNoteRecording() {
    hapticLight()
    if (isNoteRecording) {
      if (_useWhisper) {
        if (noteWhisperStopRef.current) {
          const stopFn = noteWhisperStopRef.current
          noteWhisperStopRef.current = null
          setIsNoteRecording(false)
          setIsNoteTranscribing(true)
          try {
            const blob = await stopFn()
            const text = await transcribeWithWhisper(blob, _openaiKey)
            if (text) setEditNote(prev => (prev ? prev + ' ' : '') + text)
          } catch { /* silent */ } finally {
            setIsNoteTranscribing(false)
          }
        }
      } else {
        noteStopListeningRef.current?.()
        noteStopListeningRef.current = null
        setIsNoteRecording(false)
      }
      return
    }
    setIsNoteRecording(true)
    if (_useWhisper) {
      try {
        const stopAndGetBlob = await startMediaRecording(() => setIsNoteRecording(false))
        noteWhisperStopRef.current = stopAndGetBlob
      } catch { setIsNoteRecording(false) }
    } else {
      let accumulated = editNote ? editNote + ' ' : ''
      const stop = startListening(
        (text, isFinal) => {
          if (isFinal) { accumulated += text + ' '; setEditNote(accumulated.trim()) }
          else { setEditNote((accumulated + text).trim()) }
        },
        () => { setIsNoteRecording(false); noteStopListeningRef.current = null }
      )
      noteStopListeningRef.current = stop
      setTimeout(() => {
        if (noteStopListeningRef.current) {
          noteStopListeningRef.current(); noteStopListeningRef.current = null; setIsNoteRecording(false)
        }
      }, 60000)
    }
  }

  const totals    = analysis?.totals || {}
  const flagged   = analysis?.flagged
  const mealTypes = getMealTypes(meal, timeSlots)

  const isAnalyzing   = status === 'analyzing'
  const isInterrupted = status === 'interrupted'
  const isError       = status === 'error'
  // Retry works if we have either the original log data (pending) OR a previous
  // analysis to re-run against. Previously this required pending, so network-
  // error failures (which never had pending cleared) showed no retry button
  // because LogScreen used to clear pending on error.
  const canRetry      = (isInterrupted || isError) && (!!getPendingData(meal.id) || !!analysis)

  function openEdit() {
    setEditName(meal.customName || analysis?.mealSummary || '')
    setEditTypes(meal.mealTypes || [])
    setEditNote(userNotes || '')
    setEditDateTime(toLocalDateTimeInputValue(timestamp))
    setIsEditing(true)
  }

  function resolveTimestamp() {
    if (!editDateTime) return timestamp
    const parsed = new Date(editDateTime)
    return isNaN(parsed.getTime()) ? timestamp : parsed.toISOString()
  }

  function closeEdit() {
    // Auto-save on close
    onSaveEdit({
      customName:      editName.trim(),
      mealTypes:       editTypes,
      note:            editNote.trim(),
      timestamp:       resolveTimestamp(),
      shouldReanalyze: false,
    })
    setIsEditing(false)
  }

  function saveAndReanalyze() {
    onSaveEdit({
      customName:      editName.trim(),
      mealTypes:       editTypes,
      note:            editNote.trim(),
      timestamp:       resolveTimestamp(),
      shouldReanalyze: true,
    })
    setIsEditing(false)
  }

  function toggleEditType(type) {
    const newTypes = editTypes.includes(type) ? editTypes.filter(t => t !== type) : [...editTypes, type]
    setEditTypes(newTypes)
    // Auto-save meal type change
    onSaveEdit({
      customName:      editName.trim(),
      mealTypes:       newTypes,
      note:            editNote.trim(),
      timestamp:       resolveTimestamp(),
      shouldReanalyze: false,
    })
  }

  function toggleAnswer(qIndex, opt) {
    setSelectedAnswers(prev => {
      const current = prev[qIndex]
      if (current === opt) {
        const next = { ...prev }
        delete next[qIndex]
        return next
      }
      return { ...prev, [qIndex]: opt }
    })
  }

  function handleReanalyzeWithAnswers() {
    const answers = Object.entries(selectedAnswers)
      .map(([qIdx, opt]) => {
        const rawQ = analysis.questions[qIdx]
        const q = normalizeQuestion(rawQ)
        return `${q.text} → ${opt}`
      })
      .join('\n')
    setSelectedAnswers({})
    onReanalyze(answers)
  }

  // Normalize questions for both old (string) and new (object) formats
  function normalizeQuestion(q) {
    if (typeof q === 'string') {
      return { text: q, options: parseQuestionOptions(q) }
    }
    return q
  }

  const displayName = meal.customName || analysis?.mealSummary || note || 'Unnamed meal'
  const hasSelectedAnswers = Object.keys(selectedAnswers).length > 0

  return (
    <div className={`rounded-2xl overflow-hidden transition-all animate-fade-in ${
      isDragging ? 'opacity-40 scale-[0.97]' : ''
    } ${
      flagged
        ? 'ring-1 ring-amber-400/30'
        : isError || isInterrupted
          ? 'ring-1 ring-red-400/30'
          : 'ring-1 ring-transparent'
    } bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800`}>

      {/* Summary row — long-press to drag-and-drop onto another day */}
      <button
        onClick={handleSummaryClick}
        onTouchStart={handleCardTouchStart}
        onTouchMove={handleCardTouchMove}
        onTouchEnd={handleCardTouchEnd}
        onTouchCancel={handleCardTouchEnd}
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
            <div className="space-y-1">
              <p className="text-sm font-medium text-pine-700 dark:text-cream-200 flex items-center gap-1.5">
                Processing
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-pine-400 animate-pulse" />
                  <span className="w-1 h-1 rounded-full bg-pine-400 animate-pulse [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-pine-400 animate-pulse [animation-delay:300ms]" />
                </span>
              </p>
              <p className="text-xs text-cream-500 dark:text-pine-400">AI is analyzing this meal…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-pine-900 dark:text-cream-100 truncate flex-1 min-w-0">
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
            <div className="rounded-xl p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-300">{errorMessage || 'Analysis failed.'}</p>
              </div>
              {canRetry && (
                <button onClick={onRetry}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950 text-sm font-semibold active:scale-[0.98] transition-all shadow-sm">
                  <RefreshCw size={14} /> Retry analysis
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
                    <div key={i} className="flex justify-between gap-2 items-start text-xs">
                      <span className="text-pine-700 dark:text-cream-300 break-words min-w-0">{item.name} (~{fmt(item.estimatedWeightG)}g)</span>
                      <span className="text-cream-500 dark:text-pine-400 flex-shrink-0">{fmt(item.calories)} kcal</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Clarifying questions — select answers, then hit Reanalyze */}
              {flagged && analysis.questions?.length > 0 && (
                <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-3">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Select your answers, then tap Reanalyze
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
                              onClick={() => toggleAnswer(i, opt)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border active:scale-95 transition-all ${
                                selectedAnswers[i] === opt
                                  ? 'bg-amber-500 dark:bg-amber-600 text-white border-amber-600 dark:border-amber-500 ring-1 ring-amber-400/40'
                                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                              }`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {hasSelectedAnswers && (
                    <button
                      onClick={handleReanalyzeWithAnswers}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950 mt-1">
                      <RefreshCw size={12} /> Reanalyze
                    </button>
                  )}
                </div>
              )}

              {/* AI notes (informational tips) — collapsed by default */}
              {analysis.notes?.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAiNotes(v => !v)}
                    className="flex items-center gap-1 text-[11px] font-medium text-cream-500 dark:text-pine-400 hover:text-pine-500 dark:hover:text-pine-300">
                    {showAiNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    {showAiNotes ? 'Hide AI tips' : `Show AI tips (${analysis.notes.length})`}
                  </button>
                  {showAiNotes && (
                    <div className="mt-2 space-y-1 animate-fade-in">
                      {analysis.notes.map((n, i) => (
                        <p key={i} className="text-xs text-cream-500 dark:text-pine-400 italic">
                          {n}
                        </p>
                      ))}
                    </div>
                  )}
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

              {/* Meal date / time */}
              <div>
                <label className="text-xs font-medium text-cream-600 dark:text-pine-400 mb-1 block">Date & time</label>
                <input
                  type="datetime-local"
                  value={editDateTime}
                  onChange={e => setEditDateTime(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 outline-none focus:ring-2 focus:ring-pine-400"
                />
                <p className="text-[10px] text-cream-400 dark:text-pine-500 mt-1">
                  Move this meal to a different day or time — useful for back-logging.
                </p>
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

              {/* Note (used for display + reanalysis context) */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-cream-600 dark:text-pine-400 flex-1">
                    Notes / context for analysis
                  </label>
                  {_canRecord && (
                    <button
                      onClick={toggleNoteRecording}
                      disabled={isNoteTranscribing}
                      aria-label={isNoteRecording ? 'Stop recording' : 'Dictate note'}
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isNoteRecording
                          ? 'bg-red-500 animate-pulse'
                          : isNoteTranscribing
                            ? 'bg-amber-500'
                            : 'bg-cream-200 dark:bg-pine-700 hover:bg-cream-300 dark:hover:bg-pine-600 active:scale-95'
                      } disabled:opacity-40`}
                    >
                      {isNoteTranscribing
                        ? <Loader  size={12} className="text-white animate-spin" />
                        : isNoteRecording
                          ? <MicOff size={12} className="text-white" />
                          : <Mic    size={12} className="text-pine-600 dark:text-pine-300" />
                      }
                    </button>
                  )}
                </div>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="e.g. it was fried, used 2 tbsp oil, sauce was cream-based"
                  rows={3}
                  autoFocus
                  className="w-full rounded-xl px-3 py-2 text-sm bg-cream-100 dark:bg-pine-800 border border-cream-200 dark:border-pine-700 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400 resize-none"
                />
                <p className="text-[10px] text-cream-400 dark:text-pine-500 mt-1">
                  Saved on the card and used as context whenever you reanalyze this meal.
                </p>
              </div>

              {/* Edit actions */}
              <div className="flex gap-2">
                <button
                  onClick={closeEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-200 dark:bg-pine-800 text-pine-700 dark:text-cream-300 text-xs font-medium active:scale-95 transition-all">
                  <Check size={12} /> Done
                </button>
                {editNote.trim() && (
                  <button
                    onClick={saveAndReanalyze}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950">
                    <RefreshCw size={12} /> Reanalyze
                  </button>
                )}
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
 * Format an ISO timestamp into the value a <input type="datetime-local"> expects
 * (YYYY-MM-DDTHH:mm, in local time).
 */
function toLocalDateTimeInputValue(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
