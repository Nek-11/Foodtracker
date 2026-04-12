/**
 * Haptic feedback helpers using the Vibration API.
 * Safe to call on any device — silently no-ops where unsupported.
 */
const vibe = (pattern) => { try { navigator.vibrate?.(pattern) } catch (_) {} }

export const hapticLight   = () => vibe(10)
export const hapticMedium  = () => vibe(25)
export const hapticSuccess = () => vibe([10, 40, 20])
export const hapticError   = () => vibe([30, 20, 30])
export const hapticWarning = () => vibe([15, 30, 15])
