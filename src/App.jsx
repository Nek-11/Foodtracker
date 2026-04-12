import { useState, useEffect, useCallback } from 'react'
import { Camera, BarChart2, ClipboardList, Settings as SettingsIcon, Sun, Moon, SunMoon, WifiOff } from 'lucide-react'
import LogScreen   from './components/LogScreen.jsx'
import Dashboard   from './components/Dashboard.jsx'
import History     from './components/History.jsx'
import Settings    from './components/Settings.jsx'
import { getSettings, saveSettings, getMeals, updateMeal } from './services/storage.js'

function getEffectiveDark(theme) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function App() {
  const [activeTab,  setActiveTab]  = useState('log')
  const [refreshKey, setRefreshKey] = useState(0)
  const [theme,      setTheme]      = useState('system')
  const [isOffline,  setIsOffline]  = useState(!navigator.onLine)

  // Load saved theme on mount
  useEffect(() => {
    const s = getSettings()
    setTheme(s.theme || 'system')
  }, [])

  // Apply theme to <html> and listen for system changes when in 'system' mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', getEffectiveDark(theme))
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = e => document.documentElement.classList.toggle('dark', e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Offline / online detection
  useEffect(() => {
    const onOnline  = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Fix any meals stuck in 'analyzing' from a previous session
  useEffect(() => {
    getMeals().forEach(m => {
      if (m.status === 'analyzing') {
        updateMeal(m.id, { status: 'interrupted', errorMessage: 'Analysis was interrupted. Open the meal to retry.' })
      }
    })
  }, [])

  // Cycle: light → dark → system → light…
  function cycleTheme() {
    const order = ['light', 'dark', 'system']
    const next = order[(order.indexOf(theme) + 1) % order.length]
    setTheme(next)
    saveSettings({ ...getSettings(), theme: next })
  }

  const handleMealSubmitted = useCallback(() => {
    setRefreshKey(k => k + 1)
    setActiveTab('history')
  }, [])

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'

  const tabs = [
    { id: 'log',       label: 'Log',      Icon: Camera },
    { id: 'dashboard', label: 'Stats',    Icon: BarChart2 },
    { id: 'history',   label: 'History',  Icon: ClipboardList },
    { id: 'settings',  label: 'Settings', Icon: SettingsIcon },
  ]

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-cream-100 dark:bg-pine-950 transition-colors duration-300">

      {/* Offline banner */}
      {isOffline && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1.5 py-1.5 bg-amber-500 text-white text-xs font-semibold">
          <WifiOff size={11} /> No internet — AI analysis unavailable
        </div>
      )}

      {/* Theme toggle — floating top-right */}
      <button
        onClick={cycleTheme}
        aria-label={`Theme: ${themeLabel}. Tap to cycle.`}
        className="fixed top-0 right-4 z-50 p-2 text-pine-600 dark:text-pine-300 hover:text-pine-400"
        style={{ marginTop: 'max(0.5rem, var(--sat))' }}
      >
        <ThemeIcon size={18} />
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {['log', 'dashboard', 'history', 'settings'].map(tab => (
          <div
            key={tab}
            className={`absolute inset-0 transition-opacity duration-200 ${
              activeTab === tab ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {tab === 'log'       && <LogScreen  onMealSubmitted={handleMealSubmitted} />}
            {tab === 'dashboard' && <Dashboard  refreshKey={refreshKey} />}
            {tab === 'history'   && <History    refreshKey={refreshKey} onRefresh={handleRefresh} />}
            {tab === 'settings'  && <Settings   onRefresh={handleRefresh} />}
          </div>
        ))}
      </main>

      {/* Bottom navigation */}
      <nav
        className="flex-shrink-0 border-t border-cream-200 dark:border-pine-800 bg-cream-50 dark:bg-pine-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${
                  active
                    ? 'text-pine-500 dark:text-pine-300'
                    : 'text-cream-500 dark:text-pine-600 hover:text-pine-400 dark:hover:text-pine-400'
                }`}
                aria-label={label}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
                <span className={`text-[10px] font-medium tracking-wide ${active ? 'opacity-100' : 'opacity-60'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
