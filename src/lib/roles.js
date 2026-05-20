/**
 * roles.js  — Extended Role-Based Access Control
 * ────────────────────────────────────────────────
 * Single source of truth for every role permission check in the app.
 *
 * Role hierarchy (highest → lowest):
 *   Owner > Manager > Cashier
 *
 * Route access matrix:
 *   R = Read  W = Write  - = Denied
 *
 *   Route          Owner  Manager  Cashier
 *   ─────────────────────────────────────
 *   /dashboard       R      R        -
 *   /inventory       RW     RW       R
 *   /sales           RW     RW       RW
 *   /purchases       RW     RW       -
 *   /customers       RW     RW       R
 *   /suppliers       RW     RW       -
 *   /reports         R      R        -
 *   /staff           RW     -        -
 *   /shops           RW     -        -
 *   /services        RW     RW       -
 *   /credit          RW     RW       -
 *   /deliveries      RW     RW       -
 *   /expenses        RW     RW       RW
 *   /settings        RW     -        -
 *   /audit           RW     -        -
 */

// ─────────────────────────────────────────────────────────────
// ROLE SETS
// ─────────────────────────────────────────────────────────────

export const ROLES = {
  OWNER:   'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
}

export const MANAGEMENT_ROLES = new Set([ROLES.OWNER, ROLES.MANAGER])

export const isManagementRole = (role) => MANAGEMENT_ROLES.has(role)

// ─────────────────────────────────────────────────────────────
// ROUTE → ALLOWED ROLES MAP
// ─────────────────────────────────────────────────────────────

/**
 * Maps each route path to the roles that may access it.
 * Absence from this map = accessible by any authenticated user.
 *
 * If a role is not listed, they see an "Access Denied" screen.
 */
export const ROUTE_ROLES = {
  'dashboard':    [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'inventory':    [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'sales':        [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'purchases':    [ROLES.OWNER, ROLES.MANAGER],
  'customers':    [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'suppliers':    [ROLES.OWNER, ROLES.MANAGER],
  'reports':      [ROLES.OWNER, ROLES.MANAGER],
  'staff':        [ROLES.OWNER],
  'shops':        [ROLES.OWNER],
  'services':     [ROLES.OWNER, ROLES.MANAGER],
  'credit':       [ROLES.OWNER, ROLES.MANAGER],
  'deliveries':   [ROLES.OWNER, ROLES.MANAGER],
  'expenses':     [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'settings':     [ROLES.OWNER],
  'audit':        [ROLES.OWNER],
}

/**
 * Check whether a role is allowed to access a specific route.
 *
 * @param {string}   role        - e.g. 'Owner', 'Cashier'
 * @param {string}   routePath   - e.g. 'audit', 'sales'
 * @returns {boolean}
 */
export const canAccessRoute = (role, routePath) => {
  const allowed = ROUTE_ROLES[routePath]
  if (!allowed) return true  // not restricted — allow all authenticated users
  return allowed.includes(role)
}

/**
 * Get the default landing route for a role after login.
 *
 * @param {string} role
 * @returns {string}
 */
export const getDefaultRoute = (role) => {
  return '/dashboard'
}

// ─────────────────────────────────────────────────────────────
// FINANCIAL DATA VISIBILITY
// ─────────────────────────────────────────────────────────────

/**
 * Whether a role can see full monetary/financial figures.
 * Cashiers see masked values (e.g. "••••") instead of real amounts.
 *
 * @param {string} role
 * @returns {boolean}
 */
export const canViewFinancials = (role) =>
  role === ROLES.OWNER || role === ROLES.MANAGER

/**
 * Whether a role can see profit margins / cost prices.
 *
 * @param {string} role
 * @returns {boolean}
 */
export const canViewCostPrices = (role) => role === ROLES.OWNER

/**
 * Whether a role can see other staff members' salaries.
 *
 * @param {string} role
 * @returns {boolean}
 */
export const canViewSalaries = (role) => role === ROLES.OWNER

// ─────────────────────────────────────────────────────────────
// ACTION PERMISSIONS
// ─────────────────────────────────────────────────────────────

// All authenticated users can LOG expenses
export const canCreateExpenses = () => true

// Only management can EDIT or DELETE expenses
export const canEditExpenses   = (role) => isManagementRole(role)

// Only Owner can manage staff accounts
export const canManageStaff    = (role) => role === ROLES.OWNER

// Only Owner can delete shops or products permanently
export const canDelete         = (role) => role === ROLES.OWNER

// Cashiers cannot apply manual discounts
export const canApplyDiscount  = (role) => isManagementRole(role)

// Only Owner/Manager can approve purchases
export const canApprovePurchase = (role) => isManagementRole(role)

// Only Owner can export full reports
export const canExportReports  = (role) => role === ROLES.OWNER
