import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, BarChart, Bar, Cell
} from 'recharts'
import { getDailyTotals, getLast7DaysTotals, getGoals, getMealsByDate } from '../services/storage.js'
import { fmt, pct, progressBgColor, formatDate, MACRO_LABELS, getMealTypes, CATEGORY_STYLES } from '../utils/nutritionUtils.js'

export default function Dashboard({ refreshKey }) {
  const [totals,          setTotals]          = useState({})
  const [goals,           setGoals]           = useState({})
  const [weekData,        setWeekData]        = useState([])
  const [mealsByCategory, setMealsByCategory] = useState([])
  const [weekInsights,    setWeekInsights]    = useState([])
  const [weekStats,       setWeekStats]       = useState(null)

  useEffect(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setTotals(getDailyTotals(today))
    const g = getGoals()
    setGoals(g)

    // Meal breakdown by category for today
    const todayMeals = getMealsByDate(today).filter(m => m.analysis)
    const catMap = {}
    todayMeals.forEach(m => {
      // Use manually-set types if available, otherwise auto-compute
      const types = getMealTypes(m)
      types.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { cal: 0, count: 0 }
        // Divide calories evenly across multiple types to avoid double-counting
        catMap[cat].cal   += (m.analysis.totals.calories || 0) / types.length
        catMap[cat].count += 1 / types.length
      })
    })
    const order = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Drink']
    setMealsByCategory(order.filter(c => catMap[c]).map(c => ({ cat: c, cal: Math.round(catMap[c].cal), count: Math.round(catMap[c].count) || 1 })))

    const raw7 = getLast7DaysTotals()
    const week = raw7.map(({ date, totals: t }) => ({
      day: formatDate(date) === 'Today'
        ? 'Today'
        : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      calories: fmt(t.calories),
      protein:  fmt(t.proteinG),
    }))
    setWeekData(week)

    // Weekly insights (only days with >300 kcal logged count as "active")
    const active = raw7.filter(d => d.totals.calories > 300)
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
  }, [refreshKey])

  const calPct = pct(totals.calories, goals.calories)

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-4">

      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">Stats</h1>
        <p className="text-sm mt-0.5 text-cream-500 dark:text-pine-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Calorie hero */}
      <section className="mx-4 mt-4 rounded-2xl px-5 py-5 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
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

      {/* Today's meals by category */}
      {mealsByCategory.length > 0 && (
        <section className="mx-4 mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-2 px-1">
            Today's Meals
          </p>
          <div className="flex gap-2 flex-wrap">
            {mealsByCategory.map(({ cat, cal, count }) => (
              <div key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${CATEGORY_STYLES[cat].pill}`}>
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
                <Cell key={i} fill={entry.day === 'Today' ? '#3d9b6a' : '#15472d'} />
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
              dot={{ fill: '#60a5fa', r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Weekly summary */}
      {weekStats && (
        <section className="mx-4 mt-3 mb-4 rounded-2xl px-4 py-4 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-3">
            Weekly Summary
          </p>

          {/* Stat pills */}
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

          {/* Insights */}
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
