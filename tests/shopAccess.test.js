import test from 'node:test'
import assert from 'node:assert/strict'

import { getShopAccessStatus } from '../src/lib/shopAccess.js'

test('manual close blocks modifications', () => {
  const result = getShopAccessStatus({
    id: 'shop-1',
    opening_time: '08:00',
    closing_time: '18:00',
    is_manually_closed: true
  }, new Date('2026-03-25T10:00:00'))

  assert.equal(result.canModify, false)
  assert.equal(result.isManuallyClosed, true)
})

test('shop can modify during configured hours', () => {
  const result = getShopAccessStatus({
    id: 'shop-1',
    opening_time: '08:00',
    closing_time: '18:00',
    is_manually_closed: false
  }, new Date('2026-03-25T10:00:00'))

  assert.equal(result.canModify, true)
})

test('shop blocks modifications after closing time', () => {
  const result = getShopAccessStatus({
    id: 'shop-1',
    opening_time: '08:00',
    closing_time: '18:00',
    is_manually_closed: false
  }, new Date('2026-03-25T20:00:00'))

  assert.equal(result.canModify, false)
})
