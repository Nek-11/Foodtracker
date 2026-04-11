import { dataUrlToBase64, dataUrlToMediaType } from '../utils/imageUtils.js'
import { SYSTEM_PROMPT, buildUserText, parseAnalysisJSON } from './prompt.js'

const API_URL = 'https://api.anthropic.com/v1/messages'

// Extended thinking budget in tokens per effort level
const THINKING_BUDGET = { low: 2000, medium: 8000, high: 16000 }

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Fast · Recommended' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6',   description: 'Most capable · Slower' },
]

/**
 * Analyze a meal using the Claude API with extended thinking.
 */
export async function analyzeWithClaude({ apiKey, model, reasoningEffort, foodImage, labelImage, note }) {
  const content = []

  if (foodImage) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: dataUrlToMediaType(foodImage), data: dataUrlToBase64(foodImage) },
    })
  }

  if (labelImage) {
    content.push({
      type: 'text',
      text: 'The following image is the nutrition label for this packaged food. Use its per-serving or per-100g values and only estimate the weight/portion size from the food photo.',
    })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: dataUrlToMediaType(labelImage), data: dataUrlToBase64(labelImage) },
    })
  }

  content.push({ type: 'text', text: buildUserText(foodImage, note) })

  const budget = THINKING_BUDGET[reasoningEffort] ?? THINKING_BUDGET.medium

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: budget + 4096,
      thinking: { type: 'enabled', budget_tokens: budget },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error ${response.status}`)
  }

  const data = await response.json()
  // Extended thinking returns multiple blocks; find the text block (not the thinking block)
  const textBlock = data.content?.find(b => b.type === 'text')
  return parseAnalysisJSON(textBlock?.text)
}
