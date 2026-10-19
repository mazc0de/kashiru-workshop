import { describe, expect, test } from 'vitest'

import type { LocalProduct } from '@/products/product'
import { lineValue, validateReceiving, addBonusLine, addPartLine } from '@/receiving/receiving'

function part(partial: Partial<LocalProduct> & Pick<LocalProduct, 'id' | 'name'>): LocalProduct {
  return {
    type: 'part', brand: null, categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false, sellingPrice: 52000,
    stock: 0, minStock: 0, avgCost: 0, barcodes: [], partNumbers: [], active: true, ...partial,
  }
}

const OIL = part({ id: 'oli', name: 'Oli MPX 1L', brand: 'AHM' })
const BULK = part({ id: 'curah', name: 'Oli Curah', unit: 'liter', allowsFraction: true })

describe('addPartLine', () => {
  test('scan yang sama menambah qty, harga default dari harga beli terakhir', () => {
    let r = addPartLine([], OIL, 45000, 'a')
    expect(r.lines[0]).toMatchObject({ qty: '1', price: '45.000', bonus: false })
    r = addPartLine(r.lines, OIL, 45000, 'b')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].qty).toBe('2')
    expect(r.index).toBe(0)
  })

  test('part tanpa harga beli terakhir dibiarkan kosong supaya diisi', () => {
    expect(addPartLine([], BULK, null, 'a').lines[0].price).toBe('')
  })
})

test('baris bonus Rp 0 tepat di bawah barisnya dan tidak ikut bertambah saat scan (R6)', () => {
  let lines = addPartLine([], OIL, 45000, 'a').lines
  lines = addPartLine(lines, BULK, 30000, 'b').lines
  lines = addBonusLine(lines, 0, 'c')
  expect(lines.map((b) => [b.productId, b.price, b.bonus])).toEqual([
    ['oli', '45.000', false],
    ['oli', '0', true],
    ['curah', '30.000', false],
  ])
  lines = addPartLine(lines, OIL, 45000, 'd').lines
  expect(lines.map((b) => b.qty)).toEqual(['2', '1', '1'])
})

describe('validateReceiving', () => {
  test('mengubah teks menjadi angka dan menghitung total', () => {
    let lines = addPartLine([], OIL, 45000, 'a').lines
    lines = addBonusLine(lines, 0, 'b')
    lines = [...lines, { ...addPartLine([], BULK, 30000, 'c').lines[0], qty: '2,5' }]
    lines[0] = { ...lines[0], qty: '12' }
    expect(validateReceiving(lines)).toEqual({
      ok: true,
      items: [
        { product_id: 'oli', qty: 12, harga_beli: 45000 },
        { product_id: 'oli', qty: 1, harga_beli: 0 },
        { product_id: 'curah', qty: 2.5, harga_beli: 30000 },
      ],
      total: 615000,
    })
  })

  test('qty pecahan pada part biasa, harga kosong, dan penerimaan kosong ditolak', () => {
    const lines = [{ ...addPartLine([], OIL, null, 'a').lines[0], qty: '1,5' }, { ...addPartLine([], BULK, null, 'b').lines[0] }]
    const result = validateReceiving(lines)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toEqual({ a: 'Qty harus bilangan bulat', b: 'Isi harga beli dalam rupiah (boleh 0 untuk bonus)' })
    expect(validateReceiving([])).toMatchObject({ ok: false, message: 'Penerimaan belum punya baris. Scan atau cari part.' })
  })
})

test('nilai baris selagi diketik', () => {
  expect(lineValue({ ...addPartLine([], OIL, 45000, 'a').lines[0], qty: '3' })).toBe(135000)
  expect(lineValue({ ...addPartLine([], OIL, null, 'a').lines[0] })).toBeNull()
})
