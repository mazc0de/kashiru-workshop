import { describe, expect, test } from 'vitest'

import { unwrap, describeError } from '@/lib/errors'

describe('describeError', () => {
  test('nama unik dan barcode ganda diterjemahkan', () => {
    expect(
      describeError({ code: '23505', message: 'duplicate key value violates unique constraint "categories_nama_unik"' }),
    ).toBe('Kategori dengan nama ini sudah ada.')
    expect(
      describeError({ code: '23505', message: 'duplicate key value violates unique constraint "product_barcodes_barcode_key"' }),
    ).toBe('Barcode ini sudah dipakai produk lain.')
  })

  test('pesan RPC Kashiru diteruskan apa adanya', () => {
    expect(describeError({ code: 'P0001', message: 'Barcode 200001 sudah dipakai produk lain' })).toBe(
      'Barcode 200001 sudah dipakai produk lain',
    )
  })

  test('gagal jaringan', () => {
    expect(describeError({ message: 'TypeError: Failed to fetch' })).toBe('Tidak bisa terhubung ke server. Periksa internet.')
  })
})

test('pastikan mengembalikan data atau melempar pesan Indonesia', () => {
  expect(unwrap({ data: [1, 2], error: null })).toEqual([1, 2])
  expect(() =>
    unwrap({ data: null, error: { code: '23505', message: 'violates unique constraint "mechanics_nama_unik"' } }),
  ).toThrow('Mekanik dengan nama ini sudah ada.')
})
