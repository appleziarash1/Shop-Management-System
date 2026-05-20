/**
 * passwordPolicy.js
 * ─────────────────
 * Strong password policy enforcer for the ShopMS system.
 *
 * Rules enforced:
 *   - Minimum 8 characters (12 recommended)
 *   - At least 1 uppercase letter
 *   - At least 1 lowercase letter
 *   - At least 1 number
 *   - At least 1 special character (!@#$%^&*…)
 *
 * Note: Supabase Auth automatically hashes passwords with bcrypt
 * on the server side. These functions enforce the client-side policy
 * before the password is ever sent to Supabase.
 */

// ─────────────────────────────────────────────────────────────
// POLICY RULES
// ─────────────────────────────────────────────────────────────

export const PASSWORD_RULES = [
  {
    id:      'minLength',
    label:   'At least 8 characters',
    test:    (pw) => pw.length >= 8,
  },
  {
    id:      'uppercase',
    label:   'One uppercase letter (A–Z)',
    test:    (pw) => /[A-Z]/.test(pw),
  },
  {
    id:      'lowercase',
    label:   'One lowercase letter (a–z)',
    test:    (pw) => /[a-z]/.test(pw),
  },
  {
    id:      'number',
    label:   'One number (0–9)',
    test:    (pw) => /[0-9]/.test(pw),
  },
  {
    id:      'special',
    label:   'One special character (!@#$%^&*)',
    test:    (pw) => /[^A-Za-z0-9]/.test(pw),
  },
]

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Check a password against all rules.
 *
 * @param {string} password
 * @returns {{ passed: boolean, score: number, results: Array<{id, label, passed}> }}
 */
export function validatePassword(password) {
  const results = PASSWORD_RULES.map((rule) => ({
    id:     rule.id,
    label:  rule.label,
    passed: rule.test(password),
  }))

  const score  = results.filter((r) => r.passed).length
  const passed = score === PASSWORD_RULES.length

  return { passed, score, results }
}

/**
 * Returns a strength label and colour for a given score (0–5).
 *
 * @param {number} score
 * @returns {{ label: string, color: string, bgColor: string }}
 */
export function getStrengthMeta(score) {
  if (score === 0) return { label: '',          color: 'transparent',  bgColor: 'transparent' }
  if (score === 1) return { label: 'Very Weak', color: '#c41c3b',      bgColor: 'rgba(196,28,59,0.12)' }
  if (score === 2) return { label: 'Weak',      color: '#e65100',      bgColor: 'rgba(230,81,0,0.12)' }
  if (score === 3) return { label: 'Fair',      color: '#f59e0b',      bgColor: 'rgba(245,158,11,0.12)' }
  if (score === 4) return { label: 'Good',      color: '#2e7d32',      bgColor: 'rgba(46,125,50,0.12)' }
  return              { label: 'Strong 🔐',    color: '#1a7d1a',      bgColor: 'rgba(26,125,26,0.12)' }
}

/**
 * Throw an Error if the password fails policy.
 * Use this before calling supabase.auth.signUp / updateUser.
 *
 * @param {string} password
 * @throws {Error}
 */
export function assertPasswordPolicy(password) {
  const { passed, results } = validatePassword(password)
  if (passed) return

  const failed = results.filter((r) => !r.passed).map((r) => r.label)
  throw new Error(`Password must include: ${failed.join(', ')}.`)
}
