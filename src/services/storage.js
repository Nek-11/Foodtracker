const KEYS = {
  MEALS:    'ft_meals',
  GOALS:    'ft_goals',
  SETTINGS: 'ft_settings',
  PENDING:  'ft_pending',   // { [mealId]: { foodImage, labelImage, note } }
}

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
  provider:     'claude',
  claudeApiKey: '',
  openaiApiKey: '',
  resetHour:    2,    // meals logged before 2am count as "previous day"
  theme:        'dark',
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
    meals[idx] = meal
  } else {
    meals.unshift(meal)
  }
  localStorage.setItem(KEYS.MEALS, JSON.stringify(meals.slice(0, 200)))
  return meal
}

export function updateMeal(id, updates) {
  const meals = getMeals()
  const idx = meals.findIndex(m => m.id === id)
  if (idx >= 0) {
    meals[idx] = { ...meals[idx], ...updates }
    localStorage.setItem(KEYS.MEALS, JSON.stringify(meals))
  }
}

export function deleteMeal(id) {
  const meals = getMeals().filter(m => m.id !== id)
  localStorage.setItem(KEYS.MEALS, JSON.stringify(meals))
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

/** Return 'YYYY-MM-DD' in local time, with the day counting past midnight up to resetHour. */
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

/** Local-time today key. */
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
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings))
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export function exportHistory() {
  const meals = getMeals()
  const payload = { version: 1, exportedAt: new Date().toISOString(), meals }
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
        const imported = Array.isArray(data) ? data : (data.meals || [])
        const existing = getMeals()
        // existing wins on conflict (preserve local edits)
        const byId = {}
        imported.forEach(m => { byId[m.id] = m })
        existing.forEach(m => { byId[m.id] = m })
        const merged = Object.values(byId)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 200)
        localStorage.setItem(KEYS.MEALS, JSON.stringify(merged))
        resolve(merged.length)
      } catch {
        reject(new Error('Invalid file — expected a Foodtracker JSON export.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}
