import { describe, expect, test } from 'vitest'

import { fullName, type LocalProduct } from '@/products/product'
import { summarizeStatus, purchaseSuggestions, buildSuggestionText, suggestedQty } from '@/stock/stock'

function part(partial: Partial<LocalProduct> & Pick<LocalProduct, 'id' | 'name'>): LocalProduct {
  return {
    type: 'part', brand: null, categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false, sellingPrice: 10000,
    stock: 10, minStock: 0, avgCost: 8000, purchaseCode: null, barcodes: [], partNumbers: [], active: true, ...partial,
  }
}

const PRODUCT = [
  part({ id: 'safe', name: 'Oli MPX', stock: 10, minStock: 3 }),
  part({ id: 'tipis', name: 'Busi C7HSA', brand: 'NGK', stock: 2, minStock: 5 }),
  part({ id: 'out', name: 'Kampas Rem', stock: 0, minStock: 4 }),
  part({ id: 'negative', name: 'Baut 10', stock: -3, minStock: 0 }),
  part({ id: 'pantau-tidak', name: 'Lampu', stock: 6, minStock: 0 }),
  part({ id: 'nonaktif', name: 'Rantai lama', stock: 0, minStock: 2, active: false }),
  part({ id: 'jasa', name: 'Servis', type: 'jasa', stock: null }),
]

test('usulan qty = (stok minimum x 2) - stok, tidak negatif (PRD 4.3)', () => {
  expect(suggestedQty(2, 5)).toBe(8)
  expect(suggestedQty(0, 4)).toBe(8)
  expect(suggestedQty(-3, 0)).toBe(3)
  expect(suggestedQty(0, 0)).toBe(0)
  expect(suggestedQty(0.5, 1.5)).toBe(2.5)
})

describe('purchaseSuggestions', () => {
  test('hanya part aktif berstatus Menipis, Habis, atau Minus, urut nama', () => {
    const result = purchaseSuggestions(PRODUCT)
    expect(result.map((b) => [fullName(b.product), b.status, b.suggested])).toEqual([
      ['Baut 10', 'negative', 3],
      ['Busi C7HSA · NGK', 'low', 8],
      ['Kampas Rem', 'out', 8],
    ])
  })
})

test('ringkasan status untuk kartu filter', () => {
  expect(summarizeStatus(PRODUCT)).toEqual({ all: 5, safe: 1, low: 1, out: 1, negative: 1, unmonitored: 1 })
})

test('saran belanja untuk printer struk muat di 32 karakter', () => {
  const lines = buildSuggestionText(purchaseSuggestions(PRODUCT), 32, 'SARAN BELANJA 18/10/2026')
  expect(lines.every((b) => b.length <= 32)).toBe(true)
  expect(lines.some((l) => /supplier/i.test(l))).toBe(false)
  expect(lines).toContain('Busi C7HSA · NGK')
})
