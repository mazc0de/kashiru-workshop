import { describe, expect, test } from 'vitest'

import { isReasonComplete, canConfirm, summarizeStocktake, buildCountSheet, type StocktakeLine } from '@/stocktake/stocktake'

function line(partial: Partial<StocktakeLine> & Pick<StocktakeLine, 'productId' | 'name'>): StocktakeLine {
  return {
    brand: null, unit: 'pcs', category: 'Busi', decision: 'dihitung', countedQty: 5, countedAt: '2026-10-18T02:00:00Z',
    stockAtCount: 5, currentStock: 5, variance: 0, avgCost: 10000, varianceValue: 0, reason: null,
    reasonNote: null, purchasePriceInput: null, needsPurchasePrice: false, ...partial,
  }
}

const SESSION: StocktakeLine[] = [
  line({ productId: 'a', name: 'Busi A' }),
  line({ productId: 'b', name: 'Busi B', countedQty: 3, variance: -2, varianceValue: -20000 }),
  line({ productId: 'c', name: 'Busi C', decision: 'dianggap_nol', countedQty: null, stockAtCount: null, currentStock: 4, variance: -4, varianceValue: -40000, reason: 'hilang' }),
  line({ productId: 'd', name: 'Baut', category: 'Baut', decision: null, countedQty: null, variance: null, varianceValue: null }),
  line({ productId: 'e', name: 'Baut baru', category: 'Baut', countedQty: 3, stockAtCount: 0, avgCost: 0, variance: 3, varianceValue: 0, reason: 'ketemu', needsPurchasePrice: true }),
  line({ productId: 'f', name: 'Busi lama', decision: 'dilewati', countedQty: null, variance: null, varianceValue: null }),
]

describe('summarizeStocktake', () => {
  test('menghitung kemajuan, selisih, dan syarat konfirmasi', () => {
    expect(summarizeStocktake(SESSION)).toEqual({
      total: 6,
      dihitung: 3,
      undecided: 1,
      assumedZero: 1,
      dilewati: 1,
      overCount: 1,
      shortCount: 2,
      matched: 1,
      overValue: 0,
      shortValue: -60000,
      incomplete: 2,
    })
    expect(canConfirm(summarizeStocktake(SESSION))).toBe(false)
  })

  test('siap dikonfirmasi setelah semua diputuskan, beralasan, dan berharga beli', () => {
    const complete = SESSION.map((b) =>
      b.productId === 'd' ? { ...b, decision: 'dilewati' as const } : b.productId === 'b' ? { ...b, reason: 'rusak' as const } : b.productId === 'e' ? { ...b, purchasePriceInput: 2500 } : b,
    )
    expect(canConfirm(summarizeStocktake(complete))).toBe(true)
  })
})

test('alasan Lainnya wajib keterangan (R8)', () => {
  const b = line({ productId: 'x', name: 'X', variance: -1, reason: 'lainnya' })
  expect(isReasonComplete(b)).toBe(false)
  expect(isReasonComplete({ ...b, reasonNote: 'Dipakai bengkel' })).toBe(true)
})

test('lembar hitung tanpa stok sistem, dikelompokkan per kategori, muat di 32 karakter', () => {
  const sorted = [...SESSION].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  const text = buildCountSheet(sorted, 32, ['LEMBAR HITUNG', 'OPN-20261018-01'])
  expect(text.every((t) => t.length <= 32)).toBe(true)
  expect(text).toContain('BAUT')
  expect(text).toContain('BUSI')
  expect(text.indexOf('BAUT')).toBeLessThan(text.indexOf('BUSI'))
  expect(text.join('\n')).not.toMatch(/stok/i)
  expect(text).toContain(`  pcs${' '.repeat(15)}qty ________`)
})
