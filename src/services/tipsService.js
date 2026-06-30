import { getSettings, getMealsByDate, getLast7DaysTotals, getGoals, getTips, saveTips, getTodayKey } from './storage.js'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const CLAUDE_MODEL   = 'claude-sonnet-4-6'
const OPENAI_MODEL   = 'gpt-5-mini'

const TIPS_SYSTEM_PROMPT = `You are a nutrition coach analyzing a food diary. Return valid JSON ONLY — no markdown, no explanation outside the JSON.

Schema:
{
  "daily": [
    {
      "type": "ADD" | "REMOVE" | "REPLACE",
      "macro": "calories" | "protein" | "carbs" | "fat" | "sugar" | "fiber" | "sodium",
      "text": string
    }
  ],
  "weeklyInsight": string | null
}

Rules:
- Generate tips ONLY for macros that diverged more than 15% from the daily goal
- "ADD" = below goal, suggest adding something specific; "REMOVE" = over goal, suggest cutting something; "REPLACE" = suggest swapping an ingredient for a better option
- Reference the specific foods the person actually ate — be concrete (e.g. "add a scoop of protein powder to your oats" not "eat more protein")
- Prioritise the 2–3 macros with the largest divergence; 4 tips max total
- If all macros are within 15% of goal, return daily: []
- weeklyInsight: if the 7-day pattern shows a consistent habit across ≥4 of the last 7 days that works against the user's goals, give one specific, actionable sentence; otherwise null
- Keep each tip text concise: 1–2 sentences`

export function getYesterdayKey() {
  const { resetHour = 2 } = getSettings()
  const todayKey = getTodayKey(resetHour)
  // Parse today's key and subtract one day
  const d = new Date(todayKey + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveParams(settings) {
  const provider = settings.provider || 'claude'
  const apiKey = provider === 'openai' ? settings.openaiApiKey : settings.claudeApiKey
  return { provider, apiKey }
}

function buildUserMessage(yesterdayKey, meals, goals, weekHistory) {
  const mealsText = meals.map(m => {
    const summary = m.analysis.mealSummary || m.note || 'Meal'
    const t = m.analysis.totals
    const items = (m.analysis.items || [])
      .map(i => `    • ${i.name} (~${i.estimatedWeightG || '?'}g): ${i.calories}kcal, ${i.proteinG}g protein`)
      .join('\n')
    return `- ${summary}: ${Math.round(t.calories)}kcal, ${Math.round(t.proteinG)}g protein, ${Math.round(t.carbsG)}g carbs, ${Math.round(t.fatG)}g fat, ${Math.round(t.sugarG)}g sugar\n${items}`
  }).join('\n\n')

  const totals = meals.reduce((acc, m) => {
    const t = m.analysis.totals
    acc.calories += t.calories || 0
    acc.proteinG += t.proteinG || 0
    acc.carbsG   += t.carbsG   || 0
    acc.fatG     += t.fatG     || 0
    acc.sugarG   += t.sugarG   || 0
    acc.fiberG   += t.fiberG   || 0
    acc.sodiumMg += t.sodiumMg || 0
    return acc
  }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 })

  const r = Math.round
  const totalsLine = `${r(totals.calories)} kcal | ${r(totals.proteinG)}g protein | ${r(totals.carbsG)}g carbs | ${r(totals.fatG)}g fat | ${r(totals.sugarG)}g sugar | ${r(totals.fiberG)}g fiber | ${r(totals.sodiumMg)}mg sodium`
  const goalsLine  = `${goals.calories} kcal | ${goals.proteinG}g protein | ${goals.carbsG}g carbs | ${goals.fatG}g fat | ${goals.sugarG}g sugar | ${goals.fiberG}g fiber | ${goals.sodiumMg}mg sodium`

  let msg = `Yesterday (${yesterdayKey}) meals:\n${mealsText}\n\nDaily totals: ${totalsLine}\nGoals:        ${goalsLine}`

  if (weekHistory) {
    const validDays = weekHistory.filter(d => !d.excluded && d.totals.calories > 100)
    if (validDays.length >= 4) {
      const weekText = validDays
        .map(d => `- ${d.date}: ${r(d.totals.calories)}kcal, ${r(d.totals.proteinG)}g protein, ${r(d.totals.sugarG)}g sugar, ${r(d.totals.sodiumMg)}mg sodium`)
        .join('\n')
      msg += `\n\nLast 7 days (for pattern detection):\n${weekText}`
    }
  }

  return msg
}

async function callClaude(apiKey, userMessage) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: TIPS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error ${response.status}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find(b => b.type === 'text')
  const raw = textBlock?.text?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(cleaned)
}

async function callOpenAI(apiKey, userMessage) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: TIPS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI API error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(cleaned)
}

let _generating = false

export async function generateTips() {
  if (_generating) return null

  const settings = getSettings()
  const yesterdayKey = getYesterdayKey()

  if (getTips(yesterdayKey)) return getTips(yesterdayKey)

  const meals = getMealsByDate(yesterdayKey).filter(m => m.analysis)
  if (meals.length === 0) return null

  const { provider, apiKey } = resolveParams(settings)
  if (!apiKey?.trim()) return null

  _generating = true
  try {
    const goals       = getGoals()
    const weekHistory = getLast7DaysTotals()
    const userMessage = buildUserMessage(yesterdayKey, meals, goals, weekHistory)

    const result = provider === 'openai'
      ? await callOpenAI(apiKey.trim(), userMessage)
      : await callClaude(apiKey.trim(), userMessage)

    saveTips(yesterdayKey, result)
    return result
  } finally {
    _generating = false
  }
}
