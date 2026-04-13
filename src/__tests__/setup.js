import '@testing-library/jest-dom'

// Mock localStorage
const store = {}
const localStorageMock = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value) },
  removeItem: (key) => { delete store[key] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Reset localStorage between tests
beforeEach(() => localStorageMock.clear())

// Stub navigator.vibrate
if (!navigator.vibrate) {
  navigator.vibrate = () => true
}
