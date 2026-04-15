import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: () => <div data-testid="line-chart" />,
  BarChart: () => <div data-testid="bar-chart" />,
  Line: () => null,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
}))

describe('Settings component', () => {
  it('renders with collapsed goals by default', async () => {
    const Settings = (await import('../components/Settings.jsx')).default
    render(<Settings onRefresh={() => {}} />)

    expect(screen.getByText('Daily Goals')).toBeInTheDocument()
    // Goals should be collapsed — sliders should not be visible
    expect(screen.queryByText('Calories')).not.toBeInTheDocument()
  })

  it('renders recurring habits section', async () => {
    const Settings = (await import('../components/Settings.jsx')).default
    render(<Settings onRefresh={() => {}} />)

    expect(screen.getByText('Recurring Habits')).toBeInTheDocument()
    expect(screen.getByText('Add habit')).toBeInTheDocument()
  })

  it('renders attribution', async () => {
    const Settings = (await import('../components/Settings.jsx')).default
    render(<Settings onRefresh={() => {}} />)

    expect(screen.getByText('Vibecoded by')).toBeInTheDocument()
    expect(screen.getByText('nek-11')).toBeInTheDocument()
  })
})

describe('History component', () => {
  it('renders empty state when no meals', async () => {
    const History = (await import('../components/History.jsx')).default
    render(<History refreshKey={0} onRefresh={() => {}} />)

    expect(screen.getByText('No meals logged yet')).toBeInTheDocument()
  })
})

describe('Dashboard component', () => {
  it('renders Stats header', async () => {
    const Dashboard = (await import('../components/Dashboard.jsx')).default
    render(<Dashboard refreshKey={0} onRefresh={() => {}} />)

    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Calories')).toBeInTheDocument()
  })
})

describe('LogScreen component', () => {
  it('renders Log a Meal header', async () => {
    const LogScreen = (await import('../components/LogScreen.jsx')).default
    render(<LogScreen onMealSubmitted={() => {}} />)

    expect(screen.getByText('Log a Meal')).toBeInTheDocument()
    expect(screen.getByText('Log Meal')).toBeInTheDocument()
  })

  it('does not show "runs in background" text', async () => {
    const LogScreen = (await import('../components/LogScreen.jsx')).default
    render(<LogScreen onMealSubmitted={() => {}} />)

    expect(screen.queryByText(/runs in background/i)).not.toBeInTheDocument()
  })

  it('does not show "tap to open camera" text', async () => {
    const LogScreen = (await import('../components/LogScreen.jsx')).default
    render(<LogScreen onMealSubmitted={() => {}} />)

    expect(screen.queryByText(/tap to open camera/i)).not.toBeInTheDocument()
  })
})
