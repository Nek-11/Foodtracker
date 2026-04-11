import { useState, useEffect } from 'react'
import { getSettings, saveSettings, getGoals, saveGoals } from '../services/storage.js'

const GOAL_FIELDS = [
  { key: 'calories',  label: 'Calories',    unit: 'kcal', min: 1000, max: 5000, step: 50 },
  { key: 'proteinG',  label: 'Protein',      unit: 'g',    min: 50,   max: 400,  step: 5  },
  { key: 'carbsG',    label: 'Carbs',        unit: 'g',    min: 50,   max: 600,  step: 5  },
  { key: 'fatG',      label: 'Fat',          unit: 'g',    min: 20,   max: 250,  step: 5  },
  { key: 'sugarG',    label: 'Sugar',        unit: 'g',    min: 10,   max: 200,  step: 5  },
  { key: 'fiberG',    label: 'Fiber',        unit: 'g',    min: 10,   max: 80,   step: 1  },
  { key: 'sodiumMg',  label: 'Sodium',       unit: 'mg',   min: 500,  max: 5000, step: 100},
]

export default function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [goals, setGoals] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const s = getSettings()
    setApiKey(s.claudeApiKey || '')
    setGoals(getGoals())
  }, [])

  function handleSave() {
    saveSettings({ claudeApiKey: apiKey.trim() })
    saveGoals(goals)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateGoal(key, value) {
    setGoals(g => ({ ...g, [key]: Number(value) }))
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* API Key */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Claude API Key
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Your key is stored only on this device and never sent anywhere except Anthropic's API.
          Get one at{' '}
          <span className="text-emerald-400">console.anthropic.com</span>
        </p>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full bg-slate-700 rounded-xl px-4 py-3 pr-12 text-sm font-mono text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            aria-label={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {apiKey && (
          <p className="text-xs text-emerald-400 mt-2">
            Key saved — {apiKey.startsWith('sk-ant-') ? 'looks valid' : 'double-check format'}
          </p>
        )}
      </section>

      {/* Daily Goals */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Daily Goals
        </h2>
        <div className="space-y-4">
          {GOAL_FIELDS.map(({ key, label, unit, min, max, step }) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">{label}</span>
                <span className="text-white font-medium">
                  {goals[key] || 0}
                  <span className="text-slate-400 ml-1">{unit}</span>
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={goals[key] || 0}
                onChange={e => updateGoal(key, e.target.value)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="mx-4 mt-6">
        <button
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${
            saved
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white'
          }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
