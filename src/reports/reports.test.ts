import { describe, expect, test } from 'vitest'

import { fastMoving, slowMoving, type ProductSalesRow, type StockValueRow } from '@/reports/reports'

const TODAY = '2026-10-19'
// 90 hari terakhir = 22/07/2026 sampai 19/10/2026; batasnya 21/07/2026.
const OLD = '2026-07-01T03:00:00Z'

function row(p: Partial<StockValueRow> & Pick<StockValueRow, 'name'>): StockValueRow {
  return { productId: p.name, brand: null, category: 'Oli', unit: 'pcs', stock: 5, avgCost: 10000, value: 50000, registeredAt: OLD, lastSold: null, ...p }
}

describe('slowMoving (R29)', () => {
  test('stok ada, tidak terjual 90 hari, terdaftar lebih dari 90 hari; urut stok terbanyak', () => {
    const rows = [
      row({ name: 'Belum pernah terjual', stock: 4 }),
      row({ name: 'Terjual tepat di batas', lastSold: '2026-07-21', stock: 9 }),
      row({ name: 'Terjual dalam 90 hari', lastSold: '2026-07-22' }),
      row({ name: 'Stok habis', stock: 0, value: 0 }),
      row({ name: 'Stok minus', stock: -2, value: 0 }),
      row({ name: 'Baru didaftarkan', registeredAt: '2026-09-01T03:00:00Z' }),
      // 21/07/2026 pukul 23:30 WIB masih tanggal 21 di WIB walaupun 16:30 UTC.
      row({ name: 'Terdaftar tepat di batas (WIB)', registeredAt: '2026-07-21T16:30:00Z', stock: 1 }),
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
