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

/**
 * Determine meal category based on time-of-day and calorie threshold.
 *
 * Rules (user-defined):
 *  06:00–11:30  → Breakfast
 *  11:31–14:30  → Lunch (≥800 kcal) or Snack
 *  14:31–18:30  → Snack
 *  18:31–02:00  → Dinner (≥800 kcal) or Snack
 *  02:01–05:59  → Snack
 */
export function getMealCategory(isoTimestamp, calories = 0) {
  const d   = new Date(isoTimestamp)
  const min = d.getHours() * 60 + d.getMinutes()

  if (min >= 360 && min <= 690)  return 'Breakfast'                           // 06:00–11:30
  if (min >= 691 && min <= 870)  return calories >= 800 ? 'Lunch'   : 'Snack' // 11:31–14:30
  if (min >= 871 && min <= 1110) return 'Snack'                               // 14:31–18:30
  if (min >= 1111 || min <= 120) return calories >= 800 ? 'Dinner'  : 'Snack' // 18:31–02:00
  return 'Snack'                                                               // 02:01–05:59
}

/**
 * Get the display types for a meal.
 * Respects manually assigned mealTypes; falls back to auto-computed category.
 *
 * @param {object} meal
 * @returns {string[]} e.g. ['Dinner', 'Drink']
 */
export function getMealTypes(meal) {
  if (meal.mealTypes && meal.mealTypes.length > 0) return meal.mealTypes
  return [getMealCategory(meal.timestamp, meal.analysis?.totals?.calories || 0)]
}

/** All selectable meal types (for filters and edit mode). */
export const ALL_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink']

export const CATEGORY_STYLES = {
  Breakfast: { pill: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
  Lunch:     { pill: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' },
  Dinner:    { pill: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400' },
  Snack:     { pill: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  Drink:     { pill: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' },
}

export const MACRO_LABELS = [
  { key: 'proteinG',  label: 'Protein',  unit: 'g',  color: '#60a5fa' },
  { key: 'carbsG',    label: 'Carbs',    unit: 'g',  color: '#f59e0b' },
  { key: 'fatG',      label: 'Fat',      unit: 'g',  color: '#f87171' },
  { key: 'fiberG',    label: 'Fiber',    unit: 'g',  color: '#34d399' },
  { key: 'sugarG',    label: 'Sugar',    unit: 'g',  color: '#fb923c' },
  { key: 'sodiumMg',  label: 'Sodium',   unit: 'mg', color: '#a78bfa' },
]
