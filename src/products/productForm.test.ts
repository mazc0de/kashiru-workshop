import { describe, expect, test } from 'vitest'

import { diffList, EMPTY_FIELDS, fieldsFromProduct, validateProduct, priceWarning, unitOptions, COMMON_UNITS, type FormFields } from '@/products/productForm'

const part = (partial: Partial<FormFields>): FormFields => ({ ...EMPTY_FIELDS, name: 'Oli MPX 1L', categoryId: 'k-oli', sellingPrice: '52.000', ...partial })
const services = (partial: Partial<FormFields>): FormFields => ({ ...EMPTY_FIELDS, type: 'jasa', name: 'Servis rem', categoryId: 'k-jasa', sellingPrice: '35.000', ...partial })

describe('validateProduct', () => {
  test('part baru dengan stok awal dan harga beli', () => {
    expect(validateProduct(part({ brand: ' AHM ', initialStock: '10', purchasePrice: '40.000', minStock: '3' }), true)).toEqual({
      ok: true,
      value: {
        type: 'part',
        name: 'Oli MPX 1L',
        brand: 'AHM',
        categoryId: 'k-oli',
        unit: 'pcs',
        allowsFraction: false,
        sellingPrice: 52000,
        minStock: 3,
        initialStock: 10,
        purchasePrice: 40000,
      },
    })
  })

  test('stok awal tanpa harga beli ditolak (PRD 4.2)', () => {
    expect(validateProduct(part({ initialStock: '10' }), true)).toEqual({
      ok: false,
      errors: { purchasePrice: 'Harga beli wajib diisi dan lebih dari Rp 0 kalau stok awal diisi' },
    })
    expect(validateProduct(part({ initialStock: '10', purchasePrice: '0' }), true).ok).toBe(false)
  })

  test('stok awal 0 atau kosong berarti tanpa stok awal', () => {
    const result = validateProduct(part({ initialStock: '0' }), true)
    expect(result.ok && result.value.initialStock).toBe(null)
  })

  test('harga jual part wajib > 0, tarif jasa boleh 0 (R5)', () => {
    expect(validateProduct(part({ sellingPrice: '0' }), true)).toEqual({ ok: false, errors: { sellingPrice: 'Harga jual part wajib lebih dari Rp 0' } })
    const free = validateProduct(services({ sellingPrice: '0' }), true)
    expect(free.ok && free.value.sellingPrice).toBe(0)
  })

  test('jasa tidak menyimpan merek, satuan, stok minimum, atau stok awal', () => {
    const result = validateProduct(services({ brand: 'X', unit: 'pcs', minStock: '5', initialStock: '3', purchasePrice: '1000', allowsFraction: true }), true)
    expect(result).toEqual({
      ok: true,
      value: { type: 'jasa', name: 'Servis rem', brand: null, categoryId: 'k-jasa', unit: null, allowsFraction: false, sellingPrice: 35000, minStock: 0, initialStock: null, purchasePrice: null },
    })
  })

  test('qty pecahan hanya untuk part bisa pecahan, maksimal 2 desimal', () => {
    expect(validateProduct(part({ minStock: '1,5' }), true)).toEqual({ ok: false, errors: { minStock: 'Stok minimum harus bilangan bulat' } })
    const bulk = validateProduct(part({ allowsFraction: true, unit: 'liter', minStock: '2,5', initialStock: '12,5', purchasePrice: '30.000' }), true)
    expect(bulk.ok && [bulk.value.minStock, bulk.value.initialStock]).toEqual([2.5, 12.5])
    expect(validateProduct(part({ allowsFraction: true, initialStock: '1,555', purchasePrice: '1' }), true).ok).toBe(false)
  })

  test('stok awal diabaikan saat mengubah produk lama', () => {
    const result = validateProduct(part({ initialStock: '99', purchasePrice: '' }), false)
    expect(result.ok && result.value.initialStock).toBe(null)
  })

  test('nama dan kategori wajib, satuan kosong menjadi pcs', () => {
    expect(validateProduct(part({ name: '  ', categoryId: '' }), true)).toEqual({
      ok: false,
      errors: { name: 'Nama wajib diisi', categoryId: 'Kategori wajib dipilih' },
    })
    const result = validateProduct(part({ unit: ' ' }), true)
    expect(result.ok && result.value.unit).toBe('pcs')
  })
})

test('peringatan kalau harga beli lebih tinggi dari harga jual, tanpa menghalangi', () => {
  expect(priceWarning(part({ sellingPrice: '45.000', purchasePrice: '50.000' }))).toBe('Harga jual di bawah harga beli')
  expect(priceWarning(part({ sellingPrice: '45.000', purchasePrice: '40.000' }))).toBeNull()
})

test('isian dari produk lama memakai format rupiah dan koma', () => {
  expect(
    fieldsFromProduct({ type: 'part', name: 'Oli Curah', brand: null, categoryId: 'k', unit: 'liter', allowsFraction: true, sellingPrice: 125000, minStock: 2.5 }),
  ).toMatchObject({ brand: '', sellingPrice: '125.000', minStock: '2,5' })
})

test('bedaDaftar mencari yang ditambah dan dihapus', () => {
  expect(diffList(['a', 'b'], ['b', 'c'], (x) => x)).toEqual({ add: ['c'], remove: ['a'] })
})

describe('unitOptions', () => {
  test('daftar satuan baku, satuan lama di luar daftar tetap ikut', () => {
    expect(unitOptions('pcs')).toEqual(COMMON_UNITS)
    expect(unitOptions(EMPTY_FIELDS.unit)).toContain(EMPTY_FIELDS.unit)
    expect(unitOptions('galon')).toEqual([...COMMON_UNITS, 'galon'])
  })
})
