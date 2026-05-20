/**
 * STANDARDIZED PROFIT FORMULA
 * 
 * Revenue = Sum(Sale Total)
 * COGS = Sum(Sale Item Quantity * Product Cost Price)
 * Expenses = Sum(Expense Amount)
 * 
 * Gross Profit = Revenue - COGS
 * Net Profit = Gross Profit - Expenses
 */

export const calculateNetProfit = ({
  totalSales = 0,
  totalCOGS = 0,
  totalExpenses = 0
}) => Number(totalSales || 0) - Number(totalCOGS || 0) - Number(totalExpenses || 0)

export const calculateStandardEconomics = (salesData = [], expensesData = []) => {
  let revenue = 0
  let cogs = 0
  let grossProfit = 0
  let totalExpenses = 0
  let netProfit = 0

  // 1. Process Sales for Revenue and COGS
  salesData.forEach(sale => {
    revenue += Number(sale.total_amount || 0)
    
    sale.sale_items?.forEach(item => {
      // Use the cost_price stored in sale_items for accurate COGS
      cogs += Number(item.cost_price || 0) * Number(item.quantity || 1)
    })
  })

  // 2. Process Expenses
  totalExpenses = expensesData.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  // 3. Final Calculations
  grossProfit = revenue - cogs
  netProfit = grossProfit - totalExpenses

  return {
    revenue,
    cogs,
    grossProfit,
    totalExpenses,
    netProfit,
    margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
  }
}

export const getPageCount = (totalItems, pageSize) => {
  if (!pageSize || pageSize < 1) return 1
  return Math.max(1, Math.ceil(Number(totalItems || 0) / pageSize))
}
