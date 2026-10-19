import { expect, test } from 'vitest'

import { catalogCategories, catalogItems } from '@/pos/catalog'
import type { LocalProduct } from '@/products/product'

const p = (o: Partial<LocalProduct>): LocalProduct => ({
  id: o.name ?? 'x', type: 'part', name: 'x', brand: null, categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false,
  sellingPrice: 1000, stock: 1, minStock: 0, avgCost: 0, barcodes: [], partNumbers: [], active: true, ...o,
})

const LIST = [
  p({ name: 'Oli MPX', categoryId: 'oli', category: 'Oli' }),
  p({ name: 'Busi C7HSA', categoryId: 'busi', category: 'Busi' }),
  p({ name: 'Servis Ringan', type: 'jasa', stock: null, categoryId: 'jasa', category: 'Jasa Servis' }),
  p({ name: 'Aki lama', categoryId: 'aki', category: 'Kelistrikan', active: false }),
  p({ name: 'Oli Gardan', categoryId: 'oli', category: 'Oli' }),
]

test('tab kategori hanya dari produk aktif, urut nama, dengan jumlah produknya', () => {
  expect(catalogCategories(LIST)).toEqual([
    { id: 'busi', name: 'Busi', count: 1 },
    { id: 'jasa', name: 'Jasa Servis', count: 1 },
    { id: 'oli', name: 'Oli', count: 2 },
  ])
})

test('isi katalog: produk aktif urut nama, bisa disaring kategori dan kata kunci', () => {
  expect(catalogItems(LIST, null, '').map((x) => x.name)).toEqual(['Busi C7HSA', 'Oli Gardan', 'Oli MPX', 'Servis Ringan'])
  expect(catalogItems(LIST, 'oli', '').map((x) => x.name)).toEqual(['Oli Gardan', 'Oli MPX'])
  expect(catalogItems(LIST, 'oli', 'mpx').map((x) => x.name)).toEqual(['Oli MPX'])
})
