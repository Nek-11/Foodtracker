import { useState, useEffect } from 'react'
import { getSettings, saveSettings, getGoals, saveGoals } from '../services/storage.js'
import { CLAUDE_MODELS } from '../services/claude.js'
import { OPENAI_MODELS } from '../services/openai.js'

const GOAL_FIELDS = [
  { key: 'calories',  label: 'Calories', unit: 'kcal', min: 1000, max: 5000, step: 50  },
  { key: 'proteinG',  label: 'Protein',  unit: 'g',    min: 50,   max: 400,  step: 5   },
  { key: 'carbsG',    label: 'Carbs',    unit: 'g',    min: 50,   max: 600,  step: 5   },
  { key: 'fatG',      label: 'Fat',      unit: 'g',    min: 20,   max: 250,  step: 5   },
  { key: 'sugarG',    label: 'Sugar',    unit: 'g',    min: 10,   max: 200,  step: 5   },
  { key: 'fiberG',    label: 'Fiber',    unit: 'g',    min: 10,   max: 80,   step: 1   },
  { key: 'sodiumMg',  label: 'Sodium',   unit: 'mg',   min: 500,  max: 5000, step: 100 },
]

const EFFORT_OPTIONS = [
  { value: 'low',    label: 'Low',    hint: 'Fast · Less thorough' },
  { value: 'medium', label: 'Medium', hint: 'Balanced · Recommended' },
  { value: 'high',   label: 'High',   hint: 'Slowest · Most thorough' },
]

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [goals, setGoals]       = useState({})
  const [saved, setSaved]       = useState(false)
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)

  useEffect(() => {
    setSettings(getSettings())
    setGoals(getGoals())
  }, [])

  function set(key, value) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  function handleSave() {
    saveSettings(settings)
    saveGoals(goals)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const activeModels = settings.provider === 'openai' ? OPENAI_MODELS : CLAUDE_MODELS

  return (
    <div className="flex flex-col h-full overflow-y-auto scroll-touch pb-8">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* ── AI Provider ─────────────────────────────── */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="section-title">AI Provider</h2>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[
            { id: 'claude', label: 'Claude', sub: 'by Anthropic' },
            { id: 'openai', label: 'OpenAI', sub: 'o-series models' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => set('provider', p.id)}
              className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all ${
                settings.provider === p.id
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-700/40'
              }`}
            >
              <span className={`font-semibold text-sm ${settings.provider === p.id ? 'text-emerald-400' : 'text-slate-300'}`}>
                {p.label}
              </span>
              <span className="text-xs text-slate-500 mt-0.5">{p.sub}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Claude config ───────────────────────────── */}
      <ProviderSection
        title="Claude (Anthropic)"
        active={settings.provider === 'claude'}
        apiKey={settings.claudeApiKey || ''}
        onApiKeyChange={v => set('claudeApiKey', v)}
        showKey={showClaudeKey}
        onToggleShow={() => setShowClaudeKey(v => !v)}
        placeholder="sk-ant-..."
        keyHint={settings.claudeApiKey?.startsWith('sk-ant-') ? 'Key looks valid' : settings.claudeApiKey ? 'Check format: sk-ant-...' : ''}
        models={CLAUDE_MODELS}
        selectedModel={settings.claudeModel || 'claude-sonnet-4-6'}
        onModelChange={v => set('claudeModel', v)}
      />

      {/* ── OpenAI config ───────────────────────────── */}
      <ProviderSection
        title="OpenAI"
        active={settings.provider === 'openai'}
        apiKey={settings.openaiApiKey || ''}
        onApiKeyChange={v => set('openaiApiKey', v)}
        showKey={showOpenAIKey}
        onToggleShow={() => setShowOpenAIKey(v => !v)}
        placeholder="sk-..."
        keyHint={settings.openaiApiKey?.startsWith('sk-') ? 'Key looks valid' : settings.openaiApiKey ? 'Check format: sk-...' : ''}
        models={OPENAI_MODELS}
        selectedModel={settings.openaiModel || 'o4-mini'}
        onModelChange={v => set('openaiModel', v)}
      />

      {/* ── Reasoning effort ────────────────────────── */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="section-title">Reasoning Effort</h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          Controls how long the model thinks before answering. Higher = more accurate, slower.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {EFFORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => set('reasoningEffort', opt.value)}
              className={`flex flex-col items-center py-3 px-1 rounded-xl border-2 transition-all ${
                settings.reasoningEffort === opt.value
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-700/40'
              }`}
            >
              <span className={`font-semibold text-sm ${settings.reasoningEffort === opt.value ? 'text-emerald-400' : 'text-slate-300'}`}>
                {opt.label}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 text-center leading-tight">{opt.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Daily Goals ─────────────────────────────── */}
      <section className="mx-4 mt-4 bg-slate-800 rounded-2xl p-4">
        <h2 className="section-title">Daily Goals</h2>
        <div className="space-y-4 mt-3">
          {GOAL_FIELDS.map(({ key, label, unit, min, max, step }) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">{label}</span>
                <span className="text-white font-medium">
                  {goals[key] || 0}
                  <span className="text-slate-400 ml-1 text-xs">{unit}</span>
                </span>
              </div>
              <input
                type="range"
                min={min} max={max} step={step}
                value={goals[key] || 0}
                onChange={e => setGoals(g => ({ ...g, [key]: Number(e.target.value) }))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Save ────────────────────────────────────── */}
      <div className="mx-4 mt-6">
        <button
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${
            saved ? 'bg-emerald-600 text-white' : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white'
          }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Sub-component: one provider's config block ──────────────────────────────

function ProviderSection({ title, active, apiKey, onApiKeyChange, showKey, onToggleShow, placeholder, keyHint, models, selectedModel, onModelChange }) {
  return (
    <section className={`mx-4 mt-3 rounded-2xl p-4 border-2 transition-colors ${active ? 'bg-slate-800 border-emerald-700/40' : 'bg-slate-800/60 border-slate-700/40'}`}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="section-title">{title}</h2>
        {active && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Active</span>}
      </div>

      {/* API key */}
      <div className="relative mb-3">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={e => onApiKeyChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-700 rounded-xl px-4 py-3 pr-12 text-sm font-mono text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={onToggleShow}
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
      {keyHint && (
        <p className={`text-xs mb-3 -mt-1 ${apiKey ? 'text-emerald-400' : 'text-slate-500'}`}>{keyHint}</p>
      )}

      {/* Model picker */}
      <div className="space-y-2">
        {models.map(m => (
          <button
            key={m.id}
            onClick={() => onModelChange(m.id)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left ${
              selectedModel === m.id
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-600 bg-slate-700/40'
            }`}
          >
            <div>
              <p className={`text-sm font-medium ${selectedModel === m.id ? 'text-emerald-300' : 'text-slate-300'}`}>{m.label}</p>
              <p className="text-xs text-slate-500">{m.description}</p>
            </div>
            {selectedModel === m.id && (
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
