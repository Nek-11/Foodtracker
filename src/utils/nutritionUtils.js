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

export function formatDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function groupByDate(meals) {
  const groups = {}
  meals.forEach(meal => {
    const date = meal.timestamp.slice(0, 10)
    if (!groups[date]) groups[date] = []
    groups[date].push(meal)
  })
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

// ── Meal category logic ────────────────────────────────────────────────────────

/**
 * Minimum kcal for a timed meal to qualify as Lunch or Dinner.
 * Below this it's a Snack even if the time matches.
 * (Not configurable — keep it simple.)
 */
export const MEAL_CALORIE_THRESHOLD = 400

/** Default time windows used when none are configured in Settings. */
export const DEFAULT_MEAL_SLOTS = {
  breakfast: { start: '06:00', end: '10:00' },
  lunch:     { start: '11:00', end: '14:00' },
  dinner:    { start: '18:00', end: '22:00' },
}

function timeToMins(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

function isInSlot(currentMin, start, end) {
  const s = timeToMins(start)
  const e = timeToMins(end)
  if (s <= e) return currentMin >= s && currentMin <= e
  // Wraps midnight
  return currentMin >= s || currentMin <= e
}

/**
 * Determine meal category from time-of-day, calories, and (optionally) configured time slots.
 *
 * Rules:
 *  - Breakfast: any meal whose time falls within the breakfast window (calories irrelevant)
 *  - Lunch:     time in lunch window AND calories ≥ MEAL_CALORIE_THRESHOLD
 *  - Dinner:    time in dinner window AND calories ≥ MEAL_CALORIE_THRESHOLD
 *  - Otherwise: Snack
 *
 * @param {string}  isoTimestamp
 * @param {number}  calories
 * @param {object}  timeSlots  - { breakfast, lunch, dinner } each with { start, end } "HH:MM"
 */
export function getMealCategory(isoTimestamp, calories = 0, timeSlots = DEFAULT_MEAL_SLOTS) {
  const d   = new Date(isoTimestamp)
  const min = d.getHours() * 60 + d.getMinutes()
  const { breakfast, lunch, dinner } = { ...DEFAULT_MEAL_SLOTS, ...timeSlots }

  if (isInSlot(min, breakfast.start, breakfast.end)) return 'Breakfast'
  if (isInSlot(min, lunch.start, lunch.end) && calories >= MEAL_CALORIE_THRESHOLD) return 'Lunch'
  if (isInSlot(min, dinner.start, dinner.end) && calories >= MEAL_CALORIE_THRESHOLD) return 'Dinner'
  return 'Snack'
}

/**
 * Return the display types for a meal.
 * Respects manually-assigned mealTypes; falls back to auto-computed category.
 *
 * @param {object} meal
 * @param {object} [timeSlots] - from settings.mealTimeSlots
 */
export function getMealTypes(meal, timeSlots = DEFAULT_MEAL_SLOTS) {
  if (meal.mealTypes && meal.mealTypes.length > 0) return meal.mealTypes
  return [getMealCategory(meal.timestamp, meal.analysis?.totals?.calories || 0, timeSlots)]
}

/** All selectable meal types. */
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
