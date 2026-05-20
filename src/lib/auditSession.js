/**
 * auditSession.js
 * ───────────────
 * Core library for Employee Session Tracking & Audit Logging.
 *
 * Exports:
 *   createSession     - Open a new session on login
 *   closeSession      - Close a session on logout
 *   getActiveSession  - Retrieve the current open session for a user
 *   logAuditEvent     - Write any action to the audit_logs table
 */

import { supabase } from './supabaseClient'

// ─────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Create a new employee session when a user logs in.
 * If an orphaned active session already exists for this user+shop,
 * it is closed first (handles browser crash / force-refresh).
 *
 * @param {object} profile  - The user's profile row
 * @param {string} shopId   - The shop they are logging into
 * @returns {object|null}   - The newly created session row, or null on error
 */
export async function createSession(profile, shopId) {
  if (!profile?.id || !shopId || shopId === 'all') return null

  try {
    // 1. Close any lingering active sessions for this user+shop
    await supabase
      .from('employee_sessions')
      .update({ status: 'closed', logout_time: new Date().toISOString() })
      .eq('employee_id', profile.id)
      .eq('shop_id', shopId)
      .eq('status', 'active')

    // 2. Create the new session
    const { data, error } = await supabase
      .from('employee_sessions')
      .insert([{
        shop_id:       shopId,
        employee_id:   profile.id,
        employee_name: profile.full_name || 'Unknown',
        employee_role: profile.role      || 'Cashier',
        login_time:    new Date().toISOString(),
        status:        'active'
      }])
      .select()
      .single()

    if (error) {
      console.error('[AuditSession] createSession error:', error)
      return null
    }

    return data
  } catch (err) {
    console.error('[AuditSession] createSession unexpected error:', err)
    return null
  }
}

/**
 * Close an employee session when the user logs out.
 *
 * @param {string} sessionId  - The UUID of the session to close
 * @returns {boolean}         - true if successful
 */
export async function closeSession(sessionId) {
  if (!sessionId) return false

  try {
    const { error } = await supabase
      .from('employee_sessions')
      .update({
        status:      'closed',
        logout_time: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('status', 'active') // only close if not already closed

    if (error) {
      console.error('[AuditSession] closeSession error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[AuditSession] closeSession unexpected error:', err)
    return false
  }
}

/**
 * Get the current active session for a user at a specific shop.
 * Returns null if no active session exists.
 *
 * @param {string} userId  - The auth user's UUID
 * @param {string} shopId  - The shop UUID
 * @returns {object|null}
 */
export async function getActiveSession(userId, shopId) {
  if (!userId || !shopId || shopId === 'all') return null

  try {
    const { data, error } = await supabase
      .from('employee_sessions')
      .select('*')
      .eq('employee_id', userId)
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .order('login_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[AuditSession] getActiveSession error:', error)
      return null
    }

    return data || null
  } catch (err) {
    console.error('[AuditSession] getActiveSession unexpected error:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// AUDIT EVENT LOGGING
// ─────────────────────────────────────────────────────────────

/**
 * Write an event to the audit_logs table.
 * This function is fire-and-forget — errors are swallowed so they
 * never block the main user interaction.
 *
 * @param {object} params
 * @param {string} params.shopId        - Shop UUID
 * @param {string} params.actionType    - One of: LOGIN|LOGOUT|SALE|PURCHASE|EXPENSE|ADJUSTMENT|STOCK_ADD|OTHER
 * @param {object} params.profile       - User profile { id, full_name, role }
 * @param {string} [params.sessionId]   - Active session UUID (optional)
 * @param {string} params.description   - Human-readable description of the action
 * @param {object} [params.metadata]    - Any extra data (sale_id, amount, product_name…)
 */
export async function logAuditEvent({
  shopId,
  actionType,
  profile,
  sessionId = null,
  description,
  metadata   = null,
}) {
  if (!shopId || !actionType || !profile?.id || !description) {
    console.warn('[AuditSession] logAuditEvent: missing required fields, skipping.')
    return
  }

  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        shop_id:       shopId,
        action_type:   actionType,
        employee_id:   profile.id,
        employee_name: profile.full_name || 'Unknown',
        employee_role: profile.role      || 'Cashier',
        session_id:    sessionId,
        description,
        metadata:      metadata ? metadata : null,
        created_at:    new Date().toISOString()
      }])

    if (error) {
      // Non-fatal: log but don't throw
      console.warn('[AuditSession] logAuditEvent error (non-fatal):', error)
    }
  } catch (err) {
    console.warn('[AuditSession] logAuditEvent unexpected error (non-fatal):', err)
  }
}

// ─────────────────────────────────────────────────────────────
// QUERY HELPERS (used by AuditDashboard)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch audit logs with flexible filters.
 *
 * @param {object} filters
 * @param {string}  filters.shopId
 * @param {string}  [filters.employeeId]
 * @param {string}  [filters.actionType]
 * @param {string}  [filters.dateFrom]    - ISO date string
 * @param {string}  [filters.dateTo]      - ISO date string
 * @param {number}  [filters.limit=100]
 * @returns {Array}
 */
export async function fetchAuditLogs({ shopId, employeeId, actionType, dateFrom, dateTo, limit = 100 }) {
  if (!shopId) return []
  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (shopId !== 'all') query = query.eq('shop_id', shopId)
    if (employeeId)        query = query.eq('employee_id', employeeId)
    if (actionType)        query = query.eq('action_type', actionType)
    if (dateFrom)          query = query.gte('created_at', dateFrom)
    if (dateTo)            query = query.lte('created_at', dateTo + 'T23:59:59Z')

    const { data, error } = await query
    if (error) { console.error('[AuditSession] fetchAuditLogs error:', error); return [] }
    return data || []
  } catch (err) {
    console.error('[AuditSession] fetchAuditLogs unexpected error:', err)
    return []
  }
}

/**
 * Fetch all sales for a specific product (Product Timeline).
 *
 * @param {string} shopId
 * @param {string} productId
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 * @returns {Array}
 */
export async function fetchProductSalesHistory({ shopId, productId, dateFrom, dateTo }) {
  if (!shopId || !productId) return []
  try {
    let query = supabase
      .from('sale_items')
      .select(`
        id,
        quantity,
        unit_price,
        total_price,
        created_at,
        sale:sales (
          id,
          created_at,
          employee_name,
          session_id,
          payment_method,
          created_by
        )
      `)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59Z')

    const { data, error } = await query
    if (error) { console.error('[AuditSession] fetchProductSalesHistory error:', error); return [] }
    return data || []
  } catch (err) {
    console.error('[AuditSession] fetchProductSalesHistory unexpected error:', err)
    return []
  }
}

/**
 * Fetch all sessions for a shop (Active Sessions panel).
 *
 * @param {string} shopId
 * @param {string} [statusFilter]  - 'active' | 'closed' | undefined (all)
 * @returns {Array}
 */
export async function fetchSessions({ shopId, statusFilter }) {
  if (!shopId || shopId === 'all') return []
  try {
    let query = supabase
      .from('employee_sessions')
      .select('*')
      .eq('shop_id', shopId)
      .order('login_time', { ascending: false })
      .limit(100)

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) { console.error('[AuditSession] fetchSessions error:', error); return [] }
    return data || []
  } catch (err) {
    console.error('[AuditSession] fetchSessions unexpected error:', err)
    return []
  }
}

/**
 * Fetch sales attributed to a specific employee (Employee History).
 *
 * @param {string} shopId
 * @param {string} employeeId
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 * @returns {Array}
 */
export async function fetchEmployeeSalesHistory({ shopId, employeeId, dateFrom, dateTo }) {
  if (!shopId || !employeeId) return []
  try {
    let query = supabase
      .from('sales')
      .select(`
        id,
        total_amount,
        payment_method,
        created_at,
        employee_name,
        session_id,
        created_by,
        customer:customers(name),
        sale_items(
          quantity,
          unit_price,
          total_price,
          product:products(name)
        )
      `)
      .eq('shop_id', shopId)
      .eq('created_by', employeeId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59Z')

    const { data, error } = await query
    if (error) { console.error('[AuditSession] fetchEmployeeSalesHistory error:', error); return [] }
    return data || []
  } catch (err) {
    console.error('[AuditSession] fetchEmployeeSalesHistory unexpected error:', err)
    return []
  }
}
