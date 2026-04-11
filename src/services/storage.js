// localStorage keys
const KEYS = {
  MEALS: 'ft_meals',
  GOALS: 'ft_goals',
  SETTINGS: 'ft_settings',
}

// Default daily goals for an athletic 29-year-old male
const DEFAULT_GOALS = {
  calories: 2600,
  proteinG: 160,
  carbsG: 300,
  sugarG: 60,
  fatG: 85,
  fiberG: 30,
  sodiumMg: 2300,
}

const DEFAULT_SETTINGS = {
  provider: 'claude',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-6',
  openaiApiKey: '',
  openaiModel: 'o4-mini',
  reasoningEffort: 'medium',
}

// --- Meals ---

export function getMeals() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.MEALS) || '[]')
  } catch {
    return []
  }
}

export function saveMeal(meal) {
  const meals = getMeals()
  const existing = meals.findIndex(m => m.id === meal.id)
  if (existing >= 0) {
    meals[existing] = meal
  } else {
    meals.unshift(meal) // newest first
  }
  // Keep at most 200 meals to avoid filling localStorage
  const trimmed = meals.slice(0, 200)
  localStorage.setItem(KEYS.MEALS, JSON.stringify(trimmed))
  return meal
}

export function deleteMeal(id) {
  const meals = getMeals().filter(m => m.id !== id)
  localStorage.setItem(KEYS.MEALS, JSON.stringify(meals))
}

export function getMealsByDate(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  return getMeals().filter(m => m.timestamp.startsWith(dateStr))
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
    const dateStr = d.toISOString().slice(0, 10)
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

// --- Goals ---

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

// --- Settings ---

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
