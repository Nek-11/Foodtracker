import { getSettings } from './storage.js'
import * as claude from './claude.js'
import * as openai from './openai.js'

// Hardcoded models — edit here to change, no UI toggle needed
const CLAUDE_MODEL  = 'claude-sonnet-4-6'
const OPENAI_MODEL  = 'gpt-5-mini'
const REASONING_EFFORT = 'medium'

// Claude extended thinking budget for "medium" effort
const CLAUDE_BUDGET_TOKENS = 5000
const CLAUDE_MAX_TOKENS    = 12000

const MOCK_ANALYSIS = {
  items: [
    { name: 'Grilled chicken breast', estimatedWeightG: 150, calories: 248, proteinG: 46, carbsG: 0,  sugarG: 0, fatG: 5,  fiberG: 0, sodiumMg: 370 },
    { name: 'Brown rice',             estimatedWeightG: 180, calories: 216, proteinG: 5,  carbsG: 45, sugarG: 1, fatG: 2,  fiberG: 4, sodiumMg: 10  },
    { name: 'Steamed broccoli',       estimatedWeightG: 100, calories: 35,  proteinG: 3,  carbsG: 7,  sugarG: 2, fatG: 0,  fiberG: 3, sodiumMg: 30  },
  ],
  totals: { calories: 499, proteinG: 54, carbsG: 52, sugarG: 3, fatG: 7, fiberG: 7, sodiumMg: 410 },
  confidence: 'low',
  flagged: false,
  questions: [],
  mealSummary: 'Demo data — add an API key in Settings to analyze real meals',
  _isMock: true,
}

function resolveParams(settings) {
  const provider = settings.provider || 'claude'
  const apiKey = provider === 'openai' ? settings.openaiApiKey : settings.claudeApiKey
  return { provider, apiKey }
}

export async function analyzeMeal({ foodImage, labelImage, note }) {
  const settings = getSettings()
  const { provider, apiKey } = resolveParams(settings)

  if (!apiKey?.trim()) return { ...MOCK_ANALYSIS }

  const params = {
    apiKey: apiKey.trim(),
    model: provider === 'openai' ? OPENAI_MODEL : CLAUDE_MODEL,
    reasoningEffort: REASONING_EFFORT,
    budgetTokens: CLAUDE_BUDGET_TOKENS,
    maxTokens: CLAUDE_MAX_TOKENS,
    foodImage,
    labelImage,
    note,
  }

  return provider === 'openai'
    ? openai.analyzeMeal(params)
    : claude.analyzeMeal(params)
}

export async function reanalyzeMeal({ foodImage, labelImage, note, previousAnalysis }) {
  const settings = getSettings()
  const { provider, apiKey } = resolveParams(settings)

  if (!apiKey?.trim()) return { ...MOCK_ANALYSIS }

  const params = {
    apiKey: apiKey.trim(),
    model: provider === 'openai' ? OPENAI_MODEL : CLAUDE_MODEL,
    reasoningEffort: REASONING_EFFORT,
    budgetTokens: CLAUDE_BUDGET_TOKENS,
    maxTokens: CLAUDE_MAX_TOKENS,
    foodImage,
    labelImage,
    note,
    previousAnalysis,
  }

  return provider === 'openai'
    ? openai.reanalyzeMeal(params)
    : claude.reanalyzeMeal(params)
}
