import { describe, expect, test } from 'vitest'

import { findByBarcode, searchProducts, fullName, stockStatus, type LocalProduct } from '@/products/product'

function product(partial: Partial<LocalProduct> & Pick<LocalProduct, 'id' | 'name'>): LocalProduct {
  return {
    type: 'part',
    brand: null,
    categoryId: 'k-rem',
    category: 'Rem',
    unit: 'pcs',
    allowsFraction: false,
    sellingPrice: 10000,
    stock: 5,
    minStock: 0,
    avgCost: 8000,
    barcodes: [],
    partNumbers: [],
    active: true,
    ...partial,
  }
}

const LIST: LocalProduct[] = [
  product({ id: 'kampas-vario', name: 'Kampas Rem Depan Vario 125', brand: 'Federal', barcodes: ['8991234500011'], partNumbers: ['06455-KVB-305'] }),
  product({ id: 'kampas-beat', name: 'Kampas Rem Belakang Beat', brand: 'AHM', barcodes: ['200001'], partNumbers: ['43130-KVB-900'] }),
  product({ id: 'oli-mpx', name: 'Oli MPX 1L', brand: 'AHM', categoryId: 'k-oli', category: 'Oli', barcodes: ['8990000001'] }),
  product({ id: 'oli-curah', name: 'Oli Mesin Curah', brand: 'Pertamina', categoryId: 'k-oli', category: 'Oli', unit: 'liter', allowsFraction: true }),
  product({ id: 'servis-rem', name: 'Servis rem', type: 'jasa', categoryId: 'k-jasa', category: 'Jasa Servis', stock: null, unit: null }),
  product({ id: 'busi-lama', name: 'Busi C7HSA', brand: 'NGK', active: false }),
]

const ids = (result: LocalProduct[]) => result.map((p) => p.id)

describe('searchProducts', () => {
  test('setiap kata harus cocok, tanpa membedakan huruf besar-kecil', () => {
    expect(ids(searchProducts(LIST, 'kampas vario'))).toEqual(['kampas-vario'])
    expect(ids(searchProducts(LIST, 'KAMPAS'))).toEqual(['kampas-beat', 'kampas-vario'])
  })

  test('merek ikut dicari', () => {
    expect(ids(searchProducts(LIST, 'ahm'))).toEqual(['kampas-beat', 'oli-mpx'])
    expect(ids(searchProducts(LIST, 'oli ahm'))).toEqual(['oli-mpx'])
  })

  test('kode part dicari tanpa peduli tanda hubung', () => {
    expect(ids(searchProducts(LIST, '06455-KVB-305'))).toEqual(['kampas-vario'])
    expect(ids(searchProducts(LIST, '06455kvb'))).toEqual(['kampas-vario'])
    expect(ids(searchProducts(LIST, 'kvb'))).toEqual(['kampas-beat', 'kampas-vario'])
  })

  test('barcode yang sama persis ditaruh paling atas', () => {
    expect(ids(searchProducts(LIST, '200001'))).toEqual(['kampas-beat'])
    expect(ids(searchProducts(LIST, '8991234500011'))).toEqual(['kampas-vario'])
  })

  test('produk nonaktif tidak muncul kecuali diminta', () => {
    expect(ids(searchProducts(LIST, 'busi'))).toEqual([])
    expect(ids(searchProducts(LIST, 'busi', { includeInactive: true }))).toEqual(['busi-lama'])
  })

  test('filter kategori dan batas jumlah', () => {
    expect(ids(searchProducts(LIST, 'oli', { categoryId: 'k-rem' }))).toEqual([])
    expect(ids(searchProducts(LIST, 'oli', { categoryId: 'k-oli' }))).toEqual(['oli-curah', 'oli-mpx'])
    expect(ids(searchProducts(LIST, '', { categoryId: 'k-oli' }))).toEqual(['oli-curah', 'oli-mpx'])
    expect(searchProducts(LIST, '', { limit: 2 })).toHaveLength(2)
  })

  test('kueri yang tidak cocok mengembalikan daftar kosong', () => {
    expect(searchProducts(LIST, 'rantai')).toEqual([])
  })
})

describe('findByBarcode', () => {
  test('hanya barcode yang sama persis pada produk aktif', () => {
    expect(findByBarcode(LIST, '200001')?.id).toBe('kampas-beat')
    expect(findByBarcode(LIST, '20000')).toBeNull()
    expect(findByBarcode(LIST, ' 8990000001 ')?.id).toBe('oli-mpx')
  })
})

describe('statusStok (PRD 4.3)', () => {
  test('dengan stok minimum', () => {
    expect(stockStatus(6, 5)).toBe('safe')
    expect(stockStatus(5, 5)).toBe('low')
    expect(stockStatus(0.5, 2)).toBe('low')
    expect(stockStatus(0, 5)).toBe('out')
    expect(stockStatus(-2, 5)).toBe('negative')
  })

  test('stok minimum 0 hanya Habis atau Minus', () => {
    expect(stockStatus(10, 0)).toBeNull()
    expect(stockStatus(0, 0)).toBe('out')
    expect(stockStatus(-1, 0)).toBe('negative')
  })
})

test('namaLengkap memakai titik tengah sebelum merek', () => {
  expect(fullName({ name: 'Oli MPX 1L', brand: 'AHM' })).toBe('Oli MPX 1L · AHM')
  expect(fullName({ name: 'Servis rem', brand: null })).toBe('Servis rem')
})
