/**
 * AuditDashboard.jsx
 * ──────────────────
 * Owner-only page. A premium "digital audit book" with 4 panels:
 *
 *  1. 📋 Recent Activity   — all audit_log entries
 *  2. 👤 Employee History  — filter by employee → see their actions & sales
 *  3. 📦 Product Timeline  — select a product → full sales history
 *  4. 🔐 Active Sessions   — who is currently logged in
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardList, UserCheck, Package, Shield,
  RefreshCw, Calendar, Search, Filter,
  LogIn, LogOut, ShoppingCart, ChevronDown,
  Clock, User, Layers, AlertTriangle, CheckCircle2,
  TrendingUp, BarChart3
} from 'lucide-react'
import { useShop } from '../context/ShopContext'
import { supabase } from '../lib/supabaseClient'
import {
  fetchAuditLogs,
  fetchProductSalesHistory,
  fetchSessions,
  fetchEmployeeSalesHistory
} from '../lib/auditSession'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',  label: 'Recent Activity',   icon: ClipboardList },
  { id: 'employee',  label: 'Employee History',  icon: UserCheck },
  { id: 'product',   label: 'Product Timeline',  icon: Package },
  { id: 'sessions',  label: 'Active Sessions',   icon: Shield },
]

const ACTION_COLORS = {
  LOGIN:       { bg: '#e0f2f1', color: '#00695c', dark_bg: 'rgba(0,105,92,0.18)', dark_color: '#4db6ac' },
  LOGOUT:      { bg: '#fce4ec', color: '#c62828', dark_bg: 'rgba(198,40,40,0.18)', dark_color: '#ef9a9a' },
  SALE:        { bg: '#e8f5e9', color: '#2e7d32', dark_bg: 'rgba(46,125,50,0.18)', dark_color: '#81c784' },
  PURCHASE:    { bg: '#e3f2fd', color: '#1565c0', dark_bg: 'rgba(21,101,192,0.18)', dark_color: '#64b5f6' },
  EXPENSE:     { bg: '#fff3e0', color: '#e65100', dark_bg: 'rgba(230,81,0,0.18)', dark_color: '#ffb74d' },
  ADJUSTMENT:  { bg: '#f3e5f5', color: '#6a1b9a', dark_bg: 'rgba(106,27,154,0.18)', dark_color: '#ce93d8' },
  STOCK_ADD:   { bg: '#e8eaf6', color: '#283593', dark_bg: 'rgba(40,53,147,0.18)', dark_color: '#9fa8da' },
  OTHER:       { bg: '#eceff1', color: '#546e7a', dark_bg: 'rgba(84,110,122,0.18)', dark_color: '#b0bec5' },
}

const ACTION_ICONS = {
  LOGIN:      LogIn,
  LOGOUT:     LogOut,
  SALE:       ShoppingCart,
  PURCHASE:   Package,
  EXPENSE:    TrendingUp,
  ADJUSTMENT: Layers,
  STOCK_ADD:  Package,
  OTHER:      ClipboardList,
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const fmtDuration = (loginIso, logoutIso) => {
  if (!loginIso) return '—'
  const end = logoutIso ? new Date(logoutIso) : new Date()
  const ms  = end - new Date(loginIso)
  const h   = Math.floor(ms / 3600000)
  const m   = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const shortId = (uuid) => uuid ? uuid.slice(-8).toUpperCase() : '—'

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

/** Action badge chip */
const ActionBadge = ({ type, isDark }) => {
  const c = ACTION_COLORS[type] || ACTION_COLORS.OTHER
  const Icon = ACTION_ICONS[type] || ClipboardList
  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            '4px',
      padding:        '3px 10px',
      borderRadius:   '20px',
      fontSize:       '11px',
      fontWeight:     '700',
      letterSpacing:  '0.03em',
      background:     isDark ? c.dark_bg   : c.bg,
      color:          isDark ? c.dark_color : c.color,
      whiteSpace:     'nowrap',
    }}>
      <Icon size={11} />
      {type}
    </span>
  )
}

/** Generic loading skeleton row */
const SkeletonRows = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} style={{
        height: '56px', borderRadius: '12px', background: 'var(--surface-muted)',
        animation: 'auditPulse 1.4s ease infinite', animationDelay: `${i * 0.1}s`
      }} />
    ))}
  </div>
)

/** Empty state component */
const EmptyState = ({ icon: Icon, message }) => (
  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
    <Icon size={48} style={{ opacity: 0.15, margin: '0 auto 16px', display: 'block' }} />
    <p style={{ fontSize: '14px' }}>{message}</p>
  </div>
)

/** Filter bar — shared across tabs */
const FilterBar = ({ filters, setFilters, showEmployeeFilter, employees }) => (
  <div style={{
    display:      'flex',
    gap:          '10px',
    flexWrap:     'wrap',
    padding:      '14px 16px',
    background:   'var(--surface-muted)',
    borderRadius: '12px',
    marginBottom: '20px',
    alignItems:   'center',
  }}>
    <Filter size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

    {/* Date From */}
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
      <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
      <input
        type="date"
        value={filters.dateFrom}
        onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
        style={{
          padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface-elevated)', color: 'var(--text-main)', fontSize: '13px'
        }}
      />
    </label>

    {/* Date To */}
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
      <input
        type="date"
        value={filters.dateTo}
        onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
        style={{
          padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface-elevated)', color: 'var(--text-main)', fontSize: '13px'
        }}
      />
    </label>

    {/* Employee filter */}
    {showEmployeeFilter && employees.length > 0 && (
      <select
        value={filters.employeeId}
        onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))}
        style={{
          padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface-elevated)', color: 'var(--text-main)', fontSize: '13px'
        }}
      >
        <option value="">All Employees</option>
        {employees.map(e => (
          <option key={e.id} value={e.id}>{e.full_name}</option>
        ))}
      </select>
    )}

    {/* Clear */}
    <button
      onClick={() => setFilters({ dateFrom: '', dateTo: '', employeeId: '', actionType: '' })}
      style={{
        marginLeft: 'auto', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)',
        background: 'var(--surface-elevated)', color: 'var(--text-muted)', fontSize: '12px',
        cursor: 'pointer', fontWeight: '600'
      }}
    >
      Clear
    </button>
  </div>
)

// ─────────────────────────────────────────────────────────────
// TAB: RECENT ACTIVITY
// ─────────────────────────────────────────────────────────────
const ActivityTab = ({ shopId, employees, isDark, formatCurrency }) => {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', employeeId: '', actionType: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchAuditLogs({
      shopId,
      employeeId: filters.employeeId || undefined,
      actionType: filters.actionType || undefined,
      dateFrom:   filters.dateFrom   || undefined,
      dateTo:     filters.dateTo     || undefined,
      limit: 150,
    })
    setLogs(data)
    setLoading(false)
  }, [shopId, filters])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} showEmployeeFilter employees={employees} />

      {/* Action type quick-filter pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {['', 'LOGIN', 'LOGOUT', 'SALE', 'PURCHASE', 'EXPENSE', 'ADJUSTMENT'].map(type => (
          <button
            key={type || 'ALL'}
            onClick={() => setFilters(f => ({ ...f, actionType: type }))}
            style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s',
              background: filters.actionType === type ? 'var(--primary)' : 'var(--surface-elevated)',
              color:      filters.actionType === type ? 'white'          : 'var(--text-muted)',
            }}
          >
            {type || 'All'}
          </button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: 'auto', padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
            border: '1px solid var(--border)', cursor: 'pointer',
            background: 'var(--surface-elevated)', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '5px'
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? <SkeletonRows /> : logs.length === 0 ? (
        <EmptyState icon={ClipboardList} message="No audit events found for the selected filters." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {logs.map(log => {
            const Icon = ACTION_ICONS[log.action_type] || ClipboardList
            const c    = ACTION_COLORS[log.action_type] || ACTION_COLORS.OTHER
            return (
              <div key={log.id} style={{
                display:      'flex',
                gap:          '14px',
                alignItems:   'flex-start',
                padding:      '14px 16px',
                borderRadius: '12px',
                background:   'var(--surface-elevated)',
                border:       '1px solid var(--border)',
                transition:   'all 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {/* Icon */}
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                  background: isDark ? c.dark_bg   : c.bg,
                  color:      isDark ? c.dark_color : c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Icon size={18} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <ActionBadge type={log.action_type} isDark={isDark} />
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>{log.employee_name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {log.employee_role}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px', lineHeight: 1.4 }}>
                    {log.description}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span><Clock size={10} style={{ marginRight: '3px' }} />{fmtTime(log.created_at)}</span>
                    {log.session_id && (
                      <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                        Session: {shortId(log.session_id)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: EMPLOYEE HISTORY
// ─────────────────────────────────────────────────────────────
const EmployeeTab = ({ shopId, employees, isDark, formatCurrency }) => {
  const [selectedId, setSelectedId] = useState('')
  const [sales,    setSales]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [filters, setFilters]   = useState({ dateFrom: '', dateTo: '', employeeId: '', actionType: '' })

  const load = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    const data = await fetchEmployeeSalesHistory({
      shopId,
      employeeId: selectedId,
      dateFrom: filters.dateFrom || undefined,
      dateTo:   filters.dateTo   || undefined,
    })
    setSales(data)
    setLoading(false)
  }, [shopId, selectedId, filters.dateFrom, filters.dateTo])

  useEffect(() => { load() }, [load])

  const totalSales = useMemo(() => sales.reduce((s, r) => s + Number(r.total_amount || 0), 0), [sales])

  return (
    <div>
      {/* Employee selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setSales([]) }}
            style={{
              width: '100%', padding: '12px 12px 12px 38px', borderRadius: '12px',
              border: '1px solid var(--border)', fontSize: '14px', fontWeight: '600',
              background: 'var(--surface-elevated)', color: 'var(--text-main)',
              appearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Select an Employee —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>)}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} showEmployeeFilter={false} employees={[]} />

      {!selectedId ? (
        <EmptyState icon={UserCheck} message="Select an employee above to view their full sales history." />
      ) : loading ? (
        <SkeletonRows />
      ) : sales.length === 0 ? (
        <EmptyState icon={ShoppingCart} message="No sales found for this employee in the selected period." />
      ) : (
        <>
          {/* Summary strip */}
          <div style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px',
            padding: '16px 20px', borderRadius: '12px',
            background: isDark ? 'rgba(230,184,13,0.08)' : 'rgba(230,184,13,0.06)',
            border: '1px solid rgba(230,184,13,0.25)',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Sales</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{sales.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue Generated</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success)' }}>{formatCurrency(totalSales)}</div>
            </div>
          </div>

          {/* Sales list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sales.map(sale => (
              <div key={sale.id} style={{
                padding: '14px 16px', borderRadius: '12px',
                background: 'var(--surface-elevated)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--primary)' }}>
                      {formatCurrency(sale.total_amount)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <Clock size={10} style={{ marginRight: '3px' }} />{fmtTime(sale.created_at)}
                      {sale.customer?.name && <span style={{ marginLeft: '8px' }}>• {sale.customer.name}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                      background: 'var(--surface-muted)', color: 'var(--text-muted)'
                    }}>
                      {sale.payment_method}
                    </span>
                    {sale.session_id && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>
                        Session: {shortId(sale.session_id)}
                      </div>
                    )}
                  </div>
                </div>
                {/* Items */}
                {sale.sale_items?.length > 0 && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                    {sale.sale_items.map((si, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', padding: '2px 0' }}>
                        <span>{si.product?.name || 'Unknown item'} × {si.quantity}</span>
                        <span>{formatCurrency(si.total_price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: PRODUCT TIMELINE
// ─────────────────────────────────────────────────────────────
const ProductTab = ({ shopId, isDark, formatCurrency }) => {
  const [products,    setProducts]    = useState([])
  const [selectedId,  setSelectedId]  = useState('')
  const [history,     setHistory]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [filters,     setFilters]     = useState({ dateFrom: '', dateTo: '', employeeId: '', actionType: '' })

  // Load product list once
  useEffect(() => {
    if (!shopId || shopId === 'all') return
    supabase.from('products').select('id, name, category').eq('shop_id', shopId).order('name')
      .then(({ data }) => setProducts(data || []))
  }, [shopId])

  const filteredProducts = useMemo(() =>
    products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [products, search])

  const load = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    const data = await fetchProductSalesHistory({
      shopId, productId: selectedId,
      dateFrom: filters.dateFrom || undefined,
      dateTo:   filters.dateTo   || undefined,
    })
    setHistory(data)
    setLoading(false)
  }, [shopId, selectedId, filters.dateFrom, filters.dateTo])

  useEffect(() => { load() }, [load])

  const totalQty    = useMemo(() => history.reduce((s, r) => s + Number(r.quantity || 0), 0), [history])
  const totalRevenue = useMemo(() => history.reduce((s, r) => s + Number(r.total_price || 0), 0), [history])
  const selectedProduct = products.find(p => p.id === selectedId)

  return (
    <div>
      {/* Product search + select */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product..."
            style={{
              width: '100%', padding: '12px 12px 12px 38px', borderRadius: '12px',
              border: '1px solid var(--border)', fontSize: '14px',
              background: 'var(--surface-elevated)', color: 'var(--text-main)',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Package size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setHistory([]) }}
            style={{
              width: '100%', padding: '12px 12px 12px 38px', borderRadius: '12px',
              border: '1px solid var(--border)', fontSize: '14px',
              background: 'var(--surface-elevated)', color: 'var(--text-main)',
              appearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Select a Product —</option>
            {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} showEmployeeFilter={false} employees={[]} />

      {!selectedId ? (
        <EmptyState icon={Package} message="Select a product above to view its complete sales timeline." />
      ) : loading ? (
        <SkeletonRows />
      ) : history.length === 0 ? (
        <EmptyState icon={BarChart3} message="No sales recorded for this product in the selected period." />
      ) : (
        <>
          {/* Summary strip */}
          <div style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px',
            padding: '16px 20px', borderRadius: '12px',
            background: isDark ? 'rgba(230,184,13,0.08)' : 'rgba(230,184,13,0.06)',
            border: '1px solid rgba(230,184,13,0.25)',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Product</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{selectedProduct?.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Units Sold</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{totalQty}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success)' }}>{formatCurrency(totalRevenue)}</div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: '28px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute', left: '11px', top: 0, bottom: 0,
              width: '2px', background: 'var(--border)', borderRadius: '1px'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {history.map((item, idx) => (
                <div key={item.id || idx} style={{ position: 'relative' }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', left: '-20px', top: '16px',
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--primary)', border: '2px solid var(--bg-main)',
                    boxShadow: '0 0 0 2px var(--primary)',
                  }} />
                  <div style={{
                    padding: '12px 16px', borderRadius: '12px',
                    background: 'var(--surface-elevated)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--primary)' }}>
                          {item.quantity} units
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          @ {formatCurrency(item.unit_price)} each
                        </span>
                      </div>
                      <span style={{ fontWeight: '700', color: 'var(--success)', fontSize: '14px' }}>
                        {formatCurrency(item.total_price)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span><Clock size={10} style={{ marginRight: '3px' }} />{fmtTime(item.sale?.created_at)}</span>
                      {item.sale?.employee_name && (
                        <span><User size={10} style={{ marginRight: '3px' }} />{item.sale.employee_name}</span>
                      )}
                      {item.sale?.session_id && (
                        <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                          Session: {shortId(item.sale.session_id)}
                        </span>
                      )}
                      {item.sale?.payment_method && (
                        <span style={{
                          padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                          background: 'var(--surface-muted)', color: 'var(--text-muted)'
                        }}>{item.sale.payment_method}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: ACTIVE SESSIONS
// ─────────────────────────────────────────────────────────────
const SessionsTab = ({ shopId, isDark }) => {
  const [sessions,      setSessions]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [statusFilter,  setStatusFilter]  = useState('active')

  const load = useCallback(async () => {
    if (!shopId || shopId === 'all') return
    setLoading(true)
    const data = await fetchSessions({ shopId, statusFilter: statusFilter || undefined })
    setSessions(data)
    setLoading(false)
  }, [shopId, statusFilter])

  useEffect(() => { load() }, [load])

  const activeSessions = sessions.filter(s => s.status === 'active')
  const closedSessions = sessions.filter(s => s.status === 'closed')

  return (
    <div>
      {/* Status toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        {[['active', 'Active Now'], ['closed', 'Closed Today'], ['', 'All']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            style={{
              padding: '8px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s',
              background: statusFilter === val ? 'var(--primary)' : 'var(--surface-elevated)',
              color:      statusFilter === val ? 'white'          : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: 'auto', padding: '8px 14px', borderRadius: '20px', fontSize: '12px',
            border: '1px solid var(--border)', background: 'var(--surface-elevated)',
            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Live count banner */}
      {statusFilter === 'active' && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderRadius: '12px', marginBottom: '20px',
          background: activeSessions.length > 0
            ? (isDark ? 'rgba(46,125,50,0.15)' : '#e8f5e9')
            : (isDark ? 'rgba(84,110,122,0.15)' : '#eceff1'),
          border: `1px solid ${activeSessions.length > 0 ? 'rgba(46,125,50,0.3)' : 'var(--border)'}`,
        }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: activeSessions.length > 0 ? 'var(--success)' : 'var(--text-muted)',
            animation: activeSessions.length > 0 ? 'auditPulse-dot 1.5s ease infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: '600', fontSize: '14px' }}>
            {activeSessions.length === 0
              ? 'No employees currently logged in'
              : `${activeSessions.length} employee${activeSessions.length > 1 ? 's' : ''} currently active`}
          </span>
        </div>
      )}

      {loading ? <SkeletonRows /> : sessions.length === 0 ? (
        <EmptyState icon={Shield} message="No sessions found for the selected filter." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sessions.map(session => (
            <div key={session.id} style={{
              padding: '16px', borderRadius: '14px',
              background: 'var(--surface-elevated)', border: '1px solid var(--border)',
              display: 'flex', gap: '14px', alignItems: 'flex-start',
            }}>
              {/* Avatar */}
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                background: session.status === 'active'
                  ? (isDark ? 'rgba(46,125,50,0.2)' : '#e8f5e9')
                  : (isDark ? 'rgba(84,110,122,0.15)' : '#eceff1'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: session.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                fontSize: '18px', fontWeight: '700',
              }}>
                {session.employee_name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>{session.employee_name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {session.employee_role}
                    </span>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                    background: session.status === 'active'
                      ? (isDark ? 'rgba(46,125,50,0.25)' : '#c8e6c9')
                      : (isDark ? 'rgba(84,110,122,0.2)' : '#eceff1'),
                    color: session.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                  }}>
                    {session.status === 'active' ? '🟢 Active' : '⚫ Closed'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>
                    <LogIn size={11} style={{ marginRight: '3px' }} />
                    Login: {fmtTime(session.login_time)}
                  </span>
                  {session.logout_time ? (
                    <span>
                      <LogOut size={11} style={{ marginRight: '3px' }} />
                      Logout: {fmtTime(session.logout_time)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>Currently logged in</span>
                  )}
                  <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                    Duration: {fmtDuration(session.login_time, session.logout_time)}
                  </span>
                  <span style={{ fontFamily: 'monospace', opacity: 0.6, fontSize: '10px' }}>
                    ID: {shortId(session.id)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────
export default function AuditDashboard() {
  const { currentShop, userProfile, formatCurrency, themePreference } = useShop()
  const [activeTab,  setActiveTab]  = useState('activity')
  const [employees,  setEmployees]  = useState([])
  const [stats,      setStats]      = useState({ sessions: 0, events: 0, sales: 0 })
  const isDark = themePreference === 'dark'

  // Gate: Owner-only
  if (userProfile && userProfile.role !== 'Owner') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ color: 'var(--text-muted)' }}>The Audit Dashboard is available to shop Owners only.</p>
      </div>
    )
  }

  // Fetch employee list for the shop
  useEffect(() => {
    if (!currentShop?.id || currentShop.id === 'all') return
    supabase.from('profiles').select('id, full_name, role')
      .eq('shop_id', currentShop.id)
      .order('full_name')
      .then(({ data }) => setEmployees(data || []))
  }, [currentShop?.id])

  // Quick stats
  useEffect(() => {
    if (!currentShop?.id || currentShop.id === 'all') return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    Promise.all([
      supabase.from('employee_sessions').select('id', { count: 'exact', head: true })
        .eq('shop_id', currentShop.id).eq('status', 'active'),
      supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        .eq('shop_id', currentShop.id).gte('created_at', todayIso),
      supabase.from('sales').select('id', { count: 'exact', head: true })
        .eq('shop_id', currentShop.id).gte('created_at', todayIso),
    ]).then(([sRes, eRes, saRes]) => {
      setStats({
        sessions: sRes.count ?? 0,
        events:   eRes.count ?? 0,
        sales:    saRes.count ?? 0,
      })
    })
  }, [currentShop?.id])

  const shopId = currentShop?.id

  return (
    <div>
      {/* ── Page Header ──────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: isDark ? 'rgba(230,184,13,0.18)' : 'rgba(230,184,13,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)',
          }}>
            <ClipboardList size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', margin: 0 }}>Audit & Activity Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              Complete accountability trail — who did what, when, and in which session.
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ──────────────────────────────────────── */}
      <div style={{
        display:               'grid',
        gridTemplateColumns:   'repeat(auto-fit, minmax(170px, 1fr))',
        gap:                   '14px',
        marginBottom:          '28px',
      }}>
        {[
          { label: 'Active Sessions',  value: stats.sessions, icon: Shield,       color: 'var(--success)' },
          { label: "Today's Events",   value: stats.events,   icon: ClipboardList, color: 'var(--primary)' },
          { label: "Today's Sales",    value: stats.sales,    icon: ShoppingCart,  color: 'var(--info)' },
          { label: 'Staff On Record',  value: employees.length, icon: UserCheck,   color: '#9c27b0' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{
            padding: '18px 20px', borderRadius: '16px',
            background:  'var(--surface-elevated)',
            border:      '1px solid var(--border)',
            display:     'flex', alignItems: 'center', gap: '14px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
              background: `${color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color,
            }}>
              <Icon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{label}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Panel ───────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{
          display:         'flex',
          gap:             '0',
          borderBottom:    '1px solid var(--border)',
          overflowX:       'auto',
          scrollbarWidth:  'none',
        }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                flex:            '1 0 auto',
                padding:         '16px 20px',
                border:          'none',
                borderBottom:    activeTab === id ? '3px solid var(--primary)' : '3px solid transparent',
                background:      activeTab === id
                  ? (isDark ? 'rgba(230,184,13,0.07)' : 'rgba(230,184,13,0.05)')
                  : 'transparent',
                color:           activeTab === id ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight:      activeTab === id ? '700' : '500',
                cursor:          'pointer',
                fontSize:        '13px',
                display:         'flex',
                alignItems:      'center',
                gap:             '8px',
                whiteSpace:      'nowrap',
                transition:      'all 0.2s',
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'activity' && (
            <ActivityTab shopId={shopId} employees={employees} isDark={isDark} formatCurrency={formatCurrency} />
          )}
          {activeTab === 'employee' && (
            <EmployeeTab shopId={shopId} employees={employees} isDark={isDark} formatCurrency={formatCurrency} />
          )}
          {activeTab === 'product' && (
            <ProductTab shopId={shopId} isDark={isDark} formatCurrency={formatCurrency} />
          )}
          {activeTab === 'sessions' && (
            <SessionsTab shopId={shopId} isDark={isDark} />
          )}
        </div>
      </div>

      {/* ── Keyframe Styles ──────────────────────────────────── */}
      <style>{`
        @keyframes auditPulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }
        @keyframes auditPulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,50,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(46,125,50,0); }
        }
      `}</style>
    </div>
  )
}
