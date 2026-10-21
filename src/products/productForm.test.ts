import { describe, expect, test } from 'vitest'

import { diffList, EMPTY_FIELDS, fieldsFromProduct, validateProduct, unitOptions, COMMON_UNITS, type FormFields } from '@/products/productForm'

const part = (partial: Partial<FormFields>): FormFields => ({ ...EMPTY_FIELDS, name: 'Oli MPX 1L', categoryId: 'k-oli', sellingPrice: '52.000', ...partial })
const services = (partial: Partial<FormFields>): FormFields => ({ ...EMPTY_FIELDS, type: 'jasa', name: 'Servis rem', categoryId: 'k-jasa', sellingPrice: '35.000', ...partial })

describe('validateProduct', () => {
  test('part baru dengan stok awal dan kode harga, dirapikan jadi kapital (R64)', () => {
    expect(validateProduct(part({ brand: ' AHM ', initialStock: '10', purchaseCode: ' abgsk ', minStock: '3' }), true)).toEqual({
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
        purchaseCode: 'ABGSK',
      },
    })
  })

  test('kode harga opsional, stok awal tidak lagi wajib harga beli (R64)', () => {
    const result = validateProduct(part({ initialStock: '10' }), true)
    expect(result.ok && [result.value.initialStock, result.value.purchaseCode]).toEqual([10, null])
  })

  test('kode harga hanya huruf A-Z, tanpa batas panjang (R64)', () => {
    expect(validateProduct(part({ purchaseCode: '45000' }), true)).toEqual({ ok: false, errors: { purchaseCode: 'Isi dengan kode harga (huruf), bukan angka.' } })
    expect(validateProduct(part({ purchaseCode: 'AB GS' }), false)).toEqual({
      ok: false,
      errors: { purchaseCode: 'Kode harga hanya boleh huruf A–Z, tanpa spasi atau tanda baca.' },
    })
    const long = validateProduct(part({ purchaseCode: 'A'.repeat(40) }), false)
    expect(long.ok && long.value.purchaseCode).toBe('A'.repeat(40))
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
    const result = validateProduct(services({ brand: 'X', unit: 'pcs', minStock: '5', initialStock: '3', purchaseCode: 'AB', allowsFraction: true }), true)
    expect(result).toEqual({
      ok: true,
      value: { type: 'jasa', name: 'Servis rem', brand: null, categoryId: 'k-jasa', unit: null, allowsFraction: false, sellingPrice: 35000, minStock: 0, initialStock: null, purchaseCode: null },
    })
  })

  test('qty pecahan hanya untuk part bisa pecahan, maksimal 2 desimal', () => {
    expect(validateProduct(part({ minStock: '1,5' }), true)).toEqual({ ok: false, errors: { minStock: 'Stok minimum harus bilangan bulat' } })
    const bulk = validateProduct(part({ allowsFraction: true, unit: 'liter', minStock: '2,5', initialStock: '12,5' }), true)
    expect(bulk.ok && [bulk.value.minStock, bulk.value.initialStock]).toEqual([2.5, 12.5])
    expect(validateProduct(part({ allowsFraction: true, initialStock: '1,555' }), true).ok).toBe(false)
  })

  test('stok awal diabaikan saat mengubah produk lama', () => {
    const result = validateProduct(part({ initialStock: '99' }), false)
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


test('isian dari produk lama memakai format rupiah dan koma', () => {
  expect(
    fieldsFromProduct({ type: 'part', name: 'Oli Curah', brand: null, categoryId: 'k', unit: 'liter', allowsFraction: true, sellingPrice: 125000, minStock: 2.5, purchaseCode: 'ABGSK' }),
  ).toMatchObject({ brand: '', sellingPrice: '125.000', minStock: '2,5', purchaseCode: 'ABGSK' })
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
