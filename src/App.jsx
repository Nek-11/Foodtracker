import { useState, useCallback } from 'react'
import LogScreen from './components/LogScreen.jsx'
import Dashboard from './components/Dashboard.jsx'
import History from './components/History.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  {
    id: 'log',
    label: 'Log',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
  {
    id: 'history',
    label: 'History',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    )
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('log')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleMealSaved = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="flex flex-col h-full max-w-md mx-auto">
      {/* Main content area */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeTab === 'log' ? 'block' : 'hidden'}`}>
          <LogScreen onMealSaved={handleMealSaved} />
        </div>
        <div className={`absolute inset-0 ${activeTab === 'dashboard' ? 'block' : 'hidden'}`}>
          <Dashboard refreshKey={refreshKey} />
        </div>
        <div className={`absolute inset-0 ${activeTab === 'history' ? 'block' : 'hidden'}`}>
          <History refreshKey={refreshKey} />
        </div>
        <div className={`absolute inset-0 ${activeTab === 'settings' ? 'block' : 'hidden'}`}>
          <Settings />
        </div>
      </main>

      {/* Bottom navigation */}
      <nav
        className="flex-shrink-0 bg-slate-900 border-t border-slate-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-opacity ${
                activeTab === tab.id ? 'opacity-100' : 'opacity-60 hover:opacity-80'
              }`}
              aria-label={tab.label}
            >
              {tab.icon(activeTab === tab.id)}
              <span className={`text-xs ${activeTab === tab.id ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
