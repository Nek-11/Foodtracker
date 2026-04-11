import { getSettings } from './storage.js'
import { analyzeWithClaude } from './claude.js'
import { analyzeWithOpenAI } from './openai.js'

/**
 * Returns true when no API key is configured — app runs in demo mode.
 */
export function isDemoMode() {
  const s = getSettings()
  return !s.claudeApiKey && !s.openaiApiKey
}

/**
 * Unified meal analyzer — routes to the active provider,
 * or returns demo data when no API key is set.
 */
export async function analyzeMeal({ foodImage, labelImage, note }) {
  const settings = getSettings()

  if (isDemoMode()) {
    return getDemoAnalysis()
  }

  const effort = settings.reasoningEffort || 'medium'

  if (settings.provider === 'openai' && settings.openaiApiKey) {
    return analyzeWithOpenAI({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel || 'o4-mini',
      reasoningEffort: effort,
      foodImage,
      labelImage,
      note,
    })
  }

  // Default: Claude
  return analyzeWithClaude({
    apiKey: settings.claudeApiKey,
    model: settings.claudeModel || 'claude-sonnet-4-6',
    reasoningEffort: effort,
    foodImage,
    labelImage,
    note,
  })
}

/**
 * Re-analyze a flagged meal after the user provides a clarification.
 */
export async function reanalyzeMeal({ foodImage, labelImage, note, previousAnalysis }) {
  const clarificationNote = [
    `Previously estimated: ${previousAnalysis.mealSummary}`,
    `Flagged questions were: ${previousAnalysis.questions.join('; ')}`,
    `User clarification: "${note}"`,
    'Please re-analyze with this additional information and return updated JSON.',
  ].join('\n')

  return analyzeMeal({ foodImage, labelImage, note: clarificationNote })
}

function getDemoAnalysis() {
  return {
    items: [
      { name: 'Grilled Chicken Breast (demo)',   estimatedWeightG: 150, calories: 248, proteinG: 46, carbsG:  0, sugarG: 0, fatG:  6, fiberG: 0, sodiumMg:  74 },
      { name: 'Brown Rice (demo)',               estimatedWeightG: 120, calories: 144, proteinG:  3, carbsG: 30, sugarG: 0, fatG:  1, fiberG: 2, sodiumMg:   2 },
      { name: 'Mixed Greens Salad (demo)',       estimatedWeightG:  80, calories:  24, proteinG:  2, carbsG:  4, sugarG: 2, fatG:  0, fiberG: 2, sodiumMg:  10 },
    ],
    totals: { calories: 416, proteinG: 51, carbsG: 34, sugarG: 2, fatG: 7, fiberG: 4, sodiumMg: 86 },
    confidence: 'low',
    flagged: true,
    questions: ['This is demo mode — add your API key in Settings to get real AI analysis.'],
    mealSummary: 'Demo mode (no API key configured)',
  }
}
