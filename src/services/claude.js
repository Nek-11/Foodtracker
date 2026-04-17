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
      "name": string,             // specific food name (e.g. "Grilled chicken breast")
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
  "questions": [               // ONLY include if flagged=true, else empty array []
    {
      "text": string,          // a specific question whose answer meaningfully changes the nutrition estimate
      "options": string[]      // 2–5 concrete answer options the user can tap
    }
  ],
  "notes": string[],           // short tips like "Specify the full recipe for more precise results" — not questions
  "mealSummary": string        // 1-line human-readable summary (e.g. "Grilled salmon with rice and salad")
}

Rules:
- Always estimate — never refuse. Approximations are expected and acceptable.
- Use visual cues (plate size, food portions, relative sizes) to estimate weights.
- If a nutrition label image is provided, use its per-100g or per-serving values as ground truth — do not override label values with estimates.
- If a scanned product's nutrition data is provided in the context text, treat those values as ground truth. Estimate the consumed portion size from the image, or use the stated serving size if no image is available.
- Round all numbers to the nearest integer.
- Sodium in mg, everything else in grams or kcal.

Question rules (VERY IMPORTANT):
- Set flagged=true ONLY when a specific unknown would change the calorie or macro estimate by more than ~15%.
- ONLY ask questions where knowing the answer lets you give a significantly better estimate.
- DO NOT ask vague or unanswerable questions like "can you specify the recipe?" or "is this homemade?". Those go in "notes" instead.
- Max 3 questions. Each question MUST have concrete answer options the user can tap.
- Good question examples:
    - Cooking fat: { "text": "How much oil or butter was used?", "options": ["None", "1 tsp", "1 tbsp", "2+ tbsp"] }
    - Sugar: { "text": "Was sugar added, and how much?", "options": ["None", "1 tsp", "1 tbsp", "2+ tbsp"] }
    - Cooking method: { "text": "How was this cooked?", "options": ["Fried", "Baked", "Steamed", "Boiled"] }
    - Ingredient ambiguity: { "text": "What type of rice is this?", "options": ["White rice", "Brown rice", "Jasmine rice"] }
    - Sauce: { "text": "What sauce is on this?", "options": ["Tomato-based", "Cream-based", "Oil-based", "No sauce"] }
    - Portion: { "text": "How heavy was the meat portion approximately?", "options": ["100g", "150g", "200g", "250g+"] }
- Use metric units (grams, ml) except for teaspoon (tsp) and tablespoon (tbsp) which are fine.
- Do NOT use cups, ounces, or other imperial units.
- For simple drinks (coffee, tea, juice, smoothie), only flag if significant additives are unknown.
- Use "notes" for tips that don't require a tap-answer, e.g. "Specify the full recipe for more precise calorie estimates."`

export const MERGE_SYSTEM_PROMPT = `You are merging multiple food nutrition analysis results into one. Return valid JSON ONLY — no markdown, no explanation.

Anchor rules (read first):
- All runs analyzed the SAME photo. Expect the same underlying items in each run, possibly under different names.
- The food image is attached. Use it as ground truth to decide how many distinct items are actually present and to resolve naming disagreements.
- Your output's item count should match the median item count across the runs (±1). If you are about to emit more items than that, you are almost certainly double-counting — merge the overlapping ones.

Matching rules:
- Identify the same food items across runs semantically (e.g. "steak", "entrecôte", "meat" are the same item; "chocolate bar" and "snack wrapped in chocolate" are the same item).
- Treat two candidate items as the SAME item when any of these holds: they plausibly describe the same food visible in the photo, their macro totals are within ~30% of each other, or one name is a generic label (e.g. "snack", "bar", "piece") for a more specific name in another run.
- When merging, use the most specific / descriptive name among the matched items.

Averaging rules:
- For matched items: average each numeric field across the runs that identified that item, then round to the nearest integer.
- For items found in only one run: include them ONLY if the photo actually shows a distinct food that the other runs missed; otherwise drop them as noise.
- For "questions": use the set from whichever run has the most questions; if tied use run 1's questions.
- For "flagged": match the chosen questions-run's flagged value.
- For "confidence": use the most conservative (lowest) value across all runs (low < medium < high).
- For "mealSummary", "notes": use run 1's values.
- "totals": recompute by summing all merged items' macros (round each to integer).

Return the same JSON schema: { items, totals, confidence, flagged, questions, notes, mealSummary }`

function buildContent(foodImage, labelImage, note) {
  if (!foodImage && !labelImage && !note?.trim()) {
    throw new Error('Provide at least a food image, a nutrition label, or a meal description.')
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
      text: 'The following image is the nutrition label for this food. Use the per-serving or per-100g values from this label as ground truth — they override any visual estimates.',
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

  content.push({ type: 'text', text: userText })
  return content
}

async function callClaude({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, content, useThinking = true }) {
  const cfg = THINKING_CONFIG[reasoningEffort] ?? THINKING_CONFIG.medium
  const budget_tokens = budgetTokens ?? cfg.budget_tokens
  const max_tokens    = maxTokens    ?? cfg.max_tokens

  const body = {
    model,
    max_tokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  }

  if (useThinking) {
    body.thinking = { type: 'enabled', budget_tokens }
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify(body),
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

  const content = buildContent(foodImage, labelImage, clarificationNote)
  return callClaude({ apiKey, model, reasoningEffort, budgetTokens, maxTokens, content })
}

export async function mergeAnalyses({ apiKey, model, results, foodImage }) {
  const numbered = results
    .map((r, i) => `Run ${i + 1}: ${JSON.stringify(r)}`)
    .join('\n\n')

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

  content.push({
    type: 'text',
    text: `Here are ${results.length} food analysis results to merge:\n\n${numbered}\n\nMerge these into one result following the rules in your instructions.`,
  })

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
      max_tokens: 4000,
      system: MERGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude merge error ${response.status}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find(b => b.type === 'text')
  const raw = textBlock?.text?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // Merge failed — fall back to first result
    return results[0]
  }
}
