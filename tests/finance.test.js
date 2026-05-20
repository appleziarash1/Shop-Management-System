import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateNetProfit, getPageCount } from '../src/lib/finance.js'
import { canEditExpenses, isManagementRole } from '../src/lib/roles.js'

test('calculateNetProfit subtracts cogs and expenses from sales', () => {
  const result = calculateNetProfit({
    totalSales: 100000,
    totalCOGS: 35000,
    totalExpenses: 5000
  })

  assert.equal(result, 60000)
})

test('getPageCount always returns at least one page', () => {
  assert.equal(getPageCount(0, 10), 1)
  assert.equal(getPageCount(21, 10), 3)
})

test('management roles can edit expenses', () => {
  assert.equal(isManagementRole('Owner'), true)
  assert.equal(isManagementRole('Admin'), true)
  assert.equal(isManagementRole('Manager'), true)
  assert.equal(canEditExpenses('Cashier'), false)
})
