import { useState, useEffect, useCallback } from 'react'
import { Camera, BarChart2, ClipboardList, Settings as SettingsIcon, Sun, Moon } from 'lucide-react'
import LogScreen   from './components/LogScreen.jsx'
import Dashboard   from './components/Dashboard.jsx'
import History     from './components/History.jsx'
import Settings    from './components/Settings.jsx'
import { getSettings, saveSettings, getMeals, updateMeal } from './services/storage.js'

export default function App() {
  const [activeTab,   setActiveTab]   = useState('log')
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [isDark,      setIsDark]      = useState(true)

  // Load theme from settings on mount
  useEffect(() => {
    const s = getSettings()
    const dark = s.theme !== 'light'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  // Fix any meals that were left in 'analyzing' state from a previous session
  useEffect(() => {
    const meals = getMeals()
    meals.forEach(m => {
      if (m.status === 'analyzing') {
        updateMeal(m.id, {
          status: 'interrupted',
          errorMessage: 'Analysis was interrupted. Open the meal to retry.',
        })
      }
    })
  }, []) // runs once on mount

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    const s = getSettings()
    saveSettings({ ...s, theme: next ? 'dark' : 'light' })
  }

  // Called by LogScreen after saving a pending meal — switches to History
  const handleMealSubmitted = useCallback(() => {
    setRefreshKey(k => k + 1)
    setActiveTab('history')
  }, [])

  // Called from other places that need to refresh dashboard/history
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const tabs = [
    { id: 'log',       label: 'Log',       Icon: Camera },
    { id: 'dashboard', label: 'Today',     Icon: BarChart2 },
    { id: 'history',   label: 'History',   Icon: ClipboardList },
    { id: 'settings',  label: 'Settings',  Icon: SettingsIcon },
  ]

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-cream-100 dark:bg-pine-950 transition-colors duration-300">

      {/* Theme toggle — floating top-right */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed top-0 right-4 z-50 p-2 text-pine-600 dark:text-pine-300 hover:text-pine-400"
        style={{ marginTop: 'max(0.5rem, var(--sat))' }}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
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
            {tab === 'log' && (
              <LogScreen onMealSubmitted={handleMealSubmitted} />
            )}
            {tab === 'dashboard' && (
              <Dashboard refreshKey={refreshKey} />
            )}
            {tab === 'history' && (
              <History refreshKey={refreshKey} onRefresh={handleRefresh} />
            )}
            {tab === 'settings' && (
              <Settings onRefresh={handleRefresh} />
            )}
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
