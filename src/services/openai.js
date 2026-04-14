import { SYSTEM_PROMPT, MERGE_SYSTEM_PROMPT } from './claude.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function buildMessages(foodImage, labelImage, note) {
  if (!foodImage && !labelImage && !note?.trim()) {
    throw new Error('Provide at least a food image, a nutrition label, or a meal description.')
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
      text: 'The following image is the nutrition label for this food. Use the per-serving or per-100g values from this label as ground truth — they override any visual estimates.',
    })
    userContent.push({
      type: 'image_url',
      image_url: { url: labelImage },
    })
  }

  let userText
  if (foodImage && labelImage && note) {
    userText = `Please analyze the food. The label above has the exact nutrition values — use them. Additional context: "${note}". Return the nutrition breakdown as JSON.`
  } else if (foodImage && labelImage) {
    userText = 'Please analyze the food using the nutrition label values above. Estimate the portion size from the food image. Return the nutrition breakdown as JSON.'
  } else if (foodImage && note) {
    userText = `Please analyze the food in this image. Additional context: "${note}". Return the nutrition breakdown as JSON.`
  } else if (foodImage) {
    userText = 'Please analyze the food in this image and return the nutrition breakdown as JSON.'
  } else if (labelImage && note) {
    userText = `I have a nutrition label but no food photo. Additional context: "${note}". Use the label values and estimate a typical portion size. Return the nutrition breakdown as JSON.`
  } else if (labelImage) {
    userText = 'I have a nutrition label but no food photo. Use the label values and estimate a typical serving size. Return the nutrition breakdown as JSON.'
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
      // reasoning_effort is only supported by o-series models (o1, o3, o4-mini, etc.)
      ...(model.startsWith('o') ? { reasoning_effort: reasoningEffort } : {}),
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
  const prevItems = (previousAnalysis.items || [])
    .map(i => `  - ${i.name}: ${i.calories} kcal, ${i.proteinG}g protein, ${i.carbsG}g carbs, ${i.fatG}g fat`)
    .join('\n')

  const prevQuestions = (previousAnalysis.questions || [])
    .map(q => (typeof q === 'string' ? q : q.text))
    .filter(Boolean)
    .join('; ')

  const clarificationNote = `Re-analysis request.

Previous estimate: ${previousAnalysis.mealSummary || '(unknown)'}
Previously identified items:
${prevItems || '  (none recorded)'}
${prevQuestions ? `\nPrevious flagged questions: ${prevQuestions}` : ''}

User's additional context / corrections: "${note}"

Please re-analyze incorporating this new information and return updated JSON.`

  const messages = buildMessages(foodImage, labelImage, clarificationNote)
  return callOpenAI({ apiKey, model, reasoningEffort, messages })
}

export async function mergeAnalyses({ apiKey, model, results }) {
  const numbered = results
    .map((r, i) => `Run ${i + 1}: ${JSON.stringify(r)}`)
    .join('\n\n')

  const messages = [
    { role: 'system', content: MERGE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Here are ${results.length} food analysis results to merge:\n\n${numbered}\n\nMerge these into one result following the rules in your instructions.`,
    },
  ]

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI merge error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // Merge failed — fall back to first result
    return results[0]
  }
}
