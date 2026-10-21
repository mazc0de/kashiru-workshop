import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'

import { listMechanics, db, toLocalProduct, deductOutboxStock, type ServerProductRow } from '@/lib/localCopy'

const ROW: ServerProductRow = {
  id: 'p1',
  tipe: 'part',
  nama: 'Oli MPX 1L',
  merek: 'AHM',
  category_id: 'k-oli',
  satuan: 'pcs',
  bisa_pecahan: false,
  harga_jual: 52000,
  stok_min: 3,
  harga_beli_avg: 41538.46,
  kode_harga_beli: 'ABGSK',
  aktif: true,
  categories: { nama: 'Oli' },
  stock_levels: { qty_on_hand: -2 },
  product_barcodes: [{ barcode: '8990000001' }, { barcode: '200005' }],
  product_part_numbers: [{ kode_part: '08232-M99-K0LN0' }],
}

afterEach(async () => {
  await db.products.clear()
})

describe('toLocalProduct', () => {
  test('memetakan baris server ke bentuk aplikasi, stok minus tetap minus', () => {
    expect(toLocalProduct(ROW)).toEqual({
      id: 'p1',
      type: 'part',
      name: 'Oli MPX 1L',
      brand: 'AHM',
      categoryId: 'k-oli',
      category: 'Oli',
      unit: 'pcs',
      allowsFraction: false,
      sellingPrice: 52000,
      stock: -2,
      minStock: 3,
      avgCost: 41538.46,
      purchaseCode: 'ABGSK',
      barcodes: ['200005', '8990000001'],
      partNumbers: ['08232-M99-K0LN0'],
      active: true,
    })
  })

  test('jasa tidak punya stok', () => {
    const services = toLocalProduct({ ...ROW, id: 'j1', tipe: 'jasa', satuan: null, stock_levels: null, product_barcodes: [], product_part_numbers: [] })
    expect(services.stock).toBeNull()
  })
})

test('salinan bisa dicari lewat barcode dengan indeks multi-entry', async () => {
  await db.products.bulkPut([toLocalProduct(ROW), toLocalProduct({ ...ROW, id: 'p2', nama: 'Busi', product_barcodes: [{ barcode: '200006' }] })])
  expect((await db.products.where('barcodes').equals('200005').first())?.id).toBe('p1')
  expect((await db.products.where('barcodes').equals('200006').first())?.id).toBe('p2')
  expect(await db.products.where('barcodes').equals('999').first()).toBeUndefined()
})

describe('deductOutboxStock', () => {
  const oil = toLocalProduct(ROW)
  const brakePad = toLocalProduct({ ...ROW, id: 'p2', nama: 'Kampas', bisa_pecahan: true, stock_levels: { qty_on_hand: 4 } })
  const services = toLocalProduct({ ...ROW, id: 'j1', tipe: 'jasa', stock_levels: null })

  test('stok = stok server dikurangi qty nota yang belum terkirim, termasuk yang gagal (R25)', () => {
    const result = deductOutboxStock(
      [oil, brakePad, services],
      [
        { stockOut: [{ productId: 'p1', qty: 1 }, { productId: 'p2', qty: 0.3 }] },
        { stockOut: [{ productId: 'p2', qty: 0.1 }] },
      ],
    )
    expect(result.map((p) => [p.id, p.stock])).toEqual([
      ['p1', -3],
      ['p2', 3.6],
      ['j1', null],
    ])
  })

  test('tanpa antrean, salinan tidak berubah', () => {
    expect(deductOutboxStock([oil], [])).toEqual([oil])
  })
})

test('daftar mekanik untuk isian nota terurut nama, walaupun tabelnya tidak berindeks nama', async () => {
  await db.mechanics.bulkPut([
    { id: 'm2', name: 'Budi' },
    { id: 'm1', name: 'andi' },
    { id: 'm3', name: 'Cecep' },
  ])
  expect((await listMechanics()).map((m) => m.name)).toEqual(['andi', 'Budi', 'Cecep'])
  await db.mechanics.clear()
})
