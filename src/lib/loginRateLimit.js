/**
 * loginRateLimit.js
 * ─────────────────
 * Client-side brute-force protection for the login form.
 *
 * Strategy:
 *   • Track failed attempts per identifier (email or staff key) in localStorage.
 *   • Progressive response delay: attempt N → delay N-1 seconds (max 8s).
 *   • After MAX_ATTEMPTS failures  → hard lockout for LOCKOUT_MINUTES minutes.
 *   • Successful login            → clear the counter for that identifier.
 *   • Lockout state survives page refresh (persisted in localStorage).
 *
 * Why localStorage (not server)?
 *   Supabase Auth already has server-side rate limiting built in.
 *   This layer adds immediate client-side feedback BEFORE the network
 *   request, making the UX much better (no wait for a server error).
 */

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS      = 5          // lock after this many consecutive failures
const LOCKOUT_MINUTES   = 10         // lockout duration in minutes
const LOCKOUT_MS        = LOCKOUT_MINUTES * 60 * 1000
const STORAGE_PREFIX    = 'shopms_rl_' // localStorage key prefix

// Progressive delay per attempt number (index = attempt number, 0-based)
// attempt 1 → 0s, 2 → 1s, 3 → 3s, 4 → 5s, 5 → 8s
const DELAYS_MS = [0, 1000, 3000, 5000, 8000]

// ─────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────────────────────────

/** Normalise an identifier to a safe storage key. */
const toKey = (identifier) =>
  STORAGE_PREFIX + String(identifier || 'unknown').toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '')

/** Read rate-limit state for an identifier. */
const readState = (identifier) => {
  try {
    const raw = localStorage.getItem(toKey(identifier))
    if (!raw) return { attempts: 0, lockoutUntil: null }
    return JSON.parse(raw)
  } catch {
    return { attempts: 0, lockoutUntil: null }
  }
}

/** Persist rate-limit state for an identifier. */
const writeState = (identifier, state) => {
  try {
    localStorage.setItem(toKey(identifier), JSON.stringify(state))
  } catch {
    // localStorage not available — fail silently
  }
}

/** Remove rate-limit state for an identifier (success path). */
const clearState = (identifier) => {
  try {
    localStorage.removeItem(toKey(identifier))
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Check whether a login attempt is currently allowed.
 * Call this BEFORE making the Supabase auth call.
 *
 * @param {string} identifier  email or staff pseudo-key
 * @returns {{ allowed: boolean, msRemaining: number, attemptsLeft: number }}
 */
export function checkRateLimit(identifier) {
  const state = readState(identifier)
  const now   = Date.now()

  if (state.lockoutUntil && now < state.lockoutUntil) {
    // Still in lockout period
    return {
      allowed:      false,
      msRemaining:  state.lockoutUntil - now,
      attemptsLeft: 0,
    }
  }

  if (state.lockoutUntil && now >= state.lockoutUntil) {
    // Lockout expired — reset automatically
    clearState(identifier)
    return { allowed: true, msRemaining: 0, attemptsLeft: MAX_ATTEMPTS }
  }

  return {
    allowed:      true,
    msRemaining:  0,
    attemptsLeft: MAX_ATTEMPTS - (state.attempts || 0),
  }
}

/**
 * Record a *failed* login attempt and apply progressive delay.
 * Always await this before showing the error to the user.
 *
 * @param {string} identifier
 * @returns {{ isLockedOut: boolean, lockoutUntil: number|null, attempt: number, delayApplied: number }}
 */
export async function recordFailedAttempt(identifier) {
  const state    = readState(identifier)
  const attempts = (state.attempts || 0) + 1

  // Determine progressive delay (cap at last entry)
  const delayIdx    = Math.min(attempts - 1, DELAYS_MS.length - 1)
  const delayMs     = DELAYS_MS[delayIdx]

  // Apply the delay (gives the impression of slow response)
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  // Determine if we should lock
  const isLockedOut  = attempts >= MAX_ATTEMPTS
  const lockoutUntil = isLockedOut ? Date.now() + LOCKOUT_MS : null

  writeState(identifier, { attempts, lockoutUntil })

  return { isLockedOut, lockoutUntil, attempt: attempts, delayApplied: delayMs }
}

/**
 * Clear the rate-limit counter after a *successful* login.
 *
 * @param {string} identifier
 */
export function recordSuccessfulLogin(identifier) {
  clearState(identifier)
}

/**
 * Human-readable countdown string from milliseconds.
 * e.g. 594000 → "9m 54s"
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatCountdown(ms) {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes      = Math.floor(totalSeconds / 60)
  const seconds      = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Build a lock-error message when the account is rate-limited.
 *
 * @param {number} msRemaining
 * @returns {string}
 */
export function buildLockoutMessage(msRemaining) {
  return `Too many failed attempts. Try again in ${formatCountdown(msRemaining)}.`
}
