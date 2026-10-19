import { describe, expect, test } from 'vitest'

import { fastMoving, marginPercent, slowMoving, summarizeStockValue, type ProductSalesRow, type StockValueRow } from '@/reports/reports'

const TODAY = '2026-10-19'
// 90 hari terakhir = 22/07/2026 sampai 19/10/2026; batasnya 21/07/2026.
const OLD = '2026-07-01T03:00:00Z'

function row(p: Partial<StockValueRow> & Pick<StockValueRow, 'name'>): StockValueRow {
  return { productId: p.name, brand: null, category: 'Oli', unit: 'pcs', stock: 5, avgCost: 10000, value: 50000, registeredAt: OLD, lastSold: null, ...p }
}

describe('slowMoving (R29)', () => {
  test('stok ada, tidak terjual 90 hari, terdaftar lebih dari 90 hari; urut nilai persediaan', () => {
    const rows = [
      row({ name: 'Belum pernah terjual', value: 20000 }),
      row({ name: 'Terjual tepat di batas', lastSold: '2026-07-21', value: 90000 }),
      row({ name: 'Terjual dalam 90 hari', lastSold: '2026-07-22' }),
      row({ name: 'Stok habis', stock: 0, value: 0 }),
      row({ name: 'Stok minus', stock: -2, value: 0 }),
      row({ name: 'Baru didaftarkan', registeredAt: '2026-09-01T03:00:00Z' }),
      // 21/07/2026 pukul 23:30 WIB masih tanggal 21 di WIB walaupun 16:30 UTC.
      row({ name: 'Terdaftar tepat di batas (WIB)', registeredAt: '2026-07-21T16:30:00Z', value: 10000 }),
      row({ name: 'Terdaftar sehari setelah batas (WIB)', registeredAt: '2026-07-21T17:30:00Z' }),
    ]
    expect(slowMoving(rows, TODAY).map((r) => r.name)).toEqual(['Terjual tepat di batas', 'Belum pernah terjual', 'Terdaftar tepat di batas (WIB)'])
  })
})

test('fastMoving: hanya part, urut qty terjual, paling banyak 20', () => {
  const rows: ProductSalesRow[] = Array.from({ length: 25 }, (_, i) => ({
    productId: `p${i}`, name: `Part ${i}`, brand: null, type: 'part', category: 'Oli', qty: i + 1, revenue: 1000, cogs: 500, stock: 3,
  }))
  rows.push({ productId: 'j', name: 'Servis', brand: null, type: 'jasa', category: 'Jasa', qty: 999, revenue: 1, cogs: 0, stock: null })
  const fast = fastMoving(rows)
  expect(fast).toHaveLength(20)
  expect(fast[0].name).toBe('Part 24')
  expect(fast.some((r) => r.type === 'jasa')).toBe(false)
})

test('ringkasan nilai persediaan: stok minus dan tanpa harga beli dihitung terpisah (R30)', () => {
  const s = summarizeStockValue([
    row({ name: 'A', category: 'Oli', value: 50000 }),
    row({ name: 'B', category: 'Busi', stock: -3, avgCost: 20000, value: 0 }),
    row({ name: 'C', category: 'Busi', stock: 2, avgCost: 0, value: 0 }),
    row({ name: 'D', category: 'Busi', value: 70000 }),
  ])
  expect(s).toEqual({
    total: 120000,
    negativeCount: 1,
    noCostCount: 1,
    byCategory: [
      { category: 'Busi', parts: 3, value: 70000 },
      { category: 'Oli', parts: 1, value: 50000 },
    ],
  })
})

test('margin laba kotor', () => {
  expect(marginPercent(180500, 120000)).toBe(33.5)
  expect(marginPercent(0, 0)).toBeNull()
})
