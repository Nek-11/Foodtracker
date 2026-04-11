import { SYSTEM_PROMPT, buildUserText, parseAnalysisJSON } from './prompt.js'

const API_URL = 'https://api.openai.com/v1/chat/completions'

export const OPENAI_MODELS = [
  { id: 'o4-mini', label: 'o4-mini', description: 'Fast · Cheap · Recommended' },
  { id: 'o3',      label: 'o3',      description: 'Most capable · Slower' },
]

/**
 * Analyze a meal using the OpenAI API (o-series reasoning models).
 */
export async function analyzeWithOpenAI({ apiKey, model, reasoningEffort, foodImage, labelImage, note }) {
  const userContent = []

  if (foodImage) {
    userContent.push({ type: 'image_url', image_url: { url: foodImage } })
  }

  if (labelImage) {
    userContent.push({
      type: 'text',
      text: 'The following image is the nutrition label for this packaged food. Use its per-serving or per-100g values and only estimate the weight/portion size from the food photo.',
    })
    userContent.push({ type: 'image_url', image_url: { url: labelImage } })
  }

  userContent.push({ type: 'text', text: buildUserText(foodImage, note) })

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'o4-mini',
      reasoning_effort: reasoningEffort || 'medium',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI API error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content
  return parseAnalysisJSON(raw)
}
