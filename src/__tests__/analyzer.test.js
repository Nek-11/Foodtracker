import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveSettings } from '../services/storage.js'

// We test the habit-appending logic by importing the module after setting up settings
describe('analyzer habits context', () => {
  beforeEach(() => {
    // Reset modules between tests so settings are re-read
    vi.resetModules()
  })

  it('appends habits to note when habits exist', async () => {
    saveSettings({
      provider: 'claude',
      claudeApiKey: 'sk-ant-test',
      habits: ['I always add sugar to coffee', 'I cook with olive oil'],
    })

    // Mock fetch to capture what gets sent
    const calls = []
    globalThis.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) })
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify({
            items: [], totals: { calories: 0, proteinG: 0, carbsG: 0, sugarG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 },
            confidence: 'high', flagged: false, questions: [], notes: [], mealSummary: 'Test',
          })}],
        }),
      }
    })

    const { analyzeMeal } = await import('../services/analyzer.js')
    await analyzeMeal({ foodImage: null, labelImage: null, note: 'a cappuccino' })

    expect(calls.length).toBe(1)
    const userMsg = calls[0].body.messages[0].content
    const textContent = userMsg.find(c => c.type === 'text')?.text || ''
    expect(textContent).toContain('I always add sugar to coffee')
    expect(textContent).toContain('I cook with olive oil')
    expect(textContent).toContain('ONLY apply a habit if it is clearly relevant')
  })

  it('does not append habits section when no habits configured', async () => {
    saveSettings({
      provider: 'claude',
      claudeApiKey: 'sk-ant-test',
      habits: [],
    })

    const calls = []
    globalThis.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) })
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify({
            items: [], totals: { calories: 0, proteinG: 0, carbsG: 0, sugarG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 },
            confidence: 'high', flagged: false, questions: [], notes: [], mealSummary: 'Test',
          })}],
        }),
      }
    })

    const { analyzeMeal } = await import('../services/analyzer.js')
    await analyzeMeal({ foodImage: null, labelImage: null, note: 'a sandwich' })

    const textContent = calls[0].body.messages[0].content.find(c => c.type === 'text')?.text || ''
    expect(textContent).not.toContain('recurring habits')
    expect(textContent).not.toContain('Recurring habits')
  })

  it('throws NoApiKeyError when no API key', async () => {
    saveSettings({ provider: 'claude', claudeApiKey: '' })

    const { analyzeMeal, NoApiKeyError } = await import('../services/analyzer.js')
    await expect(analyzeMeal({ foodImage: null, labelImage: null, note: 'test' }))
      .rejects.toThrow(NoApiKeyError)
  })
})
