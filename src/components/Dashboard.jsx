import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, BarChart, Bar, Cell
} from 'recharts'
import { getDailyTotals, getLast7DaysTotals, getGoals } from '../services/storage.js'
import { fmt, pct, progressBgColor, formatDate, MACRO_LABELS } from '../utils/nutritionUtils.js'

export default function Dashboard({ refreshKey }) {
  const [totals,   setTotals]   = useState({})
  const [goals,    setGoals]    = useState({})
  const [weekData, setWeekData] = useState([])

  useEffect(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setTotals(getDailyTotals(today))
    setGoals(getGoals())
    const week = getLast7DaysTotals().map(({ date, totals: t }) => ({
      day: formatDate(date) === 'Today'
        ? 'Today'
        : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      calories: fmt(t.calories),
      protein:  fmt(t.proteinG),
    }))
    setWeekData(week)
  }, [refreshKey])

  const calPct = pct(totals.calories, goals.calories)

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-4">

      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">Today</h1>
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
              contentStyle={{ background: '#162d20', border: '1px solid #15472d', borderRadius: 12, fontSize: 12 }}
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
              contentStyle={{ background: '#162d20', border: '1px solid #15472d', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#63b587' }}
              itemStyle={{ color: '#60a5fa' }}
            />
            <ReferenceLine y={goals.proteinG} stroke="#60a5fa" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="protein" stroke="#60a5fa" strokeWidth={2}
              dot={{ fill: '#60a5fa', r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>
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
