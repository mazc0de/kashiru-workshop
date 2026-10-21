import { describe, expect, test } from 'vitest'

import type { LocalProduct } from '@/products/product'
import { validateReceiving, addPartLine } from '@/receiving/receiving'

function part(partial: Partial<LocalProduct> & Pick<LocalProduct, 'id' | 'name'>): LocalProduct {
  return {
    type: 'part', brand: null, categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false, sellingPrice: 52000,
    stock: 0, minStock: 0, avgCost: 0, purchaseCode: null, barcodes: [], partNumbers: [], active: true, ...partial,
  }
}

const OIL = part({ id: 'oli', name: 'Oli MPX 1L', brand: 'AHM', purchaseCode: 'ABGSK' })
const BULK = part({ id: 'curah', name: 'Oli Curah', unit: 'liter', allowsFraction: true })

describe('addPartLine', () => {
  test('scan yang sama menambah qty; kode harga terisi kode part saat ini (R64)', () => {
    let r = addPartLine([], OIL, 'a')
    expect(r.lines[0]).toMatchObject({ qty: '1', code: 'ABGSK', originalCode: 'ABGSK' })
    r = addPartLine(r.lines, OIL, 'b')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].qty).toBe('2')
    expect(r.index).toBe(0)
  })

  test('part tanpa kode harga dibiarkan kosong', () => {
    expect(addPartLine([], BULK, 'a').lines[0].code).toBe('')
  })
})

describe('validateReceiving', () => {
  test('harga beli selalu 0; kode hanya dikirim kalau diubah, dirapikan jadi kapital (R64)', () => {
    let lines = addPartLine([], OIL, 'a').lines
    lines = addPartLine(lines, BULK, 'b').lines
    lines = [...lines, { ...addPartLine([], part({ id: 'busi', name: 'Busi', purchaseCode: 'KM' }), 'c').lines[0], code: '' }]
    lines[0] = { ...lines[0], qty: '12' }
    lines[1] = { ...lines[1], qty: '2,5', code: ' kmt ' }
    expect(validateReceiving(lines)).toEqual({
      ok: true,
      items: [
        { product_id: 'oli', qty: 12, harga_beli: 0 },
        { product_id: 'curah', qty: 2.5, harga_beli: 0, kode_harga_beli: 'KMT' },
        { product_id: 'busi', qty: 1, harga_beli: 0 },
      ],
    })
  })

  test('qty pecahan pada part biasa, kode berisi angka, dan penerimaan kosong ditolak', () => {
    const lines = [{ ...addPartLine([], OIL, 'a').lines[0], qty: '1,5' }, { ...addPartLine([], BULK, 'b').lines[0], code: '45000' }]
    const result = validateReceiving(lines)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toEqual({ a: 'Qty harus bilangan bulat', b: 'Isi dengan kode harga (huruf), bukan angka.' })
    expect(validateReceiving([])).toMatchObject({ ok: false, message: 'Penerimaan belum punya baris. Scan atau cari part.' })
  })
})
