import { dataUrlToBase64, dataUrlToMediaType } from '../utils/imageUtils.js'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are a precise nutrition analysis assistant. Your job is to analyze food images and/or text descriptions and return structured nutrition estimates.

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

/**
 * Analyze a meal using the Claude API.
 *
 * @param {object} params
 * @param {string} params.apiKey         - Anthropic API key
 * @param {string|null} params.foodImage  - base64 data URL of the food photo (or null)
 * @param {string|null} params.labelImage - base64 data URL of nutrition label (or null)
 * @param {string} params.note           - text/voice note describing the meal
 * @returns {Promise<object>} parsed analysis object
 */
export async function analyzeMeal({ apiKey, foodImage, labelImage, note }) {
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

  // Build the user text
  let userText = ''
  if (foodImage && !note) {
    userText = 'Please analyze the food in this image and return the nutrition breakdown as JSON.'
  } else if (foodImage && note) {
    userText = `Please analyze the food in this image. Additional context: "${note}". Return the nutrition breakdown as JSON.`
  } else if (!foodImage && note) {
    userText = `I have no photo. Here is my meal description: "${note}". Based on typical portion sizes, return a nutrition breakdown as JSON.`
  } else {
    throw new Error('Provide at least a food image or a meal description.')
  }

  content.push({ type: 'text', text: userText })

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `API error ${response.status}`
    throw new Error(msg)
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text?.trim()

  // Strip markdown code fences if model wrapped response anyway
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Claude returned an unexpected response format. Please try again.')
  }

  return parsed
}

/**
 * Re-analyze a meal with a follow-up clarification note.
 * Sends the original analysis summary + user's clarification.
 */
export async function reanalyzeMeal({ apiKey, foodImage, labelImage, note, previousAnalysis }) {
  const clarificationNote = `
Previously estimated: ${previousAnalysis.mealSummary}
Flagged questions were: ${previousAnalysis.questions.join('; ')}
User clarification: "${note}"

Please re-analyze with this additional information and return updated JSON.`.trim()

  return analyzeMeal({ apiKey, foodImage, labelImage, note: clarificationNote })
}
