import { dataUrlToBase64, dataUrlToMediaType } from '../utils/imageUtils.js'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

// thinking budget → (budget_tokens, max_tokens)
// max_tokens must exceed budget_tokens
const THINKING_CONFIG = {
  low:    { budget_tokens: 1024,  max_tokens: 5000  },
  medium: { budget_tokens: 5000,  max_tokens: 12000 },
  high:   { budget_tokens: 10000, max_tokens: 18000 },
}

export const SYSTEM_PROMPT = `You are a precise nutrition analysis assistant. Your job is to analyze food images and/or text descriptions and return structured nutrition estimates.

CRITICAL: You MUST always return valid JSON matching the exact schema below — nothing else, no markdown, no explanation outside the JSON.

Schema:
{
  "items": [
    {
      "name": string,           // specific food name (e.g. "Grilled chicken breast")
      "estimatedWeightG": number, // estimated weight in grams
      "calories": number,
      "proteinG": number,
      "carbsG": number,
      "sugarG": number,
      "fatG": number,
      "fiberG": number,
      "sodiumMg": number
    }
  ],
  "totals": {
    "calories": number,
    "proteinG": number,
    "carbsG": number,
    "sugarG": number,
    "fatG": number,
    "fiberG": number,
    "sodiumMg": number
  },
  "confidence": "high" | "medium" | "low",
  "flagged": boolean,
  "questions": string[],  // list uncertainty questions if flagged is true, else empty array
  "mealSummary": string   // 1-line human-readable summary (e.g. "Grilled salmon with rice and salad")
}

Rules:
- Always estimate — never refuse. Approximations are expected and acceptable.
- Use visual cues (plate size, food portions, relative sizes) to estimate weights.
- If a nutrition label image is provided, use its values per 100g and only estimate the weight.
- Set flagged=true and add specific questions when: cooking method matters (fried vs baked), you can't distinguish similar ingredients (brown vs white rice), or a key sauce/dressing might significantly change macros.
- For voice/text descriptions with no image: estimate based on typical serving sizes for the described items.
- Round all numbers to the nearest integer.
- Sodium in mg, everything else in grams or kcal.`

function buildContent(foodImage, labelImage, note) {
  if (!foodImage && !note?.trim()) {
    throw new Error('Provide at least a food image or a meal description.')
  }

  const content = []

  if (foodImage) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrlToMediaType(foodImage),
        data: dataUrlToBase64(foodImage),
      },
    })
  }

  if (labelImage) {
    content.push({
      type: 'text',
      text: 'The following image is the nutrition label for this packaged food. Use the per-serving or per-100g values from this label and only estimate the weight/portion size from the food image.',
    })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrlToMediaType(labelImage),
        data: dataUrlToBase64(labelImage),
      },
    })
  }

  let userText
  if (foodImage && !note) {
    userText = 'Please analyze the food in this image and return the nutrition breakdown as JSON.'
  } else if (foodImage && note) {
    userText = `Please analyze the food in this image. Additional context: "${note}". Return the nutrition breakdown as JSON.`
  } else {
    userText = `I have no photo. Here is my meal description: "${note}". Based on typical portion sizes, return a nutrition breakdown as JSON.`
  }

  content.push({ type: 'text', text: userText })
  return content
}

async function callClaude({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, content }) {
  const cfg = THINKING_CONFIG[reasoningEffort] ?? THINKING_CONFIG.medium
  const budget_tokens = budgetTokens ?? cfg.budget_tokens
  const max_tokens    = maxTokens    ?? cfg.max_tokens

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      thinking: { type: 'enabled', budget_tokens },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error ${response.status}`)
  }

  const data = await response.json()
  // With thinking enabled, content blocks include a 'thinking' block and a 'text' block
  const textBlock = data.content?.find(b => b.type === 'text')
  const raw = textBlock?.text?.trim() ?? ''

  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('Claude returned an unexpected response format. Please try again.')
  }
}

export async function analyzeMeal({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, foodImage, labelImage, note }) {
  const content = buildContent(foodImage, labelImage, note)
  return callClaude({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, content })
}

export async function reanalyzeMeal({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, foodImage, labelImage, note, previousAnalysis }) {
  const clarificationNote = `Previously estimated: ${previousAnalysis.mealSummary}
Flagged questions were: ${previousAnalysis.questions.join('; ')}
User clarification: "${note}"

Please re-analyze with this additional information and return updated JSON.`

  const content = buildContent(foodImage, labelImage, clarificationNote)
  return callClaude({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, content })
}
