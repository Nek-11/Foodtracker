import { useState, useEffect } from 'react'
import { getSettings, saveSettings, getGoals, saveGoals } from '../services/storage.js'

const GOAL_FIELDS = [
  { key: 'calories',  label: 'Calories', unit: 'kcal', min: 1000, max: 5000, step: 50  },
  { key: 'proteinG',  label: 'Protein',  unit: 'g',    min: 50,   max: 400,  step: 5   },
  { key: 'carbsG',    label: 'Carbs',    unit: 'g',    min: 50,   max: 600,  step: 5   },
  { key: 'fatG',      label: 'Fat',      unit: 'g',    min: 20,   max: 250,  step: 5   },
  { key: 'sugarG',    label: 'Sugar',    unit: 'g',    min: 10,   max: 200,  step: 5   },
  { key: 'fiberG',    label: 'Fiber',    unit: 'g',    min: 10,   max: 80,   step: 1   },
  { key: 'sodiumMg',  label: 'Sodium',   unit: 'mg',   min: 500,  max: 5000, step: 100 },
]

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: 'Recommended — fast & capable' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6',   desc: 'Most capable, slower'         },
]

const OPENAI_MODELS = [
  { id: 'o4-mini', label: 'o4-mini', desc: 'Fast & affordable' },
  { id: 'o3',      label: 'o3',      desc: 'Most capable'      },
]

const EFFORT_OPTIONS = [
  { id: 'low',    label: 'Low',    desc: 'Faster' },
  { id: 'medium', label: 'Medium', desc: 'Balanced' },
  { id: 'high',   label: 'High',   desc: 'Deep reasoning' },
]

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    )
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function ApiKeyInput({ value, onChange, placeholder, show, onToggleShow, validPrefix, label }) {
  return (
    <>
      <div className="relative mb-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-700 rounded-xl px-4 py-3 pr-12 text-sm font-mono text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          aria-label={show ? 'Hide key' : 'Show key'}
        >
          <EyeIcon open={show} />
        </button>
      </div>
      {value && (
        <p className={`text-xs mb-3 ${value.startsWith(validPrefix) ? 'text-emerald-400' : 'text-amber-400'}`}>
          {value.startsWith(validPrefix) ? 'Key looks valid' : 'Double-check key format'}
        </p>
      )}
    </>
  )
}

function ModelSelector({ models, value, onChange, name }) {
  return (
    <div className="space-y-1.5">
      {models.map(m => (
        <label
          key={m.id}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
            value === m.id ? 'bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={m.id}
            checked={value === m.id}
            onChange={() => onChange(m.id)}
            className="accent-emerald-500 flex-shrink-0"
          />
          <span className="text-sm text-slate-200 font-medium">{m.label}</span>
          <span className="text-xs text-slate-400 ml-auto">{m.desc}</span>
        </label>
      ))}
    </div>
  )
}

export default function Settings() {
  const [provider, setProvider]               = useState('claude')
  const [claudeApiKey, setClaudeApiKey]       = useState('')
  const [claudeModel, setClaudeModel]         = useState('claude-sonnet-4-6')
  const [openaiApiKey, setOpenaiApiKey]       = useState('')
  const [openaiModel, setOpenaiModel]         = useState('o4-mini')
  const [reasoningEffort, setReasoningEffort] = useState('medium')
  const [showClaudeKey, setShowClaudeKey]     = useState(false)
  const [showOpenaiKey, setShowOpenaiKey]     = useState(false)
  const [goals, setGoals]                     = useState({})
  const [saved, setSaved]                     = useState(false)

  useEffect(() => {
    const s = getSettings()
    setProvider(s.provider || 'claude')
    setClaudeApiKey(s.claudeApiKey || '')
    setClaudeModel(s.claudeModel || 'claude-sonnet-4-6')
    setOpenaiApiKey(s.openaiApiKey || '')
    setOpenaiModel(s.openaiModel || 'o4-mini')
    setReasoningEffort(s.reasoningEffort || 'medium')
    setGoals(getGoals())
  }, [])

  function handleSave() {
    saveSettings({
      provider,
      claudeApiKey: claudeApiKey.trim(),
      claudeModel,
      openaiApiKey: openaiApiKey.trim(),
      openaiModel,
      reasoningEffort,
    })
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

      {/* Active provider toggle */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Active Provider
        </h2>
        <div className="flex gap-2">
          {[['claude', 'Claude'], ['openai', 'OpenAI']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setProvider(id)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                provider === id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Configure both providers — only the active one is used for analysis.
        </p>
      </section>

      {/* Claude settings */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Claude</h2>
          {provider === 'claude' && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Get a key at <span className="text-emerald-400">console.anthropic.com</span>
        </p>
        <ApiKeyInput
          value={claudeApiKey}
          onChange={setClaudeApiKey}
          placeholder="sk-ant-..."
          show={showClaudeKey}
          onToggleShow={() => setShowClaudeKey(v => !v)}
          validPrefix="sk-ant-"
        />
        <p className="text-xs text-slate-400 mb-2">Model</p>
        <ModelSelector
          models={CLAUDE_MODELS}
          value={claudeModel}
          onChange={setClaudeModel}
          name="claude-model"
        />
      </section>

      {/* OpenAI settings */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">OpenAI</h2>
          {provider === 'openai' && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Get a key at <span className="text-emerald-400">platform.openai.com</span>
        </p>
        <ApiKeyInput
          value={openaiApiKey}
          onChange={setOpenaiApiKey}
          placeholder="sk-..."
          show={showOpenaiKey}
          onToggleShow={() => setShowOpenaiKey(v => !v)}
          validPrefix="sk-"
        />
        <p className="text-xs text-slate-400 mb-2">Model</p>
        <ModelSelector
          models={OPENAI_MODELS}
          value={openaiModel}
          onChange={setOpenaiModel}
          name="openai-model"
        />
      </section>

      {/* Reasoning effort */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Reasoning Effort
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Higher effort = more accurate analysis, longer wait time.
        </p>
        <div className="flex gap-2">
          {EFFORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setReasoningEffort(opt.id)}
              className={`flex-1 flex flex-col items-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                reasoningEffort === opt.id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
              <span className={`mt-0.5 text-[10px] font-normal ${
                reasoningEffort === opt.id ? 'text-emerald-100' : 'text-slate-500'
              }`}>
                {opt.desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Daily goals */}
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
