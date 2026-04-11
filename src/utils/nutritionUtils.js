/**
 * Format a number for display (round to nearest integer).
 */
export function fmt(n) {
  return Math.round(n || 0)
}

/**
 * Return progress as a percentage (capped at 200%).
 */
export function pct(value, goal) {
  if (!goal) return 0
  return Math.min(200, Math.round((value / goal) * 100))
}

/**
 * Color class based on how close to goal.
 * green = 0–105%, amber = 106–120%, red = >120%
 */
export function progressColor(value, goal) {
  const p = pct(value, goal)
  if (p <= 105) return 'text-emerald-400'
  if (p <= 120) return 'text-amber-400'
  return 'text-red-400'
}

export function progressBgColor(value, goal) {
  const p = pct(value, goal)
  if (p <= 105) return 'bg-emerald-500'
  if (p <= 120) return 'bg-amber-500'
  return 'bg-red-500'
}

/**
 * Format a date string (YYYY-MM-DD) to a human-readable label.
 */
export function formatDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Format a timestamp to time string (e.g. "2:34 PM").
 */
export function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * Group meals array by date (YYYY-MM-DD), newest first.
 */
export function groupByDate(meals) {
  const groups = {}
  meals.forEach(meal => {
    const date = meal.timestamp.slice(0, 10)
    if (!groups[date]) groups[date] = []
    groups[date].push(meal)
  })
  // Sort dates descending
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

export const MACRO_LABELS = [
  { key: 'proteinG',  label: 'Protein',  unit: 'g',  color: '#60a5fa' },
  { key: 'carbsG',    label: 'Carbs',    unit: 'g',  color: '#f59e0b' },
  { key: 'fatG',      label: 'Fat',      unit: 'g',  color: '#f87171' },
  { key: 'fiberG',    label: 'Fiber',    unit: 'g',  color: '#34d399' },
  { key: 'sugarG',    label: 'Sugar',    unit: 'g',  color: '#fb923c' },
  { key: 'sodiumMg',  label: 'Sodium',   unit: 'mg', color: '#a78bfa' },
]
