import { getSettings } from './storage.js'
import * as claude from './claude.js'
import * as openai from './openai.js'

// Hardcoded models — edit here to change, no UI toggle needed
const CLAUDE_MODEL  = 'claude-sonnet-4-6'
const OPENAI_MODEL  = 'gpt-4o-mini'
const REASONING_EFFORT = 'medium'

// Claude extended thinking budget for "medium" effort
const CLAUDE_BUDGET_TOKENS = 5000
const CLAUDE_MAX_TOKENS    = 12000

/** Thrown when no API key is configured — pending data is preserved so user can retry. */
export class NoApiKeyError extends Error {
  constructor() {
    super('No API key configured')
    this.name = 'NoApiKeyError'
  }
}

function resolveParams(settings) {
  const provider = settings.provider || 'claude'
  const apiKey = provider === 'openai' ? settings.openaiApiKey : settings.claudeApiKey
  return { provider, apiKey }
}

export async function analyzeMeal({ foodImage, labelImage, note }) {
  const settings = getSettings()
  const { provider, apiKey } = resolveParams(settings)

  if (!apiKey?.trim()) throw new NoApiKeyError()

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

  if (!apiKey?.trim()) throw new NoApiKeyError()

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
