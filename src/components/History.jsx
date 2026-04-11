import { useState, useEffect } from 'react'
import { getMeals, deleteMeal } from '../services/storage.js'
import { fmt, formatDate, formatTime, groupByDate, MACRO_LABELS } from '../utils/nutritionUtils.js'

export default function History({ refreshKey }) {
  const [meals, setMeals] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setMeals(getMeals())
  }, [refreshKey])

  function handleDelete(id) {
    deleteMeal(id)
    setMeals(getMeals())
    if (expanded === id) setExpanded(null)
  }

  const groups = groupByDate(meals)

  if (!meals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div>
          <p className="text-slate-300 font-medium">No meals logged yet</p>
          <p className="text-slate-500 text-sm mt-1">Head to Log to add your first meal</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-slate-400 text-sm mt-0.5">{meals.length} meal{meals.length !== 1 ? 's' : ''} logged</p>
      </div>

      {groups.map(([date, dateMeals]) => (
        <section key={date} className="mx-4 mt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-sm font-semibold text-slate-400">{formatDate(date)}</h2>
            <span className="text-xs text-slate-500">
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function MealCard({ meal, isExpanded, onToggle, onDelete }) {
  const { analysis, thumbnail, timestamp, note } = meal
  const totals = analysis?.totals || {}
  const flagged = analysis?.flagged

  return (
    <div className={`bg-slate-800 rounded-2xl overflow-hidden transition-all ${flagged ? 'ring-1 ring-amber-700/50' : ''}`}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-700 transition-colors"
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm-1 1.93V19H9a1 1 0 000 2h6a1 1 0 000-2h-2v-2.07A5.003 5.003 0 0017 12v-1a1 1 0 00-2 0v1a3 3 0 01-6 0v-1a1 1 0 00-2 0v1a5.003 5.003 0 004 4.93z"/>
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-white truncate">
              {analysis?.mealSummary || note || 'Unnamed meal'}
            </p>
            {flagged && (
              <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatTime(timestamp)}
            <span className="mx-1.5 text-slate-600">·</span>
            {fmt(totals.proteinG)}g P · {fmt(totals.carbsG)}g C · {fmt(totals.fatG)}g F
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-white">{fmt(totals.calories)}</p>
          <p className="text-xs text-slate-500">kcal</p>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-700 px-4 py-4">
          {/* Macros detail */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {MACRO_LABELS.map(({ key, label, unit, color }) => (
              <div key={key} className="text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color }}>
                  {fmt(totals[key])}<span className="text-xs text-slate-500 ml-0.5">{unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Items list */}
          {analysis?.items?.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {analysis.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-300">
                  <span className="truncate max-w-[65%]">{item.name} (~{fmt(item.estimatedWeightG)}g)</span>
                  <span className="text-slate-400 flex-shrink-0">{fmt(item.calories)} kcal</span>
                </div>
              ))}
            </div>
          )}

          {/* Flagged questions */}
          {flagged && analysis?.questions?.length > 0 && (
            <div className="bg-amber-900/20 rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-amber-400 mb-1">Flagged uncertainties</p>
              {analysis.questions.map((q, i) => (
                <p key={i} className="text-xs text-amber-300">{i + 1}. {q}</p>
              ))}
            </div>
          )}

          {/* Note */}
          {note && (
            <p className="text-xs text-slate-400 italic mb-4">Note: "{note}"</p>
          )}

          {/* Delete */}
          <button
            onClick={onDelete}
            className="w-full py-2.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 rounded-xl text-sm text-red-400 font-medium transition-colors active:scale-95"
          >
            Delete Meal
          </button>
        </div>
      )}
    </div>
  )
}
