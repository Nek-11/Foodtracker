import { describe, it, expect } from 'vitest'
import {
  fmt, pct, progressColor, progressBgColor,
  getMealCategory, getMealTypes, DEFAULT_MEAL_SLOTS,
  MEAL_CALORIE_THRESHOLD,
} from '../utils/nutritionUtils.js'

describe('fmt', () => {
  it('rounds to nearest integer', () => {
    expect(fmt(12.7)).toBe(13)
    expect(fmt(12.3)).toBe(12)
  })
  it('returns 0 for falsy values', () => {
    expect(fmt(null)).toBe(0)
    expect(fmt(undefined)).toBe(0)
    expect(fmt(0)).toBe(0)
  })
})

describe('pct', () => {
  it('calculates percentage', () => {
    expect(pct(50, 100)).toBe(50)
    expect(pct(100, 100)).toBe(100)
  })
  it('caps at 200%', () => {
    expect(pct(300, 100)).toBe(200)
  })
  it('returns 0 when goal is 0 or falsy', () => {
    expect(pct(50, 0)).toBe(0)
    expect(pct(50, null)).toBe(0)
  })
})

describe('progressColor', () => {
  it('returns green at or below 105%', () => {
    expect(progressColor(100, 100)).toBe('text-emerald-400')
    expect(progressColor(105, 100)).toBe('text-emerald-400')
  })
  it('returns amber between 106-120%', () => {
    expect(progressColor(110, 100)).toBe('text-amber-400')
    expect(progressColor(120, 100)).toBe('text-amber-400')
  })
  it('returns red above 120%', () => {
    expect(progressColor(130, 100)).toBe('text-red-400')
  })
})

describe('progressBgColor', () => {
  it('returns green bg at or below 105%', () => {
    expect(progressBgColor(100, 100)).toBe('bg-emerald-500')
  })
  it('returns amber bg between 106-120%', () => {
    expect(progressBgColor(115, 100)).toBe('bg-amber-500')
  })
  it('returns red bg above 120%', () => {
    expect(progressBgColor(150, 100)).toBe('bg-red-500')
  })
})

describe('getMealCategory', () => {
  const slots = DEFAULT_MEAL_SLOTS

  it('returns Breakfast for morning meals', () => {
    const ts = '2024-01-15T08:30:00'
    expect(getMealCategory(ts, 200, slots)).toBe('Breakfast')
  })

  it('returns Breakfast regardless of calories', () => {
    const ts = '2024-01-15T07:00:00'
    expect(getMealCategory(ts, 50, slots)).toBe('Breakfast')
    expect(getMealCategory(ts, 800, slots)).toBe('Breakfast')
  })

  it('returns Lunch for midday meals with enough calories', () => {
    const ts = '2024-01-15T12:30:00'
    expect(getMealCategory(ts, 500, slots)).toBe('Lunch')
  })

  it('returns Snack for midday meals below calorie threshold', () => {
    const ts = '2024-01-15T12:30:00'
    expect(getMealCategory(ts, 200, slots)).toBe('Snack')
  })

  it('returns Dinner for evening meals with enough calories', () => {
    const ts = '2024-01-15T19:00:00'
    expect(getMealCategory(ts, 600, slots)).toBe('Dinner')
  })

  it('returns Snack for evening meals below calorie threshold', () => {
    const ts = '2024-01-15T19:00:00'
    expect(getMealCategory(ts, 100, slots)).toBe('Snack')
  })

  it('returns Snack for meals outside all time windows', () => {
    const ts = '2024-01-15T15:30:00'
    expect(getMealCategory(ts, 800, slots)).toBe('Snack')
  })
})

describe('getMealTypes', () => {
  it('respects manually assigned mealTypes', () => {
    const meal = {
      timestamp: '2024-01-15T08:00:00',
      mealTypes: ['Drink'],
      analysis: { totals: { calories: 50 } },
    }
    expect(getMealTypes(meal)).toEqual(['Drink'])
  })

  it('falls back to auto-computed category', () => {
    const meal = {
      timestamp: '2024-01-15T08:00:00',
      mealTypes: null,
      analysis: { totals: { calories: 300 } },
    }
    expect(getMealTypes(meal)).toEqual(['Breakfast'])
  })

  it('handles meal with no analysis', () => {
    const meal = {
      timestamp: '2024-01-15T12:00:00',
      mealTypes: null,
      analysis: null,
    }
    // No calories → Snack (below lunch threshold)
    expect(getMealTypes(meal)).toEqual(['Snack'])
  })
})
