/**
 * sanitize.js
 * ───────────
 * Input sanitization utilities — prevents XSS, HTML injection,
 * SQL-injection-like patterns, and control-character attacks
 * before any user data is stored or rendered.
 *
 * Philosophy:
 *   Sanitize on INPUT (before state/DB), not just on output.
 *   These helpers are composable — chain them as needed.
 */

// ─────────────────────────────────────────────────────────────
// CORE STRIPPERS
// ─────────────────────────────────────────────────────────────

/**
 * Strip all HTML tags from a string.
 * Prevents stored XSS via user-supplied markup.
 *
 * "Hello <script>alert(1)</script>" → "Hello "
 */
export const stripHtml = (value) =>
  String(value ?? '').replace(/<[^>]*>/g, '')

/**
 * Strip dangerous SQL meta-characters that have no legitimate use
 * in plain-text form fields (names, descriptions, notes).
 * Note: Supabase uses parameterised queries, so this is defence-in-depth.
 */
export const stripSqlMeta = (value) =>
  String(value ?? '').replace(/['";\\]/g, '')

/**
 * Strip ASCII control characters (0x00–0x1F except tab/newline).
 * Prevents null-byte injection and terminal escape sequences.
 */
export const stripControlChars = (value) =>
  String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

/**
 * Collapse internal whitespace and trim edges.
 */
export const normalizeWhitespace = (value) =>
  String(value ?? '').replace(/\s+/g, ' ').trim()

// ─────────────────────────────────────────────────────────────
// COMPOSED SANITIZERS (use these in components)
// ─────────────────────────────────────────────────────────────

/**
 * Sanitize a generic plain-text field (name, description, notes).
 * Removes HTML, control chars, normalises whitespace.
 * Does NOT strip SQL meta so apostrophes in names work fine.
 *
 * @param {string} value
 * @param {number} [maxLength=255]
 * @returns {string}
 */
export const sanitizeText = (value, maxLength = 255) => {
  let s = String(value ?? '')
  s = stripHtml(s)
  s = stripControlChars(s)
  s = normalizeWhitespace(s)
  return s.slice(0, maxLength)
}

/**
 * Sanitize a strict name field (person name, shop name, branch).
 * Same as sanitizeText but also strips SQL meta-chars.
 *
 * @param {string} value
 * @param {number} [maxLength=100]
 * @returns {string}
 */
export const sanitizeName = (value, maxLength = 100) => {
  let s = sanitizeText(value, maxLength)
  s = stripSqlMeta(s)
  return s
}

/**
 * Sanitize an email address.
 * Lowercases, strips whitespace, removes HTML.
 *
 * @param {string} value
 * @returns {string}
 */
export const sanitizeEmail = (value) =>
  stripHtml(String(value ?? ''))
    .trim()
    .toLowerCase()
    .slice(0, 254) // RFC 5321 maximum

/**
 * Sanitize a numeric input — returns a clean number string or ''.
 * Only digits and one decimal point are allowed.
 *
 * @param {string|number} value
 * @returns {string}
 */
export const sanitizeNumeric = (value) =>
  String(value ?? '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')

/**
 * Sanitize a search/query string.
 * Strips HTML and SQL meta, limits length.
 *
 * @param {string} value
 * @param {number} [maxLength=100]
 * @returns {string}
 */
export const sanitizeSearch = (value, maxLength = 100) => {
  let s = stripHtml(String(value ?? ''))
  s = stripControlChars(s)
  s = normalizeWhitespace(s)
  // Keep only printable ASCII + common unicode letters/numbers
  s = s.replace(/[<>'"`;]/g, '')
  return s.slice(0, maxLength)
}

/**
 * Sanitize a free-form notes / description field.
 * Allows newlines but strips HTML and control chars.
 *
 * @param {string} value
 * @param {number} [maxLength=500]
 * @returns {string}
 */
export const sanitizeNotes = (value, maxLength = 500) => {
  let s = String(value ?? '')
  s = stripHtml(s)
  // Strip control chars but keep \n and \r (0x0A, 0x0D)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  s = s.replace(/[ \t]+/g, ' ')  // collapse horizontal whitespace
  return s.slice(0, maxLength).trim()
}

// ─────────────────────────────────────────────────────────────
// REACT HELPER — sanitizedChangeHandler
// ─────────────────────────────────────────────────────────────

/**
 * Returns an onChange handler that sanitizes the input value
 * on every keystroke before updating state.
 *
 * Usage:
 *   <input onChange={sanitizedChangeHandler(setName, sanitizeName)} />
 *
 * @param {Function} setter       - React state setter
 * @param {Function} sanitizeFn   - A sanitizer from this module
 * @returns {Function}            - onChange handler
 */
export const sanitizedChangeHandler = (setter, sanitizeFn = sanitizeText) =>
  (e) => setter(sanitizeFn(e.target.value))
