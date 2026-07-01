import { useState, useEffect, useCallback, useMemo } from 'react'
import { Lightbulb, RefreshCw, PlusCircle, MinusCircle, Repeat2, Calendar } from 'lucide-react'
import { getMealsByDate, getSettings, getTips } from '../services/storage.js'
import { generateTips, getYesterdayKey } from '../services/tipsService.js'
import { formatDate } from '../utils/nutritionUtils.js'

const TYPE_CONFIG = {
  ADD:     { label: '+ Add',     bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', Icon: PlusCircle  },
  REMOVE:  { label: '− Remove',  bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400',         Icon: MinusCircle },
  REPLACE: { label: '↔ Replace', bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-400',     Icon: Repeat2     },
}

export default function Tips({ refreshKey }) {
  const [status,   setStatus]   = useState('idle')
  const [tipsData, setTipsData] = useState(null)
  const [error,    setError]    = useState(null)

  const yesterdayKey   = useMemo(() => getYesterdayKey(), [])
  const yesterdayLabel = useMemo(() => formatDate(yesterdayKey), [yesterdayKey])

  const tryLoad = useCallback(async (force = false) => {
    if (!force) {
      const stored = getTips(yesterdayKey)
      if (stored) { setTipsData(stored); setStatus('done'); return }
    }

    const meals = getMealsByDate(yesterdayKey).filter(m => m.analysis)
    if (meals.length === 0) { setStatus('no-meals'); return }

    const settings = getSettings()
    const apiKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.claudeApiKey
    if (!apiKey?.trim()) { setStatus('no-key'); return }

    setStatus('loading')
    setError(null)
    try {
      await generateTips()
      const result = getTips(yesterdayKey)
      setTipsData(result || { daily: [], weeklyInsight: null })
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Could not generate tips')
      setStatus('error')
    }
  }, [yesterdayKey])

  useEffect(() => { tryLoad() }, [tryLoad, refreshKey])

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-cream-100 dark:bg-pine-950 pl-4 pr-14 pb-3 border-b border-cream-200 dark:border-pine-800" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
        <div className="flex items-center gap-3">
          <Lightbulb size={20} className="text-amber-500" />
          <h1 className="text-xl font-bold text-pine-900 dark:text-pine-100 font-display">Tips</h1>
          {status === 'done' && (
            <button
              onClick={() => tryLoad(true)}
              className="ml-auto p-1.5 rounded-full text-pine-400 dark:text-pine-500 hover:text-pine-600 dark:hover:text-pine-300 active:opacity-70"
              aria-label="Regenerate tips"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>
        <p className="text-sm text-pine-500 dark:text-pine-400 mt-0.5">
          Based on {yesterdayLabel === 'Today' ? 'yesterday' : yesterdayLabel}
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Loading */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-pine-400 dark:text-pine-500">Analysing yesterday's meals…</p>
          </div>
        )}

        {/* No meals */}
        {status === 'no-meals' && (
          <div className="rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 p-6 text-center">
            <p className="text-pine-500 dark:text-pine-400 text-sm font-medium">No meals logged yesterday</p>
            <p className="text-pine-400 dark:text-pine-500 text-xs mt-1">Log meals to get personalised tips.</p>
          </div>
        )}

        {/* No API key */}
        {status === 'no-key' && (
          <div className="rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 p-6 text-center">
            <Lightbulb size={24} className="text-amber-400 mx-auto mb-2" />
            <p className="text-pine-500 dark:text-pine-400 text-sm font-medium">API key required</p>
            <p className="text-pine-400 dark:text-pine-500 text-xs mt-1">Add a Claude or OpenAI key in Settings to get daily tips.</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button
              onClick={() => tryLoad(true)}
              className="mt-2 text-xs text-red-500 dark:text-red-400 underline"
            >
              Tap to retry
            </button>
          </div>
        )}

        {/* Tips */}
        {status === 'done' && tipsData && (
          <>
            {tipsData.daily?.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-5 text-center">
                <p className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold">All on track yesterday!</p>
                <p className="text-emerald-500 dark:text-emerald-600 text-xs mt-1">All your macros were within goal — nothing to flag.</p>
              </div>
            ) : (
              tipsData.daily.map((tip, i) => {
                const cfg = TYPE_CONFIG[tip.type] ?? TYPE_CONFIG.ADD
                return (
                  <div key={i} className="rounded-2xl bg-cream-50 dark:bg-pine-900 border border-cream-200 dark:border-pine-800 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-pine-400 dark:text-pine-500 capitalize">{tip.macro}</span>
                    </div>
                    <p className="text-sm text-pine-800 dark:text-pine-200 leading-relaxed">{tip.text}</p>
                  </div>
                )
              })
            )}

            {tipsData.weeklyInsight && (
              <div className="rounded-2xl bg-pine-900/5 dark:bg-pine-800/30 border border-pine-200 dark:border-pine-700 p-4 mt-1">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={14} className="text-pine-400 dark:text-pine-500" />
                  <span className="text-xs font-semibold text-pine-500 dark:text-pine-400 uppercase tracking-wide">This Week</span>
                </div>
                <p className="text-sm text-pine-700 dark:text-pine-300 leading-relaxed">{tipsData.weeklyInsight}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
