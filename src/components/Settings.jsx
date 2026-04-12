import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Download, Upload, Clock } from 'lucide-react'
import {
  getSettings, saveSettings,
  getGoals,    saveGoals,
  exportHistory, importHistory,
} from '../services/storage.js'
import { MEAL_CALORIE_THRESHOLD, DEFAULT_MEAL_SLOTS } from '../utils/nutritionUtils.js'

const GOAL_FIELDS = [
  { key: 'calories',  label: 'Calories', unit: 'kcal', min: 1000, max: 5000, step: 50  },
  { key: 'proteinG',  label: 'Protein',  unit: 'g',    min: 50,   max: 400,  step: 5   },
  { key: 'carbsG',    label: 'Carbs',    unit: 'g',    min: 50,   max: 600,  step: 5   },
  { key: 'fatG',      label: 'Fat',      unit: 'g',    min: 20,   max: 250,  step: 5   },
  { key: 'sugarG',    label: 'Sugar',    unit: 'g',    min: 10,   max: 200,  step: 5   },
  { key: 'fiberG',    label: 'Fiber',    unit: 'g',    min: 10,   max: 80,   step: 1   },
  { key: 'sodiumMg',  label: 'Sodium',   unit: 'mg',   min: 500,  max: 5000, step: 100 },
]

const RESET_HOURS = [0,1,2,3,4,5,6]

function formatResetHour(h) {
  if (h === 0) return 'Midnight'
  return `${h}:00 AM`
}

const MEAL_SLOT_LABELS = [
  { key: 'breakfast', label: 'Breakfast', hint: 'any calories' },
  { key: 'lunch',     label: 'Lunch',     hint: `≥${MEAL_CALORIE_THRESHOLD} kcal` },
  { key: 'dinner',    label: 'Dinner',    hint: `≥${MEAL_CALORIE_THRESHOLD} kcal` },
]

export default function Settings({ onRefresh }) {
  const [provider,       setProvider]       = useState('claude')
  const [claudeKey,      setClaudeKey]      = useState('')
  const [openaiKey,      setOpenaiKey]      = useState('')
  const [showClaude,     setShowClaude]     = useState(false)
  const [showOpenai,     setShowOpenai]     = useState(false)
  const [resetHour,      setResetHour]      = useState(2)
  const [mealTimeSlots,  setMealTimeSlots]  = useState(DEFAULT_MEAL_SLOTS)
  const [goals,          setGoals]          = useState({})
  const [saved,          setSaved]          = useState(false)
  const [importStatus,   setImportStatus]   = useState(null)
  const importRef = useRef(null)

  useEffect(() => {
    const s = getSettings()
    setProvider(s.provider || 'claude')
    setClaudeKey(s.claudeApiKey || '')
    setOpenaiKey(s.openaiApiKey || '')
    setResetHour(s.resetHour ?? 2)
    setMealTimeSlots({ ...DEFAULT_MEAL_SLOTS, ...s.mealTimeSlots })
    setGoals(getGoals())
  }, [])

  function updateSlot(meal, field, value) {
    setMealTimeSlots(prev => ({
      ...prev,
      [meal]: { ...prev[meal], [field]: value },
    }))
  }

  function handleSave() {
    saveSettings({
      provider,
      claudeApiKey:  claudeKey.trim(),
      openaiApiKey:  openaiKey.trim(),
      resetHour,
      mealTimeSlots,
    })
    saveGoals(goals)
    setSaved(true)
    if (onRefresh) onRefresh()
    setTimeout(() => setSaved(false), 2000)
  }

  function updateGoal(key, value) {
    setGoals(g => ({ ...g, [key]: Number(value) }))
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportStatus('loading')
    try {
      const count = await importHistory(file)
      setImportStatus(`Imported ${count} meals`)
      if (onRefresh) onRefresh()
      // Reload settings from storage in case they were restored from the export
      const s = getSettings()
      setProvider(s.provider || 'claude')
      setClaudeKey(s.claudeApiKey || '')
      setOpenaiKey(s.openaiApiKey || '')
      setResetHour(s.resetHour ?? 2)
      setMealTimeSlots({ ...DEFAULT_MEAL_SLOTS, ...s.mealTimeSlots })
      setGoals(getGoals())
    } catch (err) {
      setImportStatus(err.message)
    }
    setTimeout(() => setImportStatus(null), 3000)
  }

  const card  = 'mx-4 mt-4 rounded-2xl p-4 bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800'
  const label = 'text-xs font-semibold uppercase tracking-wider text-cream-500 dark:text-pine-400 mb-3 block'
  const input = 'w-full rounded-xl px-4 py-3 text-sm font-mono bg-cream-200 dark:bg-pine-800 border border-cream-300 dark:border-pine-700 text-pine-900 dark:text-cream-100 placeholder-cream-400 dark:placeholder-pine-500 outline-none focus:ring-2 focus:ring-pine-400'
  const timeInput = 'rounded-lg px-2 py-1.5 text-sm bg-cream-200 dark:bg-pine-800 border border-cream-300 dark:border-pine-700 text-pine-900 dark:text-cream-100 outline-none focus:ring-2 focus:ring-pine-400'

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">

      <div className="px-4 pb-2 pt-safe">
        <h1 className="font-display text-2xl font-bold text-pine-900 dark:text-cream-100">Settings</h1>
      </div>

      {/* AI Provider */}
      <section className={card}>
        <span className={label}>AI Provider</span>
        <div className="flex gap-2 mb-4">
          {[['claude', 'Claude'], ['openai', 'OpenAI']].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setProvider(id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                provider === id
                  ? 'bg-pine-500 text-white dark:bg-pine-400 dark:text-pine-950'
                  : 'bg-cream-200 dark:bg-pine-800 text-cream-600 dark:text-pine-300 hover:bg-cream-300 dark:hover:bg-pine-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <p className="text-xs text-cream-500 dark:text-pine-400 mb-2">
          Claude key — <span className="text-pine-500 dark:text-pine-300">console.anthropic.com</span>
        </p>
        <div className="relative mb-2">
          <input type={showClaude ? 'text' : 'password'} value={claudeKey}
            onChange={e => setClaudeKey(e.target.value)} placeholder="sk-ant-..."
            className={input + ' pr-11'} />
          <button type="button" onClick={() => setShowClaude(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 dark:text-pine-500 hover:text-pine-500 dark:hover:text-pine-300">
            {showClaude ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {claudeKey && (
          <p className={`text-xs mb-3 ${claudeKey.startsWith('sk-ant-') ? 'text-pine-500 dark:text-pine-300' : 'text-amber-600 dark:text-amber-400'}`}>
            {claudeKey.startsWith('sk-ant-') ? 'Key looks valid' : 'Double-check key format'}
          </p>
        )}

        <p className="text-xs text-cream-500 dark:text-pine-400 mb-2">
          OpenAI key — <span className="text-pine-500 dark:text-pine-300">platform.openai.com</span>
        </p>
        <div className="relative">
          <input type={showOpenai ? 'text' : 'password'} value={openaiKey}
            onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..."
            className={input + ' pr-11'} />
          <button type="button" onClick={() => setShowOpenai(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 dark:text-pine-500 hover:text-pine-500 dark:hover:text-pine-300">
            {showOpenai ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {openaiKey && (
          <p className={`text-xs mt-2 ${openaiKey.startsWith('sk-') ? 'text-pine-500 dark:text-pine-300' : 'text-amber-600 dark:text-amber-400'}`}>
            {openaiKey.startsWith('sk-') ? 'Key looks valid · also used for Whisper voice transcription' : 'Double-check key format'}
          </p>
        )}
      </section>

      {/* Meal time windows */}
      <section className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={14} className="text-pine-400" />
          <span className={label.replace('mb-3', 'mb-0')}>Meal Time Windows</span>
        </div>
        <p className="text-xs text-cream-500 dark:text-pine-400 mb-4">
          Meals outside these windows count as Snacks. Lunch &amp; Dinner also need {MEAL_CALORIE_THRESHOLD}+ kcal.
        </p>
        <div className="space-y-3">
          {MEAL_SLOT_LABELS.map(({ key, label: lbl, hint }) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-24 flex-shrink-0">
                <p className="text-sm font-medium text-pine-800 dark:text-cream-200">{lbl}</p>
                <p className="text-[10px] text-cream-400 dark:text-pine-500">{hint}</p>
              </div>
              <input
                type="time"
                value={mealTimeSlots[key]?.start ?? DEFAULT_MEAL_SLOTS[key].start}
                onChange={e => updateSlot(key, 'start', e.target.value)}
                className={timeInput}
              />
              <span className="text-xs text-cream-400 dark:text-pine-500 flex-shrink-0">to</span>
              <input
                type="time"
                value={mealTimeSlots[key]?.end ?? DEFAULT_MEAL_SLOTS[key].end}
                onChange={e => updateSlot(key, 'end', e.target.value)}
                className={timeInput}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Day reset hour */}
      <section className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-pine-400" />
          <span className={label.replace('mb-3', 'mb-0')}>Day Resets At</span>
        </div>
        <p className="text-xs text-cream-500 dark:text-pine-400 mb-3">
          Meals logged after midnight but before this hour count as the previous day.
        </p>
        <div className="flex flex-wrap gap-2">
          {RESET_HOURS.map(h => (
            <button
              key={h}
              onClick={() => setResetHour(h)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                resetHour === h
                  ? 'bg-pine-500 text-white dark:bg-pine-400 dark:text-pine-950'
                  : 'bg-cream-200 dark:bg-pine-800 text-cream-600 dark:text-pine-300 hover:bg-cream-300 dark:hover:bg-pine-700'
              }`}
            >
              {formatResetHour(h)}
            </button>
          ))}
        </div>
      </section>

      {/* Export / Import */}
      <section className={card}>
        <span className={label}>Backup</span>
        <p className="text-xs text-cream-500 dark:text-pine-400 mb-3">
          Export saves all meals, goals, and settings. Import restores everything.
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportHistory}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-cream-200 dark:bg-pine-800 hover:bg-cream-300 dark:hover:bg-pine-700 text-pine-700 dark:text-pine-200 text-sm font-medium transition-all active:scale-95"
          >
            <Download size={15} /> Export
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-cream-200 dark:bg-pine-800 hover:bg-cream-300 dark:hover:bg-pine-700 text-pine-700 dark:text-pine-200 text-sm font-medium transition-all active:scale-95"
          >
            <Upload size={15} /> Import
          </button>
          <input ref={importRef} type="file" accept=".json,application/json" onChange={handleImport} />
        </div>
        {importStatus && (
          <p className={`text-xs mt-2 ${
            importStatus === 'loading'
              ? 'text-pine-400'
              : importStatus.startsWith('Imported')
                ? 'text-pine-500 dark:text-pine-300'
                : 'text-red-500'
          }`}>
            {importStatus === 'loading' ? 'Importing…' : importStatus}
          </p>
        )}
      </section>

      {/* Daily goals */}
      <section className={card}>
        <span className={label}>Daily Goals</span>
        <div className="space-y-4">
          {GOAL_FIELDS.map(({ key, label: lbl, unit, min, max, step }) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-pine-700 dark:text-cream-300">{lbl}</span>
                <span className="font-semibold text-pine-900 dark:text-cream-100">
                  {goals[key] || 0}<span className="text-cream-500 dark:text-pine-400 ml-1 font-normal text-xs">{unit}</span>
                </span>
              </div>
              <input type="range" min={min} max={max} step={step}
                value={goals[key] || 0} onChange={e => updateGoal(key, e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-cream-300 dark:bg-pine-700 accent-pine-500"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="mx-4 mt-6">
        <button
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all active:scale-[0.98] ${
            saved
              ? 'bg-pine-600 text-white'
              : 'bg-pine-500 hover:bg-pine-400 dark:bg-pine-400 dark:hover:bg-pine-300 dark:text-pine-950 text-white'
          }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
