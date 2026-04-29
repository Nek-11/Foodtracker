import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, BarChart, Bar, Cell
} from 'recharts'
import { getDailyTotals, getLast7DaysTotals, getGoals, getMeals, getMealsByDate, getSettings, getTodayKey, setDayExcluded, getDateKey } from '../services/storage.js'
import { fmt, pct, progressBgColor, formatDate, MACRO_LABELS, getMealTypes, CATEGORY_STYLES } from '../utils/nutritionUtils.js'
import { EyeOff, Eye } from 'lucide-react'
import PullToRefresh from './PullToRefresh.jsx'

export default function Dashboard({ refreshKey, onRefresh }) {
  const initialTodayKey = getTodayKey(getSettings().resetHour ?? 2)
  const [selectedDate,    setSelectedDate]    = useState(initialTodayKey)
  const [totals,          setTotals]          = useState({})
  const [goals,           setGoals]           = useState({})
  const [weekData,        setWeekData]        = useState([])
  const [mealsByCategory, setMealsByCategory] = useState([])
  const [weekInsights,    setWeekInsights]    = useState([])
  const [weekStats,       setWeekStats]       = useState(null)
  const [isDayExcluded,   setIsDayExcluded]   = useState(false)
  const [showCalendar,    setShowCalendar]    = useState(false)
  const [swipeDx,         setSwipeDx]         = useState(0)
  const dateInputRef = useRef(null)
  const swipeStart   = useRef(null)

  useEffect(() => {
    const settings = getSettings()
    const timeSlots = settings.mealTimeSlots
    setIsDayExcluded((settings.excludedDays || []).includes(selectedDate))

    setTotals(getDailyTotals(selectedDate))
    const g = getGoals()
    setGoals(g)

    // Meal breakdown by category for the selected day
    const dayMeals = getMealsByDate(selectedDate).filter(m => m.analysis)
    const catMap = {}
    dayMeals.forEach(m => {
      const types = getMealTypes(m, timeSlots)
      types.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { cal: 0, count: 0 }
        catMap[cat].cal   += (m.analysis.totals.calories || 0) / types.length
        catMap[cat].count += 1 / types.length
      })
    })
    const order = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Drink']
    setMealsByCategory(
      order.filter(c => catMap[c]).map(c => ({
        cat: c,
        cal: Math.round(catMap[c].cal),
        count: Math.round(catMap[c].count) || 1,
      }))
    )

    // 7-day chart — always relative to today
    // Excluded days: bar chart shows them grayed at 0, line chart skips (null).
    const raw7 = getLast7DaysTotals()
    const week = raw7.map(({ date, totals: t, excluded }) => ({
      day: formatDate(date) === 'Today'
        ? 'Today'
        : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      calories: excluded ? 0 : fmt(t.calories),
      protein:  excluded ? null : fmt(t.proteinG),
      excluded,
    }))
    setWeekData(week)

    const active = raw7.filter(d => !d.excluded && d.totals.calories > 300)
    if (active.length >= 2) {
      const avg = key => active.reduce((s, d) => s + d.totals[key], 0) / active.length
      const avgCal     = avg('calories')
      const avgProtein = avg('proteinG')
      const avgSugar   = avg('sugarG')
      const avgSodium  = avg('sodiumMg')

      const daysOverCal    = active.filter(d => d.totals.calories  > g.calories  * 1.15).length
      const daysLowCal     = active.filter(d => d.totals.calories  < g.calories  * 0.65).length
      const daysLowProtein = active.filter(d => d.totals.proteinG  < g.proteinG  * 0.8).length
      const daysHitProtein = active.filter(d => d.totals.proteinG  >= g.proteinG * 0.95).length
      const daysHighSugar  = active.filter(d => d.totals.sugarG    > g.sugarG    * 1.2).length
      const daysHighSodium = active.filter(d => d.totals.sodiumMg  > g.sodiumMg  * 1.2).length
      const half = Math.ceil(active.length / 2)

      setWeekStats({ avgCal: Math.round(avgCal), avgProtein: Math.round(avgProtein), activeDays: active.length })

      const ins = []
      if (daysOverCal    >= half) ins.push({ type: 'warn',  text: `Over calorie goal ${daysOverCal}/${active.length} days` })
      if (daysLowCal     >= half) ins.push({ type: 'warn',  text: `Low calorie intake ${daysLowCal}/${active.length} days — make sure you're eating enough` })
      if (daysLowProtein >= half) ins.push({ type: 'warn',  text: `Protein below goal ${daysLowProtein}/${active.length} days (avg ${Math.round(avgProtein)}g)` })
      if (daysHighSugar  >= half) ins.push({ type: 'warn',  text: `High sugar ${daysHighSugar}/${active.length} days (avg ${Math.round(avgSugar)}g vs ${g.sugarG}g goal)` })
      if (daysHighSodium >= half) ins.push({ type: 'warn',  text: `High sodium ${daysHighSodium}/${active.length} days (avg ${Math.round(avgSodium)}mg vs ${g.sodiumMg}mg goal)` })
      if (daysHitProtein >= Math.ceil(active.length * 0.7))
        ins.push({ type: 'good',  text: `Protein goal hit ${daysHitProtein}/${active.length} days — great consistency` })
      if (avgCal >= g.calories * 0.85 && avgCal <= g.calories * 1.1 && daysOverCal < half)
        ins.push({ type: 'good',  text: `Calorie intake on track this week (avg ${Math.round(avgCal)} kcal)` })
      setWeekInsights(ins)
    } else {
      setWeekStats(null)
      setWeekInsights([])
    }
  }, [refreshKey, selectedDate])

  const calPct = pct(totals.calories, goals.calories)
  const today  = getTodayKey(getSettings().resetHour ?? 2)

  function goDay(delta) {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    const next = d.toISOString().slice(0, 10)
    if (next <= today) setSelectedDate(next)
  }

  function toggleDayExcluded() {
    const next = !isDayExcluded
    setDayExcluded(selectedDate, next)
    setIsDayExcluded(next)
    if (onRefresh) onRefresh()
  }

  function handlePullRefresh() {
    if (onRefresh) onRefresh()
  }

  // ── Horizontal swipe to jump days ───────────────────────────────────────
  // Track starting touch + only react when the gesture is clearly horizontal
  // (so vertical scrolling and pull-to-refresh keep working).
  function handleSwipeStart(e) {
    const t = e.touches[0]
    swipeStart.current = { x: t.clientX, y: t.clientY, locked: null }
    setSwipeDx(0)
  }
  function handleSwipeMove(e) {
    const s = swipeStart.current
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (s.locked === null) {
      // Decide direction once we've moved at least ~10px
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (s.locked !== 'h') return
    // Don't allow swiping forward past today
    const clamped = (selectedDate >= today && dx < 0) ? Math.max(dx, -20) : dx
    setSwipeDx(Math.max(-120, Math.min(120, clamped)))
  }
  function handleSwipeEnd() {
    const s = swipeStart.current
    swipeStart.current = null
    const dx = swipeDx
    setSwipeDx(0)
    if (!s || s.locked !== 'h') return
    if (dx <= -60) goDay(1)        // swipe left → forward (next day)
    else if (dx >= 60) goDay(-1)   // swipe right → back (previous day)
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="flex flex-col h-full overflow-y-auto scroll-touch pb-4">
    <div
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      onTouchCancel={handleSwipeEnd}
      style={{
        transform: swipeDx ? `translateX(${swipeDx * 0.5}px)` : undefined,
        transition: swipeDx ? 'none' : 'transform 0.2s',
      }}
    >

      {/* Header with date picker */}
      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">Stats</h1>
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={() => goDay(-1)}
            className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Tap to open native date picker */}
          <div className="relative flex-1 text-center">
            <button
              onClick={() => dateInputRef.current?.showPicker?.()}
              className="text-sm font-medium text-pine-700 dark:text-cream-300 hover:text-pine-500 dark:hover:text-pine-200 transition-colors py-1 px-2 rounded-lg hover:bg-cream-100 dark:hover:bg-pine-800"
            >
              {selectedDate === today
                ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              }
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              max={today}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="absolute inset-0 opacity-0 w-full cursor-pointer"
            />
          </div>

          <button
            onClick={() => goDay(1)}
            disabled={selectedDate >= today}
            className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={() => setShowCalendar(true)}
            aria-label="Open calendar"
            className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all flex-shrink-0"
          >
            <CalendarIcon size={16} />
          </button>

          {selectedDate !== today && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-xs font-semibold text-pine-500 dark:text-pine-300 px-2 py-1 rounded-lg bg-pine-100 dark:bg-pine-800 hover:bg-pine-200 dark:hover:bg-pine-700 transition-all flex-shrink-0"
            >
              Today
            </button>
          )}
        </div>

        {/* Exclude from averages toggle */}
        <button
          onClick={toggleDayExcluded}
          className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
            isDayExcluded
              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              : 'bg-cream-100 dark:bg-pine-800 text-cream-500 dark:text-pine-400 border-cream-200 dark:border-pine-700'
          }`}
        >
          {isDayExcluded
            ? <><EyeOff size={11} /> Excluded from averages</>
            : <><Eye size={11} /> Included in averages</>
          }
        </button>
      </div>

      {/* Calorie hero */}
      <section className="mx-4 mt-3 rounded-2xl px-5 py-5 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-cream-500 dark:text-pine-400">Calories</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-display text-5xl font-bold text-pine-900 dark:text-cream-100">{fmt(totals.calories)}</span>
              <span className="text-sm text-cream-500 dark:text-pine-400">/ {fmt(goals.calories)} kcal</span>
            </div>
          </div>
          <RingProgress value={calPct} size={64} />
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-cream-200 dark:bg-pine-800">
          <div
            className={`h-full rounded-full transition-all ${progressBgColor(totals.calories, goals.calories)}`}
            style={{ width: `${Math.min(100, calPct)}%` }}
          />
        </div>
        <p className="text-xs text-cream-500 dark:text-pine-400 mt-2">
          {(goals.calories - (totals.calories || 0)) > 0
            ? `${fmt(goals.calories - (totals.calories || 0))} kcal remaining`
            : `${fmt((totals.calories || 0) - goals.calories)} kcal over goal`}
        </p>
      </section>

      {/* Macros grid */}
      <section className="mx-4 mt-3">
        <div className="grid grid-cols-2 gap-2">
          {MACRO_LABELS.map(({ key, label, unit, color }) => {
            const val  = totals[key] || 0
            const goal = goals[key]  || 1
            const p    = Math.min(100, pct(val, goal))
            return (
              <div key={key} className="rounded-2xl px-4 py-3 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
                <p className="text-xs text-cream-500 dark:text-pine-400 mb-1">{label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold" style={{ color }}>{fmt(val)}</span>
                  <span className="text-xs text-cream-400 dark:text-pine-500">/ {fmt(goal)}{unit}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mt-2 bg-cream-200 dark:bg-pine-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Day's meals by category */}
      {mealsByCategory.length > 0 && (
        <section className="mx-4 mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-2 px-1">
            {selectedDate === today ? "Today's Meals" : 'Meals'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {mealsByCategory.map(({ cat, cal, count }) => (
              <div key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${(CATEGORY_STYLES[cat] || CATEGORY_STYLES.Snack).pill}`}>
                <span className="text-xs font-semibold">{cat}</span>
                <span className="text-xs opacity-70">{fmt(cal)} kcal{count > 1 ? ` · ${count}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7-day calorie chart */}
      <section className="mx-4 mt-4 rounded-2xl px-4 pt-4 pb-3 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-4">
          7-Day Calories
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={weekData} barSize={20} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fill: '#a09278', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#a09278', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e2521', border: '1px solid #272f2b', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#63b587' }}
              itemStyle={{ color: '#3d9b6a' }}
            />
            <ReferenceLine y={goals.calories} stroke="#3d9b6a" strokeDasharray="4 3" strokeOpacity={0.6} />
            <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
              {weekData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.excluded
                    ? '#52525b'
                    : entry.day === 'Today' ? '#3d9b6a' : '#15472d'}
                  fillOpacity={entry.excluded ? 0.4 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-cream-400 dark:text-pine-500 text-center mt-1">Dashed = goal</p>
      </section>

      {/* 7-day protein chart */}
      <section className="mx-4 mt-3 rounded-2xl px-4 pt-4 pb-3 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-4">
          7-Day Protein (g)
        </p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={weekData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fill: '#a09278', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#a09278', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e2521', border: '1px solid #272f2b', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#63b587' }}
              itemStyle={{ color: '#60a5fa' }}
            />
            <ReferenceLine y={goals.proteinG} stroke="#60a5fa" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="protein" stroke="#60a5fa" strokeWidth={2}
              dot={{ fill: '#60a5fa', r: 3 }} activeDot={{ r: 5 }}
              connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Weekly summary */}
      {weekStats && (
        <section className="mx-4 mt-3 mb-4 rounded-2xl px-4 py-4 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-3">
            Weekly Summary
          </p>
          <div className="flex gap-3 mb-3 flex-wrap">
            <div className="flex-1 min-w-[80px] text-center rounded-xl py-2 bg-cream-100 dark:bg-pine-800">
              <p className="text-[10px] text-cream-500 dark:text-pine-400">Avg / day</p>
              <p className="text-sm font-bold text-pine-800 dark:text-cream-200 mt-0.5">{weekStats.avgCal} kcal</p>
            </div>
            <div className="flex-1 min-w-[80px] text-center rounded-xl py-2 bg-cream-100 dark:bg-pine-800">
              <p className="text-[10px] text-cream-500 dark:text-pine-400">Avg protein</p>
              <p className="text-sm font-bold text-pine-800 dark:text-cream-200 mt-0.5">{weekStats.avgProtein}g</p>
            </div>
            <div className="flex-1 min-w-[80px] text-center rounded-xl py-2 bg-cream-100 dark:bg-pine-800">
              <p className="text-[10px] text-cream-500 dark:text-pine-400">Days logged</p>
              <p className="text-sm font-bold text-pine-800 dark:text-cream-200 mt-0.5">{weekStats.activeDays} / 7</p>
            </div>
          </div>
          {weekInsights.length > 0 && (
            <div className="space-y-2">
              {weekInsights.map((ins, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
                  ins.type === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
                    : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                }`}>
                  <span className="mt-0.5 flex-shrink-0">{ins.type === 'warn' ? '⚠' : '✓'}</span>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>

      {showCalendar && (
        <CalendarModal
          today={today}
          selectedDate={selectedDate}
          goals={goals}
          resetHour={getSettings().resetHour ?? 2}
          onSelect={d => { setSelectedDate(d); setShowCalendar(false) }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </PullToRefresh>
  )
}

// ── Calendar modal ─────────────────────────────────────────────────────────
function CalendarModal({ today, selectedDate, goals, resetHour, onSelect, onClose }) {
  // Anchor the visible month on the selected date
  const [viewYear,  setViewYear]  = useState(() => Number(selectedDate.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(selectedDate.slice(5, 7)) - 1)

  // Per-day calorie totals across all meals (computed once)
  const dayCalories = useMemo(() => {
    const map = {}
    getMeals().forEach(m => {
      if (m.status === 'analyzing' || !m.analysis) return
      const k = getDateKey(m.timestamp, resetHour)
      map[k] = (map[k] || 0) + (m.analysis.totals?.calories || 0)
    })
    return map
  }, [resetHour])

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const monthName  = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const firstDow   = new Date(viewYear, viewMonth, 1).getDay()      // 0=Sun
  const daysInMo   = new Date(viewYear, viewMonth + 1, 0).getDate()
  const goalCal    = goals?.calories || 0

  // Build a flat 6×7 grid (some leading/trailing slots are empty)
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)

  const isFutureMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01` > today

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] bg-black/50 flex items-end sm:items-center justify-center px-4 pt-4 animate-fade-in"
      style={{ paddingBottom: 'max(1rem, calc(var(--sab) + 1rem))' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 p-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-semibold text-pine-900 dark:text-cream-100">{monthName}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftMonth(1)}
              disabled={isFutureMonth}
              className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all disabled:opacity-30"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-pine-800 text-cream-500 dark:text-pine-400 active:scale-90 transition-all"
              aria-label="Close calendar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />
            const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const cal = dayCalories[key] || 0
            const isFuture   = key > today
            const isToday    = key === today
            const isSelected = key === selectedDate
            const hasMeals   = cal > 0
            // Color the dot by goal proximity
            const dotColor = !hasMeals
              ? null
              : cal > goalCal * 1.2
                ? 'bg-red-400'
                : cal >= goalCal * 0.85
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
            return (
              <button
                key={i}
                onClick={() => !isFuture && onSelect(key)}
                disabled={isFuture}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all active:scale-90
                  ${isSelected
                    ? 'bg-pine-500 dark:bg-pine-400 text-white dark:text-pine-950 font-bold'
                    : isToday
                      ? 'ring-1 ring-pine-400 text-pine-700 dark:text-cream-200 font-semibold'
                      : isFuture
                        ? 'text-cream-300 dark:text-pine-700'
                        : 'text-pine-700 dark:text-cream-200 hover:bg-cream-100 dark:hover:bg-pine-800'
                  }`}
              >
                <span>{d}</span>
                {dotColor && !isSelected && (
                  <span className={`absolute bottom-1 w-1 h-1 rounded-full ${dotColor}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}

function RingProgress({ value, size = 56 }) {
  const r     = (size - 10) / 2
  const circ  = 2 * Math.PI * r
  const dash  = Math.min(100, value) / 100 * circ
  const color = value <= 105 ? '#3d9b6a' : value <= 120 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#15472d" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="bold">
        {Math.min(999, value)}%
      </text>
    </svg>
  )
}
