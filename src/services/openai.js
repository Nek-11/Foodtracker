import { SYSTEM_PROMPT } from './claude.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function buildMessages(foodImage, labelImage, note) {
  if (!foodImage && !note?.trim()) {
    throw new Error('Provide at least a food image or a meal description.')
  }

  const userContent = []

  if (foodImage) {
    // foodImage is already a full data URL (e.g. "data:image/jpeg;base64,...")
    userContent.push({
      type: 'image_url',
      image_url: { url: foodImage },
    })
  }

  if (labelImage) {
    userContent.push({
      type: 'text',
      text: 'The following image is the nutrition label for this packaged food. Use the per-serving or per-100g values from this label and only estimate the weight/portion size from the food image.',
    })
    userContent.push({
      type: 'image_url',
      image_url: { url: labelImage },
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

  userContent.push({ type: 'text', text: userText })

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}

async function callOpenAI({ apiKey, model, reasoningEffort, messages }) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      reasoning_effort: reasoningEffort,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI API error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''

  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('OpenAI returned an unexpected response format. Please try again.')
  }
}

export async function analyzeMeal({ apiKey, model, reasoningEffort, foodImage, labelImage, note }) {
  const messages = buildMessages(foodImage, labelImage, note)
  return callOpenAI({ apiKey, model, reasoningEffort, messages })
}

export async function reanalyzeMeal({ apiKey, model, reasoningEffort, foodImage, labelImage, note, previousAnalysis }) {
  const clarificationNote = `Previously estimated: ${previousAnalysis.mealSummary}
Flagged questions were: ${previousAnalysis.questions.join('; ')}
User clarification: "${note}"

Please re-analyze with this additional information and return updated JSON.`

  const messages = buildMessages(foodImage, labelImage, clarificationNote)
  return callOpenAI({ apiKey, model, reasoningEffort, messages })
}
