import React, { useState, useEffect, useCallback } from 'react'
import { BarChart3, Download, Calendar, ArrowUpRight, ArrowDownRight, Package, FileText } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format, addMonths } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { calculateStandardEconomics } from '../lib/finance'
import { isManagementRole } from '../lib/roles'
import { formatShopAddress } from '../lib/shopDetails'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title as ChartTitle, Tooltip, Legend } from 'chart.js'
import { Line, Bar, Pie } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, ChartTitle, Tooltip, Legend)

const DEFAULT_LOAN_MONTHS = 3

const toNumber = (value) => Number(value || 0)

const getExpenseBucket = (category = '') => {
  const normalized = category.toLowerCase()
  if (normalized.includes('rent')) return 'Rent'
  if (normalized.includes('wage') || normalized.includes('salary') || normalized.includes('labor')) return 'Salaries/Wages'
  if (normalized.includes('utility') || normalized.includes('electric') || normalized.includes('internet') || normalized.includes('water')) return 'Utilities'
  if (normalized.includes('transport') || normalized.includes('fuel') || normalized.includes('logistics')) return 'Transport'
  return 'Other Expenses'
}

const buildMonthlyBreakdown = (items = [], dateKey, amountGetter) => {
  const monthlyMap = new Map()

  items.forEach((item) => {
    const rawDate = item?.[dateKey]
    if (!rawDate) return
    const date = new Date(rawDate)
    if (Number.isNaN(date.getTime())) return
    const key = format(date, 'yyyy-MM')
    const monthLabel = format(date, 'MMM yyyy')
    const existing = monthlyMap.get(key) || { key, month: monthLabel, amount: 0 }
    existing.amount += toNumber(amountGetter(item))
    monthlyMap.set(key, existing)
  })

  return Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key))
}

const buildForecast = (salesSeries = [], expenseSeries = [], months = DEFAULT_LOAN_MONTHS) => {
  const averageSales = salesSeries.length > 0
    ? salesSeries.reduce((sum, item) => sum + item.amount, 0) / salesSeries.length
    : 0
  const averageExpenses = expenseSeries.length > 0
    ? expenseSeries.reduce((sum, item) => sum + item.amount, 0) / expenseSeries.length
    : 0

  return Array.from({ length: months }, (_, index) => {
    const monthDate = addMonths(new Date(), index + 1)
    return {
      month: format(monthDate, 'MMM yyyy'),
      income: averageSales,
      expenses: averageExpenses,
      netCashFlow: averageSales - averageExpenses
    }
  })
}

const csvValue = (value) => {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

const buildCsvSection = (title, headers, rows) => {
  const sectionRows = [[title], headers, ...rows]
  return sectionRows.map((row) => row.map(csvValue).join(',')).join('\n')
}

const Reports = () => {
  const { currentShop, shops, userProfile, formatCurrency, currencyPreference } = useShop()
  const [selectedShopId, setSelectedShopId] = useState(currentShop?.id || 'all')
  const [dateRange, setDateRange] = useState('7') // 7, 30, 90 days
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(50) // Limit items per page for performance
  const [reportData, setReportData] = useState({
    totalSales: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    totalProfit: 0,
    grossProfit: 0,
    topProducts: [],
    topServices: [],
    staffPerformance: [],
    lowStock: [],
    shopSummaries: [],
    customerCount: 0,
    activeProducts: 0,
    expenseBreakdown: [],
    inventoryReport: [],
    debtors: [],
    creditors: [],
    detailedSales: [],
    detailedPurchases: [],
    detailedExpenses: [],
    monthlySales: [],
    monthlyExpenses: [],
    chartTimeline: [],
    cashFlowForecast: [],
    balanceSheet: {
      cash: 0,
      inventory: 0,
      equipment: 0,
      accountsReceivable: 0,
      totalAssets: 0,
      loans: 0,
      accountsPayable: 0,
      otherLiabilities: 0,
      totalLiabilities: 0,
      ownersEquity: 0
    }
  })
  const [loading, setLoading] = useState(true)

  const selectedShop = selectedShopId === 'all'
    ? null
    : shops.find((shop) => shop.id === selectedShopId) || currentShop
  const reportShop = selectedShopId === 'all'
    ? { name: 'All Branches Consolidated', location: 'Malawi' }
    : (selectedShop || currentShop)

  const fetchReportData = useCallback(async () => {
    if (!selectedShopId) return
    setLoading(true)
    
    // Use local start of day for consistent filtering with Dashboard
    const localToday = new Date()
    localToday.setHours(0, 0, 0, 0)
    const startDate = new Date(localToday)
    startDate.setDate(startDate.getDate() - parseInt(dateRange))
    const startDateISO = startDate.toISOString()
    const startDateDateString = format(startDate, 'yyyy-MM-dd')
    const shopIds = selectedShopId !== 'all' ? [selectedShopId] : shops.map(s => s.id)
    
    try {
      // 1. Sales & Top Products
      let salesQuery = supabase
        .from('sales')
        .select(`
          id,
          shop_id,
          created_at,
          payment_method,
          customer_id,
          customers(name),
          total_amount,
          sale_items (
            product_id,
            service_id,
            staff_id,
            quantity,
            unit_price,
            cost_price,
            total_price,
            products (name, cost_price),
            services (name),
            profiles:staff_id (full_name)
          )
        `)
        .gte('created_at', startDateISO)
        
      if (selectedShopId !== 'all') {
        salesQuery = salesQuery.eq('shop_id', selectedShopId)
      } else {
        salesQuery = salesQuery.in('shop_id', shopIds)
      }
      const { data: sales } = await salesQuery

      let shopSummariesMap = {}
      if (selectedShopId === 'all') {
        shops.forEach(s => {
          shopSummariesMap[s.id] = {
            id: s.id, name: s.name,
            totalSales: 0, totalPurchases: 0, totalExpenses: 0, totalProfit: 0,
            customerCount: 0, activeProducts: 0, lowStock: []
          }
        })
      }

      const productStats = {}
      const serviceStats = {}
      const staffStats = {}

      sales?.forEach(sale => {
        if (selectedShopId === 'all' && shopSummariesMap[sale.shop_id]) {
          shopSummariesMap[sale.shop_id].totalSales += Number(sale.total_amount)
        }

        sale.sale_items?.forEach(item => {
          const revenue = Number(item.total_price || 0)
          if (item.product_id) {
            const pid = item.product_id
            const qty = Number(item.quantity || 0)
            if (!productStats[pid]) {
              productStats[pid] = { name: item.products?.name || 'Unknown', quantity: 0, revenue: 0 }
            }
            productStats[pid].quantity += qty
            productStats[pid].revenue += revenue
          } else if (item.service_id) {
            const sid = item.service_id
            if (!serviceStats[sid]) {
              serviceStats[sid] = { name: item.services?.name || 'Unknown', quantity: 0, revenue: 0 }
            }
            serviceStats[sid].quantity += 1
            serviceStats[sid].revenue += revenue
            if (item.staff_id) {
              const stid = item.staff_id
              if (!staffStats[stid]) {
                staffStats[stid] = { name: item.profiles?.full_name || 'Staff', services: 0, revenue: 0 }
              }
              staffStats[stid].services += 1
              staffStats[stid].revenue += revenue
            }
          }
        })
      })

      const topProducts = Object.values(productStats).sort((a, b) => b.quantity - a.quantity).slice(0, 5)
      const topServices = Object.values(serviceStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      const staffPerformance = Object.values(staffStats).sort((a, b) => b.revenue - a.revenue)

      // 2. Purchases (Stock tracking)
      let purchasesQuery = supabase.from('purchases').select('shop_id, product_id, cost_price, quantity, selling_price').gte('p_date', startDateDateString)
      if (selectedShopId !== 'all') {
        purchasesQuery = purchasesQuery.eq('shop_id', selectedShopId)
      } else {
        purchasesQuery = purchasesQuery.in('shop_id', shopIds)
      }
      const { data: purchases } = await purchasesQuery
      purchases?.forEach(p => {
        if (selectedShopId === 'all' && shopSummariesMap[p.shop_id]) {
          shopSummariesMap[p.shop_id].totalPurchases += (Number(p.cost_price) * Number(p.quantity))
        }
      })

      // 3. Customers Served
      // Count each receipt / sale as one served customer, including walk-ins.
      const customerCount = sales?.length || 0
      sales?.forEach((sale) => {
        if (selectedShopId === 'all' && shopSummariesMap[sale.shop_id]) {
          shopSummariesMap[sale.shop_id].customerCount += 1
        }
      })

      // 4. Inventory
      let inventory = []
      let inventoryQuery = supabase.from('products').select('shop_id, id, name, quantity, min_quantity, cost_price, selling_price, opening_stock')
      if (selectedShopId !== 'all') {
        inventoryQuery = inventoryQuery.eq('shop_id', selectedShopId)
      } else {
        inventoryQuery = inventoryQuery.in('shop_id', shopIds)
      }
      const { data: inventoryWithOpening, error: inventoryError } = await inventoryQuery
      if (inventoryError) {
        let fallbackInventoryQuery = supabase.from('products').select('shop_id, id, name, quantity, min_quantity, cost_price, selling_price')
        if (selectedShopId !== 'all') {
          fallbackInventoryQuery = fallbackInventoryQuery.eq('shop_id', selectedShopId)
        } else {
          fallbackInventoryQuery = fallbackInventoryQuery.in('shop_id', shopIds)
        }
        const { data: fallbackInventory, error: fallbackInventoryError } = await fallbackInventoryQuery
        if (fallbackInventoryError) throw fallbackInventoryError
        inventory = fallbackInventory || []
      } else {
        inventory = inventoryWithOpening || []
      }
      const activeProducts = inventory?.length || 0
      const lowStockItems = inventory?.filter(p => p.quantity <= p.min_quantity) || []
      inventory?.forEach(p => {
        if (selectedShopId === 'all' && shopSummariesMap[p.shop_id]) {
          shopSummariesMap[p.shop_id].activeProducts += 1
          if (p.quantity <= p.min_quantity) {
             shopSummariesMap[p.shop_id].lowStock.push({ name: p.name, quantity: p.quantity, min_quantity: p.min_quantity })
          }
        }
      })

      // 5. Expenses
      let expensesQuery = supabase.from('expenses').select('shop_id, amount, expense_date').gte('expense_date', startDateDateString)
      if (selectedShopId !== 'all') {
        expensesQuery = expensesQuery.eq('shop_id', selectedShopId)
      } else {
        expensesQuery = expensesQuery.in('shop_id', shopIds)
      }
      const { data: expenses } = await expensesQuery
      expenses?.forEach((expense) => {
        if (selectedShopId === 'all' && shopSummariesMap[expense.shop_id]) {
          shopSummariesMap[expense.shop_id].totalExpenses += Number(expense.amount || 0)
        }
      })

      let categorizedExpensesQuery = supabase
        .from('expenses')
        .select('shop_id, category, amount, description, expense_date, created_at')
        .gte('expense_date', startDateDateString)
      if (selectedShopId !== 'all') {
        categorizedExpensesQuery = categorizedExpensesQuery.eq('shop_id', selectedShopId)
      } else {
        categorizedExpensesQuery = categorizedExpensesQuery.in('shop_id', shopIds)
      }
      const { data: categorizedExpenses } = await categorizedExpensesQuery

      let debtorsQuery = supabase
        .from('customer_credit')
        .select('amount_owed, is_settled, due_date, customers(name)')
      if (selectedShopId !== 'all') {
        debtorsQuery = debtorsQuery.eq('shop_id', selectedShopId)
      } else {
        debtorsQuery = debtorsQuery.in('shop_id', shopIds)
      }
      const { data: debtorsRaw } = await debtorsQuery

      let businessLoansQuery = supabase
        .from('business_loans')
        .select('amount, interest_rate, is_settled, due_date, lender_name')
        .eq('is_settled', false)
      if (selectedShopId !== 'all') {
        businessLoansQuery = businessLoansQuery.eq('shop_id', selectedShopId)
      } else {
        businessLoansQuery = businessLoansQuery.in('shop_id', shopIds)
      }
      const { data: rawBusinessLoans } = await businessLoansQuery

      let staffSalariesQuery = supabase
        .from('staff_salaries')
        .select('amount, is_settled, staff_name')
        .eq('is_settled', false)
      if (selectedShopId !== 'all') {
        staffSalariesQuery = staffSalariesQuery.eq('shop_id', selectedShopId)
      } else {
        staffSalariesQuery = staffSalariesQuery.in('shop_id', shopIds)
      }
      const { data: rawStaffSalaries } = await staffSalariesQuery

      let suppliersQuery = supabase
        .from('suppliers')
        .select('*')
      if (selectedShopId !== 'all') {
        suppliersQuery = suppliersQuery.eq('shop_id', selectedShopId)
      } else {
        suppliersQuery = suppliersQuery.in('shop_id', shopIds)
      }
      const { data: suppliersData } = await suppliersQuery

      let supplierPurchasesQuery = supabase
        .from('purchases')
        .select('shop_id, p_date, quantity, cost_price, selling_price, supplier_id, product_id, products(name, barcode, brand, unit_size), suppliers(*)')
        .gte('p_date', startDateDateString)
      if (selectedShopId !== 'all') {
        supplierPurchasesQuery = supplierPurchasesQuery.eq('shop_id', selectedShopId)
      } else {
        supplierPurchasesQuery = supplierPurchasesQuery.in('shop_id', shopIds)
      }
      const { data: supplierPurchases } = await supplierPurchasesQuery

      let stockAdjustments = []
      let stockAdjustmentsQuery = supabase
        .from('stock_adjustments')
        .select('shop_id, product_id, adjustment_type, quantity, notes, created_at')
        .gte('created_at', startDateISO)
      if (selectedShopId !== 'all') {
        stockAdjustmentsQuery = stockAdjustmentsQuery.eq('shop_id', selectedShopId)
      } else {
        stockAdjustmentsQuery = stockAdjustmentsQuery.in('shop_id', shopIds)
      }
      const { data: stockAdjustmentsData, error: stockAdjustmentsError } = await stockAdjustmentsQuery
      if (!stockAdjustmentsError) {
        stockAdjustments = stockAdjustmentsData || []
      }

      // 6. Compute Economies
      const allEcon = calculateStandardEconomics(sales || [], categorizedExpenses || [])
      
      const isDaily = parseInt(dateRange) <= 30
      const timelineMap = new Map()

      const getTimelineKey = (rawDate) => {
        if (!rawDate) return null
        const d = new Date(rawDate)
        if (Number.isNaN(d.getTime())) return null
        return isDaily ? format(d, 'yyyy-MM-dd') : format(d, 'yyyy-MM')
      }

      const getTimelineLabel = (key) => {
         if (isDaily) return format(new Date(key), 'MMM dd')
         return format(new Date(key + '-01'), 'MMM yyyy')
      }

      ;(sales || []).forEach(sale => {
        const key = getTimelineKey(sale.created_at)
        if (!key) return
        if (!timelineMap.has(key)) timelineMap.set(key, { key, sales: [], expenses: [] })
        timelineMap.get(key).sales.push(sale)
      })

      ;(categorizedExpenses || []).forEach(expense => {
        const key = getTimelineKey(expense.expense_date)
        if (!key) return
        if (!timelineMap.has(key)) timelineMap.set(key, { key, sales: [], expenses: [] })
        timelineMap.get(key).expenses.push(expense)
      })

      const chartTimeline = Array.from(timelineMap.values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(bucket => {
          const econ = calculateStandardEconomics(bucket.sales, bucket.expenses)
          return {
            label: getTimelineLabel(bucket.key),
            netProfit: econ.netProfit,
            revenue: econ.revenue,
            expenses: econ.totalExpenses
          }
        })

      const expenseBuckets = {
        'Rent': 0,
        'Salaries/Wages': 0,
        'Utilities': 0,
        'Transport': 0,
        'Other Expenses': 0
      }
      ;(categorizedExpenses || []).forEach((expense) => {
        const bucket = getExpenseBucket(expense.category)
        expenseBuckets[bucket] += Number(expense.amount || 0)
      })

      const expenseBreakdown = Object.entries(expenseBuckets).map(([label, amount]) => ({ label, amount }))
      const monthlySales = buildMonthlyBreakdown(sales || [], 'created_at', (item) => item.total_amount)
      const monthlyExpenses = buildMonthlyBreakdown(categorizedExpenses || [], 'expense_date', (item) => item.amount)
      const purchasedQtyByProduct = new Map()
      ;(purchases || []).forEach((purchase) => {
        const existing = purchasedQtyByProduct.get(purchase.product_id) || 0
        purchasedQtyByProduct.set(purchase.product_id, existing + Number(purchase.quantity || 0))
      })

      const soldQtyByProduct = new Map()
      ;(sales || []).forEach((sale) => {
        ;(sale.sale_items || []).forEach((item) => {
          if (!item.product_id) return
          const existing = soldQtyByProduct.get(item.product_id) || 0
          soldQtyByProduct.set(item.product_id, existing + Number(item.quantity || 0))
        })
      })

      const stockMovementByProduct = new Map()
      ;(stockAdjustments || []).forEach((movement) => {
        if (!movement.product_id) return
        const existing = stockMovementByProduct.get(movement.product_id) || {
          adjustmentIncrease: 0,
          adjustmentDecrease: 0,
          damaged: 0
        }
        const quantity = Number(movement.quantity || 0)
        if (movement.adjustment_type === 'adjustment_increase') {
          existing.adjustmentIncrease += quantity
        } else if (movement.adjustment_type === 'adjustment_decrease') {
          existing.adjustmentDecrease += quantity
        } else if (movement.adjustment_type === 'damage') {
          existing.damaged += quantity
        }
        stockMovementByProduct.set(movement.product_id, existing)
      })

      const inventoryReport = (inventory || []).map((item) => {
        const derivedOpeningStock = Math.max(0, Number(item.quantity || 0) - Number(purchasedQtyByProduct.get(item.id) || 0) - Number(stockMovementByProduct.get(item.id)?.adjustmentIncrease || 0) + Number(stockMovementByProduct.get(item.id)?.adjustmentDecrease || 0) + Number(stockMovementByProduct.get(item.id)?.damaged || 0) + Number(soldQtyByProduct.get(item.id) || 0))

        return {
          name: item.name,
          openingStock: item.opening_stock == null ? derivedOpeningStock : Number(item.opening_stock || 0),
          purchasedQty: Number(purchasedQtyByProduct.get(item.id) || 0),
          adjustmentQty: Number(stockMovementByProduct.get(item.id)?.adjustmentIncrease || 0) - Number(stockMovementByProduct.get(item.id)?.adjustmentDecrease || 0),
          damagedQty: Number(stockMovementByProduct.get(item.id)?.damaged || 0),
          closingStock: Number(item.quantity || 0),
          quantity: Number(item.quantity || 0),
          costPrice: Number(item.cost_price || 0),
          sellingPrice: Number(item.selling_price || 0)
        }
      })

      const debtors = (debtorsRaw || [])
        .filter((entry) => !entry.is_settled)
        .map((entry) => ({
          name: entry.customers?.name || 'Walk-in Customer',
          amount: Number(entry.amount_owed || 0),
          dueDate: entry.due_date || ''
        }))

      const creditorsMap = new Map()
      ;(supplierPurchases || []).forEach((purchase) => {
        const supplierName = purchase.suppliers?.name || suppliersData?.find((supplier) => supplier.id === purchase.supplier_id)?.name || 'Unassigned Supplier'
        const existing = creditorsMap.get(supplierName) || 0
        creditorsMap.set(supplierName, existing + (Number(purchase.cost_price || 0) * Number(purchase.quantity || 0)))
      })
      const creditors = Array.from(creditorsMap.entries()).map(([name, amount]) => ({ name, amount }))
      const inventoryValue = inventoryReport.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0)
      const accountsReceivable = debtors.reduce((sum, item) => sum + item.amount, 0)
      const accountsPayable = creditors.reduce((sum, item) => sum + item.amount, 0)
      const cashOnHand = Math.max(0, allEcon.revenue - allEcon.totalExpenses)
      const totalAssets = cashOnHand + inventoryValue + accountsReceivable
      const activeBusinessLoansTotal = (rawBusinessLoans || []).reduce((sum, loan) => {
        const principal = Number(loan.amount || 0)
        const rate = Number(loan.interest_rate || 0)
        return sum + (principal + (principal * rate / 100))
      }, 0)

      const activeStaffSalariesTotal = (rawStaffSalaries || []).reduce((sum, sal) => {
        return sum + Number(sal.amount || 0)
      }, 0)

      const totalLiabilities = accountsPayable + activeBusinessLoansTotal + activeStaffSalariesTotal

      const balanceSheet = {
        cash: cashOnHand,
        inventory: inventoryValue,
        equipment: 0,
        accountsReceivable,
        totalAssets,
        loans: activeBusinessLoansTotal,
        accountsPayable,
        otherLiabilities: activeStaffSalariesTotal,
        totalLiabilities,
        ownersEquity: totalAssets - totalLiabilities
      }
      const cashFlowForecast = buildForecast(monthlySales, monthlyExpenses)
      const detailedSales = (sales || []).flatMap((sale) =>
        (sale.sale_items || []).map((item) => {
          const quantity = Number(item.quantity || 0)
          const lineTotal = Number(item.total_price || 0)
          const unitPrice = quantity > 0 ? lineTotal / quantity : lineTotal
          const itemName = item.products?.name || item.services?.name || 'Unknown Item'
          const itemType = item.product_id ? 'Product' : 'Service'
          const productCost = Number(item.products?.cost_price || 0)
          const estimatedCost = item.product_id ? productCost * quantity : 0

          return {
            saleId: sale.id,
            saleDate: sale.created_at || '',
            shopName: shops.find((shop) => shop.id === sale.shop_id)?.name || reportShop?.name || 'Unknown Shop',
            customerName: sale.customers?.name || 'Walk-in Customer',
            paymentMethod: sale.payment_method || '',
            itemType,
            itemName,
            quantity,
            unitPrice,
            lineTotal,
            estimatedCost,
            estimatedProfit: lineTotal - estimatedCost,
            staffName: item.profiles?.full_name || ''
          }
        })
      )

      const detailedPurchases = (supplierPurchases || []).map((purchase) => {
        const quantity = Number(purchase.quantity || 0)
        const costPrice = Number(purchase.cost_price || 0)
        const sellingPrice = Number(purchase.selling_price || 0)

        return {
          purchaseDate: purchase.p_date || '',
          shopName: shops.find((shop) => shop.id === purchase.shop_id)?.name || reportShop?.name || 'Unknown Shop',
          supplierName: purchase.suppliers?.name || 'Unassigned Supplier',
          supplierRegistration: purchase.suppliers?.registration_number || '',
          supplierTPIN: purchase.suppliers?.tpin || '',
          productName: purchase.products?.name || 'Unknown Product',
          barcode: purchase.products?.barcode || '',
          brand: purchase.products?.brand || '',
          unitSize: purchase.products?.unit_size || '',
          quantity,
          costPrice,
          sellingPrice,
          totalCost: quantity * costPrice
        }
      })

      const detailedExpenses = (categorizedExpenses || []).map((expense) => ({
        expenseDate: expense.expense_date || '',
        recordedAt: expense.created_at || '',
        shopName: shops.find((shop) => shop.id === expense.shop_id)?.name || reportShop?.name || 'Unknown Shop',
        category: expense.category || 'Other',
        description: expense.description || '',
        amount: Number(expense.amount || 0)
      }))

      if (selectedShopId === 'all') {
        Object.values(shopSummariesMap).forEach(shop => {
          const shopSales = sales?.filter(s => s.shop_id === shop.id) || []
          const shopExpenses = expenses?.filter(e => e.shop_id === shop.id) || []
          const shopEcon = calculateStandardEconomics(shopSales, shopExpenses)
          shop.totalSales = shopEcon.revenue
          shop.totalPurchases = shopEcon.cogs
          shop.totalExpenses = shopEcon.totalExpenses
          shop.totalProfit = shopEcon.netProfit
        })
      }

      setReportData({
        totalSales: allEcon.revenue,
        totalPurchases: allEcon.cogs,
        totalExpenses: allEcon.totalExpenses,
        totalProfit: allEcon.netProfit,
        grossProfit: allEcon.grossProfit,
        topProducts,
        topServices,
        staffPerformance,
        lowStock: lowStockItems,
        customerCount,
        activeProducts,
        shopSummaries: Object.values(shopSummariesMap),
        expenseBreakdown,
        inventoryReport,
        debtors,
        creditors,
        detailedSales,
        detailedPurchases,
        detailedExpenses,
        monthlySales,
        monthlyExpenses,
        chartTimeline,
        cashFlowForecast,
        balanceSheet
      })
    } catch (error) {
      console.error('Report error:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedShopId, dateRange, shops, reportShop?.name])

  useEffect(() => {
    if (currentShop) fetchReportData()
  }, [currentShop, fetchReportData])

  const exportCSV = () => {
    const summaryRows = [
      ['Report Scope', selectedShopId === 'all' ? 'All Branches' : (reportShop?.name || currentShop?.name || 'Selected Shop')],
      ['Date Range (Days)', dateRange],
      ['Generated At', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Total Sales', reportData.totalSales],
      ['Total Purchases', reportData.totalPurchases],
      ['Total Expenses', reportData.totalExpenses],
      ['Gross Profit', reportData.grossProfit],
      ['Net Profit', reportData.totalProfit],
      ['Active Products', reportData.activeProducts],
      ['Customer Count', reportData.customerCount]
    ]

    const sections = [
      buildCsvSection('Summary', ['Metric', 'Value'], summaryRows),
      buildCsvSection(
        'Goods And Services Sold',
        ['Sale ID', 'Sale Date', 'Shop', 'Customer', 'Payment Method', 'Item Type', 'Item Name', 'Quantity', 'Unit Price', 'Line Total', 'Estimated Cost', 'Estimated Profit', 'Staff'],
        reportData.detailedSales.length > 0
          ? reportData.detailedSales.map((item) => [
              item.saleId,
              item.saleDate,
              item.shopName,
              item.customerName,
              item.paymentMethod,
              item.itemType,
              item.itemName,
              item.quantity,
              item.unitPrice,
              item.lineTotal,
              item.estimatedCost,
              item.estimatedProfit,
              item.staffName
            ])
          : [['', '', '', '', '', '', 'No sales data', '', '', '', '', '', '']]
      ),
      buildCsvSection(
        'Purchases And Restocking',
        ['Purchase Date', 'Shop', 'Supplier', 'Supplier Registration No.', 'Supplier TPIN', 'Product Name', 'Barcode', 'Brand', 'Unit Size', 'Quantity', 'Cost Price', 'Selling Price', 'Total Cost'],
        reportData.detailedPurchases.length > 0
          ? reportData.detailedPurchases.map((item) => [
              item.purchaseDate,
              item.shopName,
              item.supplierName,
              item.supplierRegistration,
              item.supplierTPIN,
              item.productName,
              item.barcode,
              item.brand,
              item.unitSize,
              item.quantity,
              item.costPrice,
              item.sellingPrice,
              item.totalCost
            ])
          : [['', '', '', '', '', 'No purchase data', '', '', '', '', '', '', '']]
      ),
      buildCsvSection(
        'Expenses',
        ['Expense Date', 'Recorded At', 'Shop', 'Category', 'Description', 'Amount'],
        reportData.detailedExpenses.length > 0
          ? reportData.detailedExpenses.map((item) => [
              item.expenseDate,
              item.recordedAt,
              item.shopName,
              item.category,
              item.description,
              item.amount
            ])
          : [['', '', '', 'No expense data', '', '']]
      ),
      buildCsvSection(
        'Inventory',
        ['Product Name', 'Opening Stock', 'Purchased Qty', 'Adjustments', 'Damages', 'Closing Stock', 'Cost Price', 'Selling Price'],
        reportData.inventoryReport.length > 0
          ? reportData.inventoryReport.map((item) => [item.name, item.openingStock, item.purchasedQty, item.adjustmentQty, item.damagedQty, item.closingStock, item.costPrice, item.sellingPrice])
          : [['No inventory data', '', '', '', '', '', '', '']]
      ),
      buildCsvSection(
        'Debtors',
        ['Customer Name', 'Amount Owed', 'Due Date'],
        reportData.debtors.length > 0
          ? reportData.debtors.map((item) => [item.name, item.amount, item.dueDate])
          : [['None recorded', '', '']]
      ),
      buildCsvSection(
        'Creditors',
        ['Supplier Name', 'Amount'],
        reportData.creditors.length > 0
          ? reportData.creditors.map((item) => [item.name, item.amount])
          : [['No supplier balances tracked', '']]
      )
    ]

    const csvContent = `data:text/csv;charset=utf-8,${sections.join('\n\n')}`
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `report_${(reportShop?.name || currentShop?.name || 'shop').replace(/\s+/g, '_')}_${dateRange}days_${format(new Date(), 'yyyyMMdd')}.csv`)
    document.body.appendChild(link)
    link.click()
  }

  const generatePDF = () => {
    const doc = new jsPDF()
    const shopName = currentShop?.name || 'Shop'
    const shopAddress = formatShopAddress(currentShop) || currentShop?.location || 'Malawi'
    
    // Header & Brand
    doc.setFillColor(184, 134, 11) // Primary color
    doc.rect(0, 0, 210, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(26)
    doc.text('SHOP PERFORMANCE REPORT', 105, 25, { align: 'center' })
    
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(12)
    doc.text(`Shop Branch: ${shopName}`, 14, 50)
    doc.text(`Location: ${shopAddress}`, 14, 57)
    doc.text(`Period: Last ${dateRange} Days`, 14, 64)
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 71)

    // 1. Executive Summary
    doc.setFontSize(16)
    doc.text(currentShop?.id === 'all' ? '1. Global Enterprise Summary' : '1. Executive Financial Summary', 14, 85)
    autoTable(doc, {
      startY: 90,
      head: [['Metric', `Value (${currencyPreference})`]],
      body: [
        ['Total Revenue (Sales)', formatCurrency(reportData.totalSales)],
        ['Total Purchases', formatCurrency(reportData.totalPurchases)],
        ['Operating Expenses', formatCurrency(reportData.totalExpenses)],
        ['Net Profit', formatCurrency(reportData.totalProfit || 0)],
        ['Net Margin', reportData.totalSales > 0 ? `${(reportData.totalProfit / reportData.totalSales * 100).toFixed(1)}%` : '0%']
      ],
      theme: 'grid',
      headStyles: { fillColor: [184, 134, 11] }
    })

    if (currentShop?.id === 'all') {
      let currentY = doc.lastAutoTable.finalY + 15
      
      reportData.shopSummaries.forEach((shop, index) => {
        if (currentY > 200) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14)
        doc.setTextColor(184, 134, 11)
        doc.text(`${index + 2}. Branch: ${shop.name}`, 14, currentY)
        doc.setTextColor(0, 0, 0)
        
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Metric', 'Value']],
          body: [
            ['Total Revenue', formatCurrency(shop.totalSales)],
            ['Total Purchases', formatCurrency(shop.totalPurchases)],
            ['Operating Expenses', formatCurrency(shop.totalExpenses)],
            ['Net Profit', formatCurrency(shop.totalProfit)],
            ['Active Products', shop.activeProducts.toString()],
            ['Customers Served', shop.customerCount.toString()],
            ['Low Stock Alerts', shop.lowStock.length.toString()]
          ],
          theme: 'grid',
          headStyles: { fillColor: [100, 100, 100] }
        })
        currentY = doc.lastAutoTable.finalY + 15

        if (shop.lowStock.length > 0) {
           if (currentY > 220) { doc.addPage(); currentY = 20; }
           autoTable(doc, {
             startY: currentY,
             head: [['Low Stock Item', 'Qty', 'Min Required']],
             body: shop.lowStock.map(ls => [ls.name, ls.quantity, ls.min_quantity]),
             theme: 'striped',
             headStyles: { fillColor: [220, 53, 69] }
           })
           currentY = doc.lastAutoTable.finalY + 15
        }
      })
    } else {
      // 2. Operational Metrics
      doc.text('2. Operational Overview', 14, doc.lastAutoTable.finalY + 15)
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Metric', 'Count / Value']],
        body: [
          ['Total Customers Served', reportData.customerCount.toString()],
          ['Total Active Products', reportData.activeProducts.toString()],
          ['Low Stock Alerts', reportData.lowStock.length.toString()]
        ],
        theme: 'striped'
      })

      // 3. Top Products & Services
      if (reportData.topProducts.length > 0) {
        doc.text('3. Top Selling Products', 14, doc.lastAutoTable.finalY + 15)
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Product', 'Qty Sold', `Revenue (${currencyPreference})`]],
          body: reportData.topProducts.map(p => [
            p.name,
            p.quantity,
            formatCurrency(p.revenue)
          ]),
          theme: 'grid'
        })
      }

      if (reportData.topServices.length > 0) {
        doc.text('4. Top Performing Services', 14, doc.lastAutoTable.finalY + 15)
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Service', 'Count', `Revenue (${currencyPreference})`]],
          body: reportData.topServices.map(s => [
            s.name,
            s.quantity,
            formatCurrency(s.revenue)
          ]),
          theme: 'grid',
          headStyles: { fillColor: [0, 123, 255] }
        })
      }

      if (reportData.staffPerformance.length > 0) {
        doc.text('5. Staff Service Performance', 14, doc.lastAutoTable.finalY + 15)
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Staff Member', 'Services Done', `Revenue (${currencyPreference})`]],
          body: reportData.staffPerformance.map(s => [
            s.name,
            s.services,
            formatCurrency(s.revenue)
          ]),
          theme: 'grid',
          headStyles: { fillColor: [40, 167, 69] }
        })
      }

      // 4. Inventory Alerts
      if (reportData.lowStock.length > 0) {
        if (doc.lastAutoTable.finalY > 220) doc.addPage()
        doc.setFontSize(14)
        doc.setTextColor(220, 53, 69) // Danger color
        doc.text('4. Critical Stock Alerts (Action Required)', 14, doc.lastAutoTable.finalY + 15)
        doc.setFontSize(10)
        doc.setTextColor(100)
        doc.text('The following items have reached or fallen below the threshold (Default: 5).', 14, doc.lastAutoTable.finalY + 22)
        
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 25,
          head: [['Product', 'Current Qty', 'Alert Level']],
          body: reportData.lowStock.map(p => [p.name, p.quantity, p.min_quantity]),
          theme: 'grid',
          headStyles: { fillColor: [220, 53, 69] }
        })
      }
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(10)
      doc.setTextColor(150)
      doc.text(`Page ${i} of ${pageCount} - ShopMS Multi-Shop System`, 105, 285, { align: 'center' })
    }

    doc.save(`Shop_Overview_${shopName.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`)
  }

  const generateBankReport = async () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const pageHeight = doc.internal.pageSize.height
    const reportTitle = 'BUSINESS REPORT PACKAGE'
    const reportPeriodLabel = `Last ${dateRange} Days`
    const generatedOn = format(new Date(), 'dd MMMM yyyy')
    const companyName = reportShop?.name || currentShop?.name || 'Business Name'
    const companyAddress = formatShopAddress(reportShop || currentShop || {}) || reportShop?.location || currentShop?.location || 'Malawi'
    const totalExpenseRows = reportData.expenseBreakdown.reduce((sum, item) => sum + item.amount, 0)
    const totalDebtors = reportData.debtors.reduce((sum, item) => sum + item.amount, 0)
    const totalCreditors = reportData.creditors.reduce((sum, item) => sum + item.amount, 0)
    const businessDescription = `${companyName} is a Malawi-based SME using ShopMS to manage sales, inventory, customer accounts, and operating expenses.`
    const reportPurpose = 'Internal auditing, performance tracking, and general business growth review.'
    const repaymentPlan = 'Supported by recurring sales collections and projected monthly operating cash flow shown in this report.'
    const addSectionTitle = (title, y) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(26, 35, 126)
      doc.text(title, 14, y)
      doc.setTextColor(0)
      doc.setFont('helvetica', 'normal')
    }
    const ensureRoom = (y, needed = 40) => {
      if (y + needed > pageHeight - 18) {
        doc.addPage()
        return 20
      }
      return y
    }

    doc.setFillColor(26, 35, 126)
    doc.rect(0, 0, pageWidth, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(reportTitle, pageWidth / 2, 18, { align: 'center' })
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('(For Malawian SMEs and Retail Shops)', pageWidth / 2, 28, { align: 'center' })
    doc.text(companyName, pageWidth / 2, 35, { align: 'center' })

    let y = 52
    addSectionTitle('1. COMPANY INFORMATION', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Field', 'Value']],
      body: [
        ['Business Name', companyName],
        ['Owner(s)', userProfile?.full_name || '___________________________'],
        ['Business Registration Number', reportShop?.registration_number || currentShop?.registration_number || 'Not provided'],
        ['Tax Identification Number (TPIN)', reportShop?.tpin || currentShop?.tpin || 'Not provided'],
        ['VAT Status', reportShop?.vat_registered || currentShop?.vat_registered ? 'Registered' : 'Not provided'],
        ['VAT Number', reportShop?.vat_number || currentShop?.vat_number || 'Not provided'],
        ['Location', companyAddress],
        ['Type of Business', selectedShopId === 'all' ? 'Multi-branch retail / SME operations' : 'Retail shop / SME'],
        ['Date Established', reportShop?.created_at ? format(new Date(reportShop.created_at), 'dd MMM yyyy') : '___________________________'],
        ['Reporting Period', reportPeriodLabel],
        ['Report Generated', generatedOn]
      ],
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 70)
    addSectionTitle('2. PROFIT & LOSS STATEMENT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Description', `Amount (${currencyPreference})`]],
      body: [
        ['Total Sales Revenue', formatCurrency(reportData.totalSales)],
        ['Cost of Goods Sold (COGS)', formatCurrency(reportData.totalPurchases)],
        ['Gross Profit', formatCurrency(reportData.grossProfit)],
        ['Operating Expenses', ''],
        ...reportData.expenseBreakdown.map((item) => [`- ${item.label}`, formatCurrency(item.amount)]),
        ['Total Expenses', formatCurrency(totalExpenseRows)],
        ['Net Profit', formatCurrency(reportData.totalProfit)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 90)
    addSectionTitle('3. BALANCE SHEET', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['ASSETS', `Amount (${currencyPreference})`]],
      body: [
        ['Cash', formatCurrency(reportData.balanceSheet.cash)],
        ['Inventory / Stock', formatCurrency(reportData.balanceSheet.inventory)],
        ['Equipment', formatCurrency(reportData.balanceSheet.equipment)],
        ['Accounts Receivable', formatCurrency(reportData.balanceSheet.accountsReceivable)],
        ['Total Assets', formatCurrency(reportData.balanceSheet.totalAssets)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 139, 34] },
      styles: { fontSize: 9 }
    })
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [['LIABILITIES / EQUITY', `Amount (${currencyPreference})`]],
      body: [
        ['Loans', formatCurrency(reportData.balanceSheet.loans)],
        ['Accounts Payable', formatCurrency(reportData.balanceSheet.accountsPayable)],
        ['Other Liabilities', formatCurrency(reportData.balanceSheet.otherLiabilities)],
        ['Total Liabilities', formatCurrency(reportData.balanceSheet.totalLiabilities)],
        ['Owner’s Equity', formatCurrency(reportData.balanceSheet.ownersEquity)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [184, 134, 11] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 55)
    addSectionTitle('4. CASH FLOW STATEMENT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Description', `Amount (${currencyPreference})`]],
      body: [
        ['Cash Inflows (Sales)', formatCurrency(reportData.totalSales)],
        ['Cash Outflows (Expenses)', formatCurrency(reportData.totalExpenses)],
        ['Debt Repayments', formatCurrency(0)],
        ['Net Cash Flow', formatCurrency(reportData.totalSales - reportData.totalExpenses)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 70)
    addSectionTitle('5. SALES REPORT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Month', `Total Sales (${currencyPreference})`]],
      body: (reportData.monthlySales.length > 0 ? reportData.monthlySales : [{ month: 'No data', amount: 0 }]).map((item) => [
        item.month,
        formatCurrency(item.amount)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 60)
    addSectionTitle('6. EXPENSE REPORT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Expense Type', `Amount (${currencyPreference})`]],
      body: [
        ...reportData.expenseBreakdown.map((item) => [item.label.replace('/Wages', ''), formatCurrency(item.amount)]),
        ['Total', formatCurrency(totalExpenseRows)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 80)
    addSectionTitle('7. INVENTORY REPORT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Product', 'Open', 'Bought', 'Adj', 'Dmg', 'Close', `Cost (${currencyPreference})`, `Sell (${currencyPreference})`]],
      body: (reportData.inventoryReport.length > 0 ? reportData.inventoryReport : [{ name: 'No inventory data', openingStock: 0, purchasedQty: 0, adjustmentQty: 0, damagedQty: 0, closingStock: 0, costPrice: 0, sellingPrice: 0 }])
        .slice(0, 20)
        .map((item) => [item.name, String(item.openingStock), String(item.purchasedQty), String(item.adjustmentQty), String(item.damagedQty), String(item.closingStock), formatCurrency(item.costPrice), formatCurrency(item.sellingPrice)]),
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 7 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 90)
    addSectionTitle('8. DEBTORS & CREDITORS REPORT', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Debtors (Customers who owe money)', `Amount (${currencyPreference})`]],
      body: (reportData.debtors.length > 0 ? reportData.debtors : [{ name: 'None recorded', amount: 0 }]).map((item) => [item.name, formatCurrency(item.amount)]),
      theme: 'grid',
      headStyles: { fillColor: [184, 134, 11] },
      styles: { fontSize: 9 }
    })
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [['Creditors (Suppliers / recent payables exposure)', `Amount (${currencyPreference})`]],
      body: (reportData.creditors.length > 0 ? reportData.creditors : [{ name: 'No supplier balances tracked', amount: 0 }]).map((item) => [item.name, formatCurrency(item.amount)]),
      theme: 'grid',
      headStyles: { fillColor: [108, 117, 125] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 70)
    addSectionTitle('9. CASH FLOW FORECAST (PROJECTION)', y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Month', `Expected Income (${currencyPreference})`, `Expected Expenses (${currencyPreference})`, `Net Cash Flow (${currencyPreference})`]],
      body: reportData.cashFlowForecast.map((item) => [
        item.month,
        formatCurrency(item.income),
        formatCurrency(item.expenses),
        formatCurrency(item.netCashFlow)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126] },
      styles: { fontSize: 9 }
    })

    y = ensureRoom(doc.lastAutoTable.finalY + 12, 80)
    addSectionTitle('10. BUSINESS SUMMARY', y)
    doc.setFontSize(10)
    doc.text('Business Description:', 14, y + 8)
    doc.text(doc.splitTextToSize(businessDescription, 180), 14, y + 15)
    doc.text('Report Purpose:', 14, y + 34)
    doc.text(doc.splitTextToSize(reportPurpose, 180), 14, y + 41)
    doc.text('Repayment Plan:', 14, y + 58)
    doc.text(doc.splitTextToSize(repaymentPlan, 180), 14, y + 65)

    doc.addPage()
    addSectionTitle('DECLARATION', 24)
    doc.setFontSize(10)
    doc.text('I hereby declare that the information provided is true and accurate to the best of my knowledge.', 14, 36)
    doc.text(`Name: ${userProfile?.full_name || '___________________________'}`, 14, 62)
    doc.text('Signature: ___________________________', 14, 78)
    doc.text(`Date: ${generatedOn}`, 14, 94)
    doc.text(`Generated for: ${companyName}`, 14, 112)
    doc.text(`Outstanding Debtors: ${formatCurrency(totalDebtors)}`, 14, 128)
    doc.text(`Supplier Exposure / Creditors: ${formatCurrency(totalCreditors)}`, 14, 144)
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text('Generated by ShopMS. Some legal / statutory fields may require manual completion if not stored in the system.', pageWidth / 2, 280, { align: 'center' })

    const pageCount = doc.internal.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page)
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - 25, pageHeight - 8, { align: 'right' })
    }

    doc.save(`Business_Report_${companyName.replace(/\\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`)
  }

  if (!isManagementRole(userProfile?.role)) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Access Denied</h2>
        <p>You do not have permission to view shop reports. This section is restricted to shop owners or admins only.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading reports...
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Reports & Analytics</h1>
          <p style={{ color: 'var(--text-muted)' }}>Financial summary and performance metrics.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select 
            value={selectedShopId} 
            onChange={e => setSelectedShopId(e.target.value)}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
          >
            <option value="all">All Branches</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select 
            value={dateRange} 
            onChange={e => setDateRange(e.target.value)}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last Year</option>
          </select>
          <button className="btn btn-secondary" onClick={generatePDF} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
            <FileText size={20} />
            <span>PDF Report</span>
          </button>
          <button className="btn btn-primary" onClick={exportCSV}>
            <Download size={20} />
            <span>Export CSV</span>
          </button>
          <button onClick={generateBankReport} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #1a237e, #283593)', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
            <FileText size={18} />
            <span>Business Report</span>
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px' }}>
          <div style={{ padding: '10px', background: 'rgba(34, 139, 34, 0.1)', color: 'var(--success)', borderRadius: '10px' }}>
            <ArrowUpRight size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Revenue (Sales)</p>
            <h2 style={{ fontSize: '18px' }}>{formatCurrency(reportData.totalSales)}</h2>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px' }}>
          <div style={{ padding: '10px', background: 'rgba(220, 53, 69, 0.1)', color: 'var(--danger)', borderRadius: '10px' }}>
            <Package size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Cost of Goods (COGS)</p>
            <h2 style={{ fontSize: '18px' }}>{formatCurrency(reportData.totalPurchases)}</h2>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px' }}>
          <div style={{ padding: '10px', background: 'rgba(111, 66, 193, 0.1)', color: '#6f42c1', borderRadius: '10px' }}>
            <ArrowDownRight size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Operating Expenses</p>
            <h2 style={{ fontSize: '18px' }}>{formatCurrency(reportData.totalExpenses)}</h2>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px' }}>
          <div style={{ padding: '10px', background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)', borderRadius: '10px' }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Net Profit</p>
            <h2 style={{ fontSize: '18px', color: reportData.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(reportData.totalProfit || 0)}
            </h2>
          </div>
        </div>
      </div>

      {(() => {
        const isProfitable = reportData.totalProfit >= 0
        const profitMargin = reportData.totalSales > 0 ? (reportData.totalProfit / reportData.totalSales) * 100 : 0
        
        const labels = isProfitable 
            ? ['Total Revenue', 'Total Costs', 'Net Profit'] 
            : ['Total Revenue', 'Total Costs', 'Net Loss'];
            
        const data = [
            reportData.totalSales, 
            reportData.totalPurchases + reportData.totalExpenses, 
            Math.abs(reportData.totalProfit)
        ]
        
        const bgColors = isProfitable 
            ? ['rgba(10, 158, 93, 0.6)', 'rgba(108, 117, 125, 0.6)', 'rgba(34, 139, 34, 0.8)'] 
            : ['rgba(10, 158, 93, 0.6)', 'rgba(108, 117, 125, 0.6)', 'rgba(220, 53, 69, 0.8)']
            
        const borders = isProfitable
            ? ['#0a9e5d', '#6c757d', '#1e7e34']
            : ['#0a9e5d', '#6c757d', '#bd2130']

        const chartData = {
          labels,
          datasets: [{ data, backgroundColor: bgColors, borderColor: borders, borderWidth: 1 }]
        }
        
        const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, title: { display: false } } }
        
        const bestProduct = reportData.topProducts[0]
        const hHighestExpenseCat = [...reportData.expenseBreakdown].sort((a,b) => b.amount - a.amount)[0]

        return (
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Business Growth Insights (Financial Distribution)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
              <div style={{ height: '350px', width: '100%', maxWidth: '500px' }}>
                <Pie options={chartOptions} data={chartData} />
              </div>
              <div style={{ background: 'var(--surface-muted)', padding: '20px', borderRadius: '12px', borderLeft: `6px solid ${isProfitable ? 'var(--success)' : 'var(--danger)'}` }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>What this means for your business:</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-main)', lineHeight: '1.6' }}>
                  <li>Your overall profit margin is <strong>{profitMargin.toFixed(1)}%</strong>. {isProfitable ? 'You are currently running a profitable operation.' : 'Your expenses and COGS currently exceed your revenue resulting in a net loss. Immediate cost-cutting measures are recommended.'}</li>
                  {bestProduct && (
                    <li><strong>Product Strategy:</strong> '{bestProduct.name}' is driving the most volume. Consider running promotions or buying this in bulk to maximize margins.</li>
                  )}
                  {hHighestExpenseCat && hHighestExpenseCat.amount > 0 && (
                    <li><strong>Cost Optimization:</strong> Your highest expense category is '{hHighestExpenseCat.label}'. Reviewing these costs could rapidly improve your bottom line.</li>
                  )}
                  {reportData.lowStock.length > 0 && (
                    <li><strong>Inventory Warning:</strong> You have {reportData.lowStock.length} items running low on stock. Restock soon to prevent missed sales.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', marginBottom: '24px' }}>
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Top Selling Products</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 0' }}>Product</th>
                <th style={{ padding: '12px 0' }}>Qty</th>
                <th style={{ padding: '12px 0' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {reportData.topProducts.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{item.name}</td>
                  <td style={{ padding: '12px 0' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 0' }}>{formatCurrency(item.revenue)}</td>
                </tr>
              ))}
              {reportData.topProducts.length === 0 && (
                <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No product data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Top Performing Services</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 0' }}>Service</th>
                <th style={{ padding: '12px 0' }}>Count</th>
                <th style={{ padding: '12px 0' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {reportData.topServices.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 0', fontWeight: 'bold', color: 'var(--primary)' }}>{item.name}</td>
                  <td style={{ padding: '12px 0' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 0' }}>{formatCurrency(item.revenue)}</td>
                </tr>
              ))}
              {reportData.topServices.length === 0 && (
                <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No service data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Staff Performance (Services)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 0' }}>Staff Member</th>
                <th style={{ padding: '12px 0' }}>Services Completed</th>
                <th style={{ padding: '12px 0' }}>Total Revenue Generated</th>
                <th style={{ padding: '12px 0' }}>Avg. Value</th>
              </tr>
            </thead>
            <tbody>
              {reportData.staffPerformance.map((staff, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(34, 139, 34, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                        {staff.name.substring(0, 1).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: '500' }}>{staff.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 0' }}>{staff.services}</td>
                  <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{formatCurrency(staff.revenue)}</td>
                  <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>{formatCurrency(staff.revenue / staff.services, { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
              {reportData.staffPerformance.length === 0 && (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No staff performance data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Reports
