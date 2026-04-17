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

function appendHabits(note, settings) {
  const habits = (settings.habits || []).filter(h => h.trim())
  if (habits.length === 0) return note
  const habitsContext = `\n\nUser's recurring habits (ONLY apply a habit if it is clearly relevant to this specific meal — ignore habits that don't match what's being logged):\n${habits.map(h => `- ${h}`).join('\n')}`
  return (note || '') + habitsContext
}

/**
 * Run a single analysis call (Claude or OpenAI).
 */
async function runSingleAnalysis(provider, params) {
  return provider === 'openai'
    ? openai.analyzeMeal(params)
    : claude.analyzeMeal(params)
}

/**
 * Run a single re-analysis call (Claude or OpenAI).
 */
async function runSingleReanalysis(provider, params) {
  return provider === 'openai'
    ? openai.reanalyzeMeal(params)
    : claude.reanalyzeMeal(params)
}

/**
 * Merge multiple analysis results using a lightweight LLM call.
 * Falls back to results[0] if the merge call itself fails.
 */
async function mergeResults(provider, apiKey, model, results, foodImage) {
  if (results.length === 1) return results[0]
  try {
    return provider === 'openai'
      ? await openai.mergeAnalyses({ apiKey, model, results, foodImage })
      : await claude.mergeAnalyses({ apiKey, model, results, foodImage })
  } catch {
    // Merge failed — return first result as safe fallback
    return results[0]
  }
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
    note: appendHabits(note, settings),
  }

  // Run 3 analyses in parallel to reduce randomness
  const settled = await Promise.allSettled([
    runSingleAnalysis(provider, params),
    runSingleAnalysis(provider, params),
    runSingleAnalysis(provider, params),
  ])

  const successful = settled
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  if (successful.length === 0) {
    // All failed — throw the first error
    throw settled[0].reason
  }

  return mergeResults(provider, params.apiKey, params.model, successful, foodImage)
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
    note: appendHabits(note, settings),
    previousAnalysis,
  }

  // Run 3 re-analyses in parallel
  const settled = await Promise.allSettled([
    runSingleReanalysis(provider, params),
    runSingleReanalysis(provider, params),
    runSingleReanalysis(provider, params),
  ])

  const successful = settled
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  if (successful.length === 0) {
    throw settled[0].reason
  }

  return mergeResults(provider, params.apiKey, params.model, successful, foodImage)
}
