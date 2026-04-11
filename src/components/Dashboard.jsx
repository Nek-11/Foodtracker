import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, BarChart, Bar, Cell
} from 'recharts'
import { getDailyTotals, getLast7DaysTotals, getGoals } from '../services/storage.js'
import { fmt, pct, progressBgColor, formatDate, MACRO_LABELS } from '../utils/nutritionUtils.js'

export default function Dashboard({ refreshKey }) {
  const [totals, setTotals] = useState({})
  const [goals, setGoals] = useState({})
  const [weekData, setWeekData] = useState([])

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setTotals(getDailyTotals(today))
    setGoals(getGoals())
    const week = getLast7DaysTotals().map(({ date, totals: t }) => ({
      day: formatDate(date) === 'Today' ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      calories: fmt(t.calories),
      protein: fmt(t.proteinG),
    }))
    setWeekData(week)
  }, [refreshKey])

  const calPct = pct(totals.calories, goals.calories)

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Calorie hero card */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl px-5 py-5">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider">Calories</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-5xl font-bold">{fmt(totals.calories)}</span>
              <span className="text-slate-400 text-sm">/ {fmt(goals.calories)} kcal</span>
            </div>
          </div>
          <RingProgress value={calPct} size={64} />
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressBgColor(totals.calories, goals.calories)}`}
            style={{ width: `${Math.min(100, calPct)}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {goals.calories - (totals.calories || 0) > 0
            ? `${fmt(goals.calories - totals.calories)} kcal remaining`
            : `${fmt((totals.calories || 0) - goals.calories)} kcal over goal`}
        </p>
      </section>

      {/* Macros grid */}
      <section className="mx-4 mt-3">
        <div className="grid grid-cols-2 gap-2">
          {MACRO_LABELS.map(({ key, label, unit, color }) => {
            const val = totals[key] || 0
            const goal = goals[key] || 1
            const p = Math.min(100, pct(val, goal))
            return (
              <div key={key} className="bg-slate-800 rounded-2xl px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold" style={{ color }}>{fmt(val)}</span>
                  <span className="text-xs text-slate-500">/ {fmt(goal)}{unit}</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${p}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 7-day calorie chart */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          7-Day Calories
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={weekData} barSize={20} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#10b981' }}
            />
            <ReferenceLine y={goals.calories} stroke="#10b981" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
              {weekData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.day === 'Today' ? '#10b981' : '#334155'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 text-center mt-1">Dashed line = goal</p>
      </section>

      {/* 7-day protein chart */}
      <section className="mx-4 mt-3 bg-slate-800 rounded-2xl px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          7-Day Protein (g)
        </p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={weekData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#60a5fa' }}
            />
            <ReferenceLine y={goals.proteinG} stroke="#60a5fa" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Line
              type="monotone"
              dataKey="protein"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ fill: '#60a5fa', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}

function RingProgress({ value, size = 56 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.min(100, value) / 100 * circ
  const color = value <= 105 ? '#10b981' : value <= 120 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">
        {Math.min(999, value)}%
      </text>
    </svg>
  )
}
