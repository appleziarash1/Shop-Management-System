import React, { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Package, ShoppingCart, AlertCircle, FileText, ShoppingBag, ArrowRight, ArrowLeft, User, Briefcase, Receipt, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format } from 'date-fns'
import { calculateStandardEconomics } from '../lib/finance'
import { isManagementRole } from '../lib/roles'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { isOnline, setManualOffline, getQueueCount, processSyncQueue } from '../lib/offlineQueue'

const Dashboard = () => {
  const { currentShop, shops, userProfile, isCurrentDayClosed, closeDay, unlockDay, formatCurrency } = useShop()
  const [stats, setStats] = useState({
    totalSales: 0,
    transactions: 0,
    activeProducts: 0,
    activeServices: 0,
    lowStock: 0,
    inventoryValue: 0,
    estimatedProfit: 0,
    totalCOGS: 0,
    totalExpenses: 0,
    netProfit: 0,
    shopSummaries: [],
    soldToday: { revenue: 0, count: 0 },
    todayServices: [],
    receiptsCount: 0,
    receiptsAmount: 0,
    receiptsToday: [],
    todayCOGS: 0,
    todayExpenses: 0,
    todayNetProfit: 0
  })
  const [recentSales, setRecentSales] = useState([])
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [loading, setLoading] = useState(true)

  // Network/Sync State
  const [isNetworkOnline, setIsNetworkOnline] = useState(isOnline())
  const [pendingSync, setPendingSync] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')

  const updateSyncCount = useCallback(async () => {
    const count = await getQueueCount()
    setPendingSync(count)
  }, [])

  useEffect(() => {
    const handleOnline = async () => {
      setIsNetworkOnline(true)
      setSyncMessage('Syncing offline data...')
      const results = await processSyncQueue((msg) => setSyncMessage(msg))
      setSyncMessage(results.success > 0 ? `Successfully synced ${results.success} items!` : '')
      updateSyncCount()
      setTimeout(() => setSyncMessage(''), 4000)
    }
    const handleOffline = () => setIsNetworkOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    updateSyncCount()
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateSyncCount])

  const fetchDashboardData = useCallback(async () => {
    if (!currentShop) return
    setLoading(true)
    try {
      const selectedShopIds = currentShop.id === 'all'
        ? shops.map((shop) => shop.id).filter(Boolean)
        : [currentShop.id]

      if (!selectedShopIds.length) {
        setStats({
          totalSales: 0,
          transactions: 0,
          activeProducts: 0,
          activeServices: 0,
          lowStock: 0,
          inventoryValue: 0,
          estimatedProfit: 0,
          totalCOGS: 0,
          totalExpenses: 0,
          netProfit: 0,
          shopSummaries: [],
          soldToday: { revenue: 0, count: 0 },
          todayServices: [],
          receiptsCount: 0,
          receiptsAmount: 0,
          receiptsToday: [],
          todayCOGS: 0,
          todayExpenses: 0,
          todayNetProfit: 0
        })
        setRecentSales([])
        return
      }

      const applyShopFilter = (query) => (
        currentShop.id === 'all'
          ? query.in('shop_id', selectedShopIds)
          : query.eq('shop_id', currentShop.id)
      )

      const fetchSalesData = async () => {
        let salesQuery = applyShopFilter(
          supabase.from('sales').select(`
            shop_id, 
            id,
            total_amount, 
            created_at, 
            receipt_printed,
            payment_method,
            customers (name),
            sale_items (
              id,
              total_price,
              unit_price,
              cost_price,
              service_id,
              quantity,
              product_id,
              services (name),
              profiles:staff_id (full_name),
              products (cost_price)
            )
          `).order('created_at', { ascending: false })
        )

        let { data: salesData, error: salesError } = await salesQuery

        if (salesError && (salesError.message?.includes('receipt_printed') || salesError.code === '42703')) {
          const retryResult = await applyShopFilter(
            supabase.from('sales').select(`
              shop_id, 
              id,
              total_amount, 
              created_at,
              payment_method,
              customers (name),
              sale_items (
                id,
                total_price,
                unit_price,
                cost_price,
                service_id,
                quantity,
                product_id,
                services (name),
                profiles:staff_id (full_name),
                products (cost_price)
              )
            `).order('created_at', { ascending: false })
          )

          if (retryResult.error) throw retryResult.error
          salesData = retryResult.data
        } else if (salesError) {
          throw salesError
        }

        return salesData || []
      }

      const [salesData, productsResponse, servicesResponse, expensesResponse] = await Promise.all([
        fetchSalesData(),
        applyShopFilter(supabase.from('products').select('shop_id, quantity, min_quantity, cost_price, selling_price')),
        applyShopFilter(supabase.from('services').select('id, is_active, shop_id')),
        applyShopFilter(supabase.from('expenses').select('amount, shop_id, expense_date'))
      ])

      if (productsResponse.error) throw productsResponse.error
      if (servicesResponse.error) throw servicesResponse.error
      if (expensesResponse.error) throw expensesResponse.error

      const productsData = productsResponse.data || []
      const servicesData = servicesResponse.data || []
      const expensesData = expensesResponse.data || []

      const transactions = salesData.length

      // Calculate Sold Today using robust local date comparison
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const todaySales = salesData.filter(s => {
        const d = new Date(s.created_at)
        return d >= todayStart && d <= todayEnd
      })
      
      const todayServiceItems = []
      let receiptsCount = 0
      let receiptsAmount = 0
      const receiptsToday = []
      const salesByShop = new Map()
      const todaySalesByShop = new Map()

      salesData.forEach((sale) => {
        const shopSales = salesByShop.get(sale.shop_id) || []
        shopSales.push(sale)
        salesByShop.set(sale.shop_id, shopSales)
      })

      todaySales.forEach((sale) => {
        const shopTodaySales = todaySalesByShop.get(sale.shop_id) || []
        shopTodaySales.push(sale)
        todaySalesByShop.set(sale.shop_id, shopTodaySales)
        receiptsCount++
        receiptsAmount += Number(sale.total_amount || 0)
        receiptsToday.push({
          id: sale.id,
          created_at: sale.created_at,
          total_amount: Number(sale.total_amount || 0),
          payment_method: sale.payment_method || 'Cash',
          customer_name: sale.customers?.name || 'Walk-in Customer',
          items: (sale.sale_items || []).map((item) => ({
            id: item.id,
            name: item.products?.name || item.services?.name || 'Item',
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            total_price: Number(item.total_price || 0),
            staff_name: item.profiles?.full_name || ''
          }))
        })
        sale.sale_items?.forEach(item => {
          if (item.service_id) {
            todayServiceItems.push({
              ...item,
              created_at: sale.created_at,
              sales: { shop_id: sale.shop_id }
            })
          }
        })
      })

      const activeProducts = productsData?.length || 0
      const lowStock = productsData?.filter(p => p.quantity <= p.min_quantity).length || 0

      let inventoryValue = 0
      let estimatedProfit = 0
      const shopSummariesMap = {}
      const todayDate = format(new Date(), 'yyyy-MM-dd')
      const todayExpensesData = expensesData?.filter(e => e.expense_date === todayDate) || []
      const expensesByShop = new Map()
      const todayExpensesByShop = new Map()

      if (currentShop.id === 'all') {
        shops.forEach(s => {
          shopSummariesMap[s.id] = { 
            id: s.id, 
            name: s.name, 
            location: s.location, 
            revenue: 0, 
            estimatedProfit: 0, 
            lowStock: 0, 
            activeProducts: 0,
            soldToday: { revenue: 0, count: 0 },
            cogs: 0,
            expenses: 0
          }
        })
      }

      salesData.forEach(s => {
        if (currentShop.id === 'all' && shopSummariesMap[s.shop_id]) {
          shopSummariesMap[s.shop_id].revenue += Number(s.total_amount || 0)
          const saleDate = new Date(s.created_at)
          if (saleDate >= todayStart && saleDate <= todayEnd) {
            shopSummariesMap[s.shop_id].soldToday.revenue += Number(s.total_amount || 0)
            shopSummariesMap[s.shop_id].soldToday.count += 1
          }
        }
      })

      productsData?.forEach(p => {
        const qty = Number(p.quantity || 0)
        const cost = Number(p.cost_price || 0)
        const price = Number(p.selling_price || 0)
        const profit = (price - cost) * qty

        inventoryValue += cost * qty
        estimatedProfit += profit

        if (currentShop.id === 'all' && shopSummariesMap[p.shop_id]) {
          shopSummariesMap[p.shop_id].activeProducts += 1
          if (qty <= p.min_quantity) {
            shopSummariesMap[p.shop_id].lowStock += 1
          }
          shopSummariesMap[p.shop_id].estimatedProfit += profit
        }
      })

      const activeServices = servicesData.filter(s => s.is_active).length || 0

      expensesData?.forEach((expense) => {
        const shopExpenses = expensesByShop.get(expense.shop_id) || []
        shopExpenses.push(expense)
        expensesByShop.set(expense.shop_id, shopExpenses)
      })

      todayExpensesData.forEach((expense) => {
        const shopTodayExpenses = todayExpensesByShop.get(expense.shop_id) || []
        shopTodayExpenses.push(expense)
        todayExpensesByShop.set(expense.shop_id, shopTodayExpenses)
      })

      // 5. Compute Economics using Standard Engine
      const allTimeEcon = calculateStandardEconomics(salesData || [], expensesData || [])
      const todayEcon = calculateStandardEconomics(todaySales || [], todayExpensesData || [])

      if (currentShop.id === 'all') {
        Object.keys(shopSummariesMap).forEach(sid => {
          const shopSales = salesByShop.get(sid) || []
          const shopExpenses = expensesByShop.get(sid) || []
          const shopEcon = calculateStandardEconomics(shopSales, shopExpenses)
          
          const todayShopSales = todaySalesByShop.get(sid) || []
          const todayShopExpenses = todayExpensesByShop.get(sid) || []
          const todayShopEcon = calculateStandardEconomics(todayShopSales, todayShopExpenses)

          shopSummariesMap[sid].revenue = shopEcon.revenue
          shopSummariesMap[sid].netProfit = shopEcon.netProfit
          shopSummariesMap[sid].soldToday = { revenue: todayShopEcon.revenue, count: todayShopSales.length }
        })
      }

      setStats({ 
        totalSales: allTimeEcon.revenue, 
        transactions, 
        activeProducts, 
        activeServices,
        lowStock, 
        inventoryValue, 
        estimatedProfit, 
        totalCOGS: allTimeEcon.cogs,
        totalExpenses: allTimeEcon.totalExpenses,
        netProfit: allTimeEcon.netProfit,
        shopSummaries: Object.values(shopSummariesMap),
        soldToday: { revenue: todayEcon.revenue, count: todayEcon.revenue > 0 ? todaySales.length : 0 },
        todayServices: todayServiceItems || [],
        receiptsCount,
        receiptsAmount,
        receiptsToday,
        todayCOGS: todayEcon.cogs,
        todayExpenses: todayEcon.totalExpenses,
        todayNetProfit: todayEcon.netProfit
      })
      setRecentSales(salesData.slice(0, 5))
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [currentShop, shops])

  useEffect(() => {
    if (currentShop) {
      fetchDashboardData()
      updateSyncCount()
    }
  }, [currentShop, fetchDashboardData, updateSyncCount])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
           <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(184, 134, 11, 0.1)', borderTop: '4px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
           <p>Loading dashboard data...</p>
           <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="dashboard-header-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '28px', margin: 0 }}>Business Overview</h1>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {syncMessage && (
            <div style={{ fontSize: '13px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-success-soft)', padding: '6px 14px', borderRadius: '20px', fontWeight: '500' }}>
              <RefreshCw size={14} className="spin" /> {syncMessage}
            </div>
          )}
          
          {pendingSync > 0 && !syncMessage && (
            <div style={{ fontSize: '12px', color: 'white', background: 'var(--danger)', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>
              {pendingSync} Waiting to Sync
            </div>
          )}

          <button 
            onClick={() => {
              setManualOffline(isNetworkOnline)
              setIsNetworkOnline(!isNetworkOnline)
            }}
            className="btn"
            title={isNetworkOnline ? 'Click to switch to Offline Mode' : 'Click to switch to Online Mode'}
            style={{ 
              padding: '10px 16px', 
              fontSize: '13px', 
              background: isNetworkOnline ? 'rgba(34, 139, 34, 0.1)' : 'rgba(220, 53, 69, 0.1)', 
              color: isNetworkOnline ? 'var(--success)' : 'var(--danger)',
              borderColor: isNetworkOnline ? 'var(--success)' : 'var(--danger)',
              border: '1px solid',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            {isNetworkOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span style={{ fontWeight: '700' }}>{isNetworkOnline ? 'Online — Go Offline' : 'Offline — Go Online'}</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)' }}>
            <TrendingUp />
          </div>
          <div className="stat-info">
            <h3>Total Sales</h3>
            <p>{formatCurrency(stats.totalSales)}</p>
          </div>
        </div>
        {isManagementRole(userProfile?.role) && (
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(255,99,71,0.1)', color: '#ff6347' }}>
              <Receipt />
            </div>
            <div className="stat-info">
              <h3>Net Profit (Today)</h3>
              <p>{formatCurrency(stats.todayNetProfit || 0)}</p>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {currentShop?.id === 'all' ? 'All Branches' : currentShop?.name}
              </span>
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(34, 139, 34, 0.1)', color: 'var(--success)' }}>
            <ShoppingCart />
          </div>
          <div className="stat-info">
            <h3>Transactions</h3>
            <p>{stats.transactions}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(13, 202, 240, 0.1)', color: 'var(--info)' }}>
            <Package />
          </div>
          <div className="stat-info">
            <h3>Products</h3>
            <p>{stats.activeProducts}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(220, 53, 69, 0.1)', color: 'var(--danger)' }}>
            <AlertCircle />
          </div>
          <div className="stat-info">
            <h3>Low Stock</h3>
            <p>{stats.lowStock}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(111, 66, 193, 0.1)', color: '#6f42c1' }}>
            <Briefcase size={24} />
          </div>
          <div className="stat-info">
            <h3>Services</h3>
            <p>{stats.activeServices}</p>
          </div>
        </div>

        {isManagementRole(userProfile?.role) && (
          <div className="card stat-card" onClick={() => setShowReceiptModal(true)} style={{ borderLeft: '4px solid #6f42c1', cursor: 'pointer' }}>
            <div className="stat-icon" style={{ background: 'rgba(111, 66, 193, 0.1)', color: '#6f42c1' }}>
              <FileText />
            </div>
            <div className="stat-info">
              <h3>Receipts (Today)</h3>
              <p>{stats.receiptsCount}</p>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatCurrency(stats.receiptsAmount || 0)} • Click to view</span>
            </div>
          </div>
        )}
      </div>

      {showReceiptModal && isManagementRole(userProfile?.role) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '980px', maxHeight: '90vh', overflow: 'hidden', display: 'grid', gridTemplateColumns: '340px 1fr', gap: '0' }}>
            <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>Today&apos;s Receipts</h3>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{stats.receiptsCount} receipts • {formatCurrency(stats.receiptsAmount || 0)}</p>
                </div>
                <button type="button" onClick={() => { setShowReceiptModal(false); setSelectedReceipt(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
              </div>
              <div style={{ padding: '12px' }}>
                <button
                  type="button"
                  onClick={() => { setShowReceiptModal(false); setSelectedReceipt(null) }}
                  className="btn"
                  style={{ width: '100%', marginBottom: '12px', background: 'var(--surface-muted)', color: 'var(--text-main)', border: 'none', justifyContent: 'center' }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Dashboard</span>
                </button>
                {stats.receiptsToday.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px' }}>No receipts recorded today.</p>
                )}
                {stats.receiptsToday.map((receipt) => (
                  <button
                    key={receipt.id}
                    type="button"
                    onClick={() => setSelectedReceipt(receipt)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px',
                      marginBottom: '10px',
                      borderRadius: '12px',
                      border: selectedReceipt?.id === receipt.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: selectedReceipt?.id === receipt.id ? 'rgba(184, 134, 11, 0.08)' : 'var(--surface-elevated)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <strong style={{ fontSize: '13px' }}>Receipt {String(receipt.id).slice(0, 8)}</strong>
                      <span style={{ fontSize: '13px', fontWeight: '700' }}>{formatCurrency(receipt.total_amount)}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {format(new Date(receipt.created_at), 'dd MMM yyyy HH:mm')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {receipt.customer_name} • {receipt.payment_method}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '24px' }}>
              {selectedReceipt ? (
                <div>
                  <div style={{ marginBottom: '18px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(null)}
                      className="btn"
                      style={{ marginBottom: '12px', background: 'var(--surface-muted)', color: 'var(--text-main)', border: 'none' }}
                    >
                      <ArrowLeft size={16} />
                      <span>Back to Receipts</span>
                    </button>
                    <h3 style={{ margin: 0, fontSize: '20px' }}>Receipt Detail</h3>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {selectedReceipt.customer_name} • {selectedReceipt.payment_method} • {format(new Date(selectedReceipt.created_at), 'dd MMM yyyy HH:mm')}
                    </p>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Item</th>
                          <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Qty</th>
                          <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Unit Price</th>
                          <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceipt.items.map((item) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '14px 0' }}>
                              <div style={{ fontWeight: '600' }}>{item.name}</div>
                              {item.staff_name && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.staff_name}</div>}
                            </td>
                            <td style={{ padding: '14px 0' }}>{item.quantity}</td>
                            <td style={{ padding: '14px 0' }}>{formatCurrency(item.unit_price)}</td>
                            <td style={{ padding: '14px 0', fontWeight: '700' }}>{formatCurrency(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ minWidth: '220px', borderTop: '2px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '700' }}>
                        <span>Total</span>
                        <span>{formatCurrency(selectedReceipt.total_amount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Select a receipt on the left to view the full amount and line items.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sold Today Banner - Management */}
      {isManagementRole(userProfile?.role) && (
        <>
          <div className="card" style={{ marginTop: '24px', background: 'linear-gradient(135deg, var(--primary) 0%, #d4af37 100%)', color: 'white', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '4px', opacity: 0.9 }}>Sold Today</h3>
                <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatCurrency(stats.soldToday.revenue)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '14px', opacity: 0.9 }}>Daily Transactions</p>
                <p style={{ fontSize: '24px', fontWeight: '600' }}>{stats.soldToday.count}</p>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            {currentShop?.id !== 'all' && !isCurrentDayClosed && (
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await closeDay({
                    shopId: currentShop.id,
                    date: format(new Date(), 'yyyy-MM-dd'),
                    summary: {
                      totalSales: stats.soldToday.revenue,
                      totalExpenses: stats.todayExpenses,
                      netProfit: stats.todayNetProfit
                    }
                  })
                  alert('Day closed successfully.')
                } catch (error) {
                  alert('Error closing day: ' + error.message)
                }
              }} style={{ boxShadow: '0 10px 24px rgba(184, 134, 11, 0.25)' }}>Close Day</button>
            )}
            {currentShop?.id !== 'all' && isCurrentDayClosed && (
              <button className="btn" onClick={async () => {
                try {
                  await unlockDay({
                    shopId: currentShop.id,
                    date: format(new Date(), 'yyyy-MM-dd')
                  })
                  alert('Day unlocked successfully.')
                } catch (error) {
                  alert('Error unlocking day: ' + error.message)
                }
              }} style={{ background: 'var(--surface-warning-soft)', border: '1px solid var(--border-warning-soft)', color: 'var(--text-warning-strong)' }}>Unlock Day</button>
            )}
          </div>

          {stats.todayServices.length > 0 && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px' }}>Today's Service Sales</h3>
                <span style={{ fontSize: '12px', background: 'rgba(34, 139, 34, 0.1)', color: 'var(--success)', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>
                  {stats.todayServices.length} Services
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Service</th>
                      <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Provider</th>
                      <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Amount</th>
                      <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.todayServices.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 0', fontWeight: '600' }}>{item.services?.name}</td>
                        <td style={{ padding: '14px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                              {item.profiles?.full_name?.substring(0, 1).toUpperCase()}
                            </div>
                            {item.profiles?.full_name}
                          </div>
                        </td>
                        <td style={{ padding: '14px 0', fontWeight: 'bold' }}>{formatCurrency(item.total_price)}</td>
                        <td style={{ padding: '14px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                          {format(new Date(item.created_at), 'HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {currentShop.id === 'all' ? (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Shop Summaries</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
            {stats.shopSummaries?.map(shop => (
               <div key={shop.id} className="card">
                 <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>{shop.name}</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span style={{ color: 'var(--text-muted)' }}>Revenue:</span>
                     <span style={{ fontWeight: 'bold' }}>{formatCurrency(shop.revenue)}</span>
                   </div>
                    {isManagementRole(userProfile?.role) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)', margin: '4px 0' }}>
                        <span style={{ color: 'var(--primary)', fontWeight: '600' }}>Sold Today:</span>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(shop.soldToday.revenue)} ({shop.soldToday.count})</span>
                      </div>
                    )}
                   {isManagementRole(userProfile?.role) && (
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                       <span style={{ color: 'var(--text-muted)' }}>Net Profit:</span>
                       <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>{formatCurrency(shop.netProfit || 0)}</span>
                     </div>
                   )}
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span style={{ color: 'var(--text-muted)' }}>Low Stock Info:</span>
                     <span style={{ fontWeight: 'bold', color: shop.lowStock > 0 ? 'var(--danger)' : 'var(--text-main)' }}>{shop.lowStock} Items</span>
                   </div>
                 </div>
               </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginTop: '24px' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px' }}>Recent Sales</h3>
              <button className="btn-primary btn" style={{ fontSize: '12px', padding: '6px 12px' }}>View All</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Order ID</th>
                  <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Customer</th>
                  <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Date</th>
                  <th style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 0', fontSize: '14px' }}>#{sale.id.substring(0, 8).toUpperCase()}</td>
                    <td style={{ padding: '16px 0' }}>{sale.customers?.name || 'Guest'}</td>
                    <td style={{ padding: '16px 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                      {format(new Date(sale.created_at), 'MMM d, HH:mm')}
                    </td>
                    <td style={{ padding: '16px 0', fontWeight: 'bold' }}>{formatCurrency(sale.total_amount)}</td>
                  </tr>
                ))}
                {recentSales.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No recent sales.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {isManagementRole(userProfile?.role) && (
            <div className="card">
              <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Inventory Health</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Healthy Stock</p>
                    <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--success)' }}>
                      {stats.activeProducts - stats.lowStock}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Low Stock</p>
                    <p style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--danger)' }}>
                      {stats.lowStock}
                    </p>
                  </div>
                </div>
                
                <div style={{ height: '10px', background: '#f0f0f0', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ 
                    width: `${stats.activeProducts > 0 ? ((stats.activeProducts - stats.lowStock) / stats.activeProducts) * 100 : 0}%`, 
                    height: '100%', 
                    background: 'var(--success)' 
                  }}></div>
                  <div style={{ 
                    width: `${stats.activeProducts > 0 ? (stats.lowStock / stats.activeProducts) * 100 : 0}%`, 
                    height: '100%', 
                    background: 'var(--danger)' 
                  }}></div>
                </div>

                <div style={{ marginTop: '10px' }}>
                   <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Financial Estimates:</h4>
                   <ul style={{ listStyle: 'none', padding: 0, fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Total Stock Value:</span>
                        <span style={{ fontWeight: 'bold' }}>{formatCurrency(stats.inventoryValue || 0)}</span>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Potential Profit:</span>
                        <span style={{ fontWeight: 'bold' }}>{formatCurrency(stats.estimatedProfit || 0)}</span>
                      </li>
                   </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard
