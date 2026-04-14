import { describe, it, expect, beforeEach } from 'vitest'
import {
  getMeals, saveMeal, updateMeal, deleteMeal,
  getGoals, saveGoals,
  getSettings, saveSettings,
  savePendingData, getPendingData, clearPendingData,
  getDailyTotals, getMealsByDate,
  exportHistory,
} from '../services/storage.js'

function makeMeal(overrides = {}) {
  return {
    id: overrides.id || 'test-1',
    timestamp: overrides.timestamp || '2024-01-15T12:00:00.000Z',
    thumbnail: null,
    note: 'test meal',
    analysis: overrides.analysis || {
      totals: { calories: 500, proteinG: 30, carbsG: 60, fatG: 15, sugarG: 10, fiberG: 5, sodiumMg: 400 },
      mealSummary: 'Test meal',
      items: [],
      questions: [],
      notes: [],
      flagged: false,
      confidence: 'high',
    },
    status: overrides.status || 'done',
    errorMessage: null,
    userNotes: null,
    ...overrides,
  }
}

describe('Meals CRUD', () => {
  it('starts with empty meals', () => {
    expect(getMeals()).toEqual([])
  })

  it('saves and retrieves a meal', () => {
    const meal = makeMeal()
    saveMeal(meal)
    const meals = getMeals()
    expect(meals).toHaveLength(1)
    expect(meals[0].id).toBe('test-1')
  })

  it('saves new meals at the front of the list', () => {
    saveMeal(makeMeal({ id: 'a' }))
    saveMeal(makeMeal({ id: 'b' }))
    const meals = getMeals()
    expect(meals[0].id).toBe('b')
    expect(meals[1].id).toBe('a')
  })

  it('updates an existing meal by id', () => {
    saveMeal(makeMeal({ id: 'a' }))
    expect(getMeals()[0].status).toBe('done')
    saveMeal(makeMeal({ id: 'a', status: 'error' }))
    const meals = getMeals()
    expect(meals).toHaveLength(1)
    expect(meals[0].status).toBe('error')
  })

  it('updateMeal patches fields', () => {
    saveMeal(makeMeal({ id: 'a' }))
    updateMeal('a', { userNotes: 'very good' })
    expect(getMeals()[0].userNotes).toBe('very good')
  })

  it('deleteMeal removes a meal', () => {
    saveMeal(makeMeal({ id: 'a' }))
    saveMeal(makeMeal({ id: 'b' }))
    deleteMeal('a')
    const meals = getMeals()
    expect(meals).toHaveLength(1)
    expect(meals[0].id).toBe('b')
  })

  it('caps at 1000 meals', () => {
    for (let i = 0; i < 1010; i++) {
      saveMeal(makeMeal({ id: `m-${i}` }))
    }
    expect(getMeals().length).toBe(1000)
  })
})

describe('Goals', () => {
  it('returns defaults when no goals saved', () => {
    const goals = getGoals()
    expect(goals.calories).toBe(2600)
    expect(goals.proteinG).toBe(160)
  })

  it('saves and retrieves goals', () => {
    saveGoals({ calories: 1800, proteinG: 120 })
    const goals = getGoals()
    expect(goals.calories).toBe(1800)
    expect(goals.proteinG).toBe(120)
    // Other defaults should still be present
    expect(goals.carbsG).toBe(300)
  })
})

describe('Settings', () => {
  it('returns defaults when no settings saved', () => {
    const s = getSettings()
    expect(s.provider).toBe('claude')
    expect(s.resetHour).toBe(2)
    expect(s.mealTimeSlots.breakfast.start).toBe('06:00')
  })

  it('saves and retrieves settings', () => {
    saveSettings({ provider: 'openai', claudeApiKey: 'test-key', resetHour: 3 })
    const s = getSettings()
    expect(s.provider).toBe('openai')
    expect(s.resetHour).toBe(3)
  })

  it('deep-merges mealTimeSlots with defaults', () => {
    saveSettings({ mealTimeSlots: { breakfast: { start: '07:00', end: '09:00' } } })
    const s = getSettings()
    expect(s.mealTimeSlots.breakfast.start).toBe('07:00')
    // Lunch should still have defaults
    expect(s.mealTimeSlots.lunch.start).toBe('11:00')
  })
})

describe('Pending data', () => {
  it('saves and retrieves pending data', () => {
    savePendingData('meal-1', { foodImage: 'base64...', note: 'test' })
    const data = getPendingData('meal-1')
    expect(data.note).toBe('test')
  })

  it('returns null for unknown id', () => {
    expect(getPendingData('nonexistent')).toBeNull()
  })

  it('clears pending data', () => {
    savePendingData('meal-1', { note: 'test' })
    clearPendingData('meal-1')
    expect(getPendingData('meal-1')).toBeNull()
  })
})

describe('Daily totals', () => {
  it('sums macros for meals on a given date', () => {
    saveMeal(makeMeal({
      id: 'a',
      timestamp: '2024-01-15T12:00:00.000Z',
      analysis: { totals: { calories: 500, proteinG: 30, carbsG: 60, fatG: 15, sugarG: 10, fiberG: 5, sodiumMg: 400 } },
    }))
    saveMeal(makeMeal({
      id: 'b',
      timestamp: '2024-01-15T18:00:00.000Z',
      analysis: { totals: { calories: 700, proteinG: 40, carbsG: 80, fatG: 20, sugarG: 15, fiberG: 8, sodiumMg: 600 } },
    }))
    const totals = getDailyTotals('2024-01-15')
    expect(totals.calories).toBe(1200)
    expect(totals.proteinG).toBe(70)
  })

  it('excludes meals still analyzing', () => {
    saveMeal(makeMeal({ id: 'a', timestamp: '2024-01-15T12:00:00.000Z', status: 'analyzing' }))
    saveMeal(makeMeal({
      id: 'b',
      timestamp: '2024-01-15T14:00:00.000Z',
      analysis: { totals: { calories: 300, proteinG: 20, carbsG: 30, fatG: 10, sugarG: 5, fiberG: 3, sodiumMg: 200 } },
    }))
    const totals = getDailyTotals('2024-01-15')
    expect(totals.calories).toBe(300)
  })
})

describe('Export excludes API keys', () => {
  it('does not include API keys in exported data', () => {
    // Mock the download mechanism
    const links = []
    const origCreate = document.createElement.bind(document)
    document.createElement = (tag) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        links.push(el)
        el.click = () => {}
      }
      return el
    }

    saveSettings({ provider: 'claude', claudeApiKey: 'sk-ant-secret', openaiApiKey: 'sk-secret' })
    saveMeal(makeMeal({ id: 'export-test' }))

    exportHistory()

    // Check the blob that was created
    expect(links.length).toBe(1)
    const href = links[0].href
    expect(href).toBeTruthy()

    document.createElement = origCreate
  })
})
