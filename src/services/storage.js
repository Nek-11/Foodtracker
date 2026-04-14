import { DEFAULT_MEAL_SLOTS } from '../utils/nutritionUtils.js'

const KEYS = {
  MEALS:    'ft_meals',
  GOALS:    'ft_goals',
  SETTINGS: 'ft_settings',
  PENDING:  'ft_pending',   // { [mealId]: { foodImage, labelImage, note } }
}

// FIFO rolling window: when a new meal is added at this limit, the oldest is dropped.
const MEAL_CAP = 800

// Number of days to keep thumbnails (today + yesterday = 2)
const THUMBNAIL_DAYS = 2

const DEFAULT_GOALS = {
  calories: 2600,
  proteinG: 160,
  carbsG:   300,
  sugarG:   60,
  fatG:     85,
  fiberG:   30,
  sodiumMg: 2300,
}

const DEFAULT_SETTINGS = {
  provider:       'claude',
  claudeApiKey:   '',
  openaiApiKey:   '',
  resetHour:      2,    // meals logged before 2am count as "previous day"
  theme:          'system',
  mealTimeSlots:  DEFAULT_MEAL_SLOTS,
}

// ─── Thumbnail cleanup ────────────────────────────────────────────────────────

/**
 * Returns the date key (YYYY-MM-DD) for a given date offset from today,
 * respecting the resetHour boundary.
 */
function dateKeyForOffset(offsetDays, resetHour) {
  const d = new Date()
  // If we're before the reset hour, "today" is still the previous calendar day
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1)
  d.setDate(d.getDate() - offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Strip thumbnails from meals older than THUMBNAIL_DAYS days.
 * Runs on app start to keep localStorage lean (allows ~960+ meals on iOS).
 */
export function cleanupOldThumbnails(resetHour = 2) {
  try {
    const meals = getMeals()
    // Build set of "recent" date keys (today + yesterday)
    const recentKeys = new Set()
    for (let i = 0; i < THUMBNAIL_DAYS; i++) {
      recentKeys.add(dateKeyForOffset(i, resetHour))
    }

    let changed = false
    const updated = meals.map(meal => {
      if (!meal.thumbnail) return meal
      const mealKey = getDateKey(meal.timestamp, resetHour)
      if (!recentKeys.has(mealKey)) {
        changed = true
        return { ...meal, thumbnail: null }
      }
      return meal
    })

    if (changed) {
      localStorage.setItem(KEYS.MEALS, JSON.stringify(updated))
    }
  } catch {
    // Silent — cleanup is best-effort
  }
}

// ─── Internal write helper with QuotaExceededError recovery ──────────────────

function writeMeals(meals) {
  try {
    localStorage.setItem(KEYS.MEALS, JSON.stringify(meals))
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      // Strip thumbnails from old meals and retry once
      const settings = getSettings()
      const resetHour = settings.resetHour ?? 2
      cleanupOldThumbnails(resetHour)
      // Also drop thumbnails from the batch we're about to write
      const stripped = meals.map(m => {
        const mealKey = getDateKey(m.timestamp, resetHour)
        const recentKeys = new Set()
        for (let i = 0; i < THUMBNAIL_DAYS; i++) {
          recentKeys.add(dateKeyForOffset(i, resetHour))
        }
        return recentKeys.has(mealKey) ? m : { ...m, thumbnail: null }
      })
      try {
        localStorage.setItem(KEYS.MEALS, JSON.stringify(stripped))
      } catch {
        // Still failing — silently skip to avoid crashing the app
      }
    }
  }
}

// ─── Meals ───────────────────────────────────────────────────────────────────

export function getMeals() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.MEALS) || '[]')
  } catch {
    return []
  }
}

export function saveMeal(meal) {
  const meals = getMeals()
  const idx = meals.findIndex(m => m.id === meal.id)
  if (idx >= 0) {
    // Update existing meal — no count change
    meals[idx] = meal
  } else {
    // New meal — enforce FIFO: drop oldest if at cap
    if (meals.length >= MEAL_CAP) {
      meals.splice(MEAL_CAP - 1) // remove oldest meal(s) from the end
    }
    meals.unshift(meal)
  }
  writeMeals(meals)
  return meal
}

export function updateMeal(id, updates) {
  const meals = getMeals()
  const idx = meals.findIndex(m => m.id === id)
  if (idx >= 0) {
    meals[idx] = { ...meals[idx], ...updates }
    writeMeals(meals)
  }
}

export function deleteMeal(id) {
  const meals = getMeals().filter(m => m.id !== id)
  writeMeals(meals)
  clearPendingData(id)
}

// ─── Pending data (image/note for retry after crash) ─────────────────────────

function getPendingStore() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.PENDING) || '{}')
  } catch {
    return {}
  }
}

export function savePendingData(id, data) {
  const store = getPendingStore()
  store[id] = data
  localStorage.setItem(KEYS.PENDING, JSON.stringify(store))
}

export function getPendingData(id) {
  return getPendingStore()[id] || null
}

export function clearPendingData(id) {
  const store = getPendingStore()
  delete store[id]
  localStorage.setItem(KEYS.PENDING, JSON.stringify(store))
}

// ─── Date helpers (configurable day-reset hour) ───────────────────────────────

export function getDateKey(isoTimestamp, resetHour = 0) {
  const d = new Date(isoTimestamp)
  if (d.getHours() < resetHour) {
    d.setDate(d.getDate() - 1)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getMealsByDate(dateStr) {
  const { resetHour = 2 } = getSettings()
  return getMeals().filter(m =>
    m.status !== 'analyzing' &&
    getDateKey(m.timestamp, resetHour) === dateStr
  )
}

export function getDailyTotals(dateStr) {
  const meals = getMealsByDate(dateStr)
  return sumMacros(meals.map(m => m.analysis?.totals).filter(Boolean))
}

export function getLast7DaysTotals() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateStr = `${y}-${mon}-${day}`
    days.push({ date: dateStr, totals: getDailyTotals(dateStr) })
  }
  return days
}

function sumMacros(totalsArray) {
  const zero = { calories: 0, proteinG: 0, carbsG: 0, sugarG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 }
  return totalsArray.reduce((acc, t) => {
    Object.keys(zero).forEach(k => { acc[k] = (acc[k] || 0) + (t[k] || 0) })
    return acc
  }, { ...zero })
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function getGoals() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEYS.GOALS) || 'null')
    return stored ? { ...DEFAULT_GOALS, ...stored } : { ...DEFAULT_GOALS }
  } catch {
    return { ...DEFAULT_GOALS }
  }
}

export function saveGoals(goals) {
  localStorage.setItem(KEYS.GOALS, JSON.stringify(goals))
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEYS.SETTINGS) || 'null')
    if (!stored) return { ...DEFAULT_SETTINGS }
    // Deep-merge mealTimeSlots so missing keys fall back to defaults
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      mealTimeSlots: { ...DEFAULT_MEAL_SLOTS, ...stored.mealTimeSlots },
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings))
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export function exportHistory() {
  const meals    = getMeals()
  const settings = getSettings()
  const goals    = getGoals()

  // Strip pending image blobs — they're large and not needed in an export
  const exportMeals = meals.map(({ ...m }) => m)

  const settingsForExport = { ...settings }
  delete settingsForExport.claudeApiKey
  delete settingsForExport.openaiApiKey

  const payload = {
    version:    2,
    exportedAt: new Date().toISOString(),
    meals:      exportMeals,
    settings:   settingsForExport,
    goals,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `foodtracker-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importHistory(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result)

        // Support both v1 (meals array) and v2 ({ meals, settings, goals })
        const imported = Array.isArray(data) ? data : (data.meals || [])
        const existing = getMeals()

        // Existing wins on conflict (preserve local edits)
        const byId = {}
        imported.forEach(m => { byId[m.id] = m })
        existing.forEach(m => { byId[m.id] = m })
        const merged = Object.values(byId)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, MEAL_CAP)
        writeMeals(merged)

        // Restore settings and goals from v2 exports
        if (data.settings) {
          const current = getSettings()
          saveSettings({ ...current, ...data.settings })
        }
        if (data.goals) {
          const currentGoals = getGoals()
          saveGoals({ ...currentGoals, ...data.goals })
        }

        resolve(merged.length)
      } catch {
        reject(new Error('Invalid file — expected a Foodtracker JSON export.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}
