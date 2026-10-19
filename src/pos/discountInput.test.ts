import { expect, test } from 'vitest'

import { discountText, parseLineDiscount } from '@/pos/discountInput'

test('angka berarti rupiah untuk total baris, dengan atau tanpa titik ribuan dan Rp', () => {
  expect(parseLineDiscount('2000', 52000)).toEqual({ ok: true, discount: { kind: 'nominal', input: 2000 } })
  expect(parseLineDiscount(' 2.000 ', 52000)).toEqual({ ok: true, discount: { kind: 'nominal', input: 2000 } })
  expect(parseLineDiscount('Rp 52.000', 52000)).toEqual({ ok: true, discount: { kind: 'nominal', input: 52000 } })
})

test('tanda % berarti persen, koma atau titik sebagai desimal', () => {
  expect(parseLineDiscount('10%', 52000)).toEqual({ ok: true, discount: { kind: 'persen', input: 10 } })
  expect(parseLineDiscount('2,5 %', 52000)).toEqual({ ok: true, discount: { kind: 'persen', input: 2.5 } })
  expect(parseLineDiscount('100%', 52000)).toEqual({ ok: true, discount: { kind: 'persen', input: 100 } })
})

test('kosong atau nol menghapus diskon', () => {
  expect(parseLineDiscount('', 52000)).toEqual({ ok: true, discount: null })
  expect(parseLineDiscount('0', 52000)).toEqual({ ok: true, discount: null })
  expect(parseLineDiscount('0%', 52000)).toEqual({ ok: true, discount: null })
})

test('validasi: bukan angka, persen di luar batas, dan diskon melebihi jumlah baris', () => {
  expect(parseLineDiscount('abc', 52000)).toEqual({ ok: false, error: 'Isi angka, mis. 2000 atau 10%' })
  expect(parseLineDiscount('-500', 52000)).toEqual({ ok: false, error: 'Isi angka, mis. 2000 atau 10%' })
  expect(parseLineDiscount('1,5', 52000)).toEqual({ ok: false, error: 'Diskon rupiah tanpa koma; untuk persen tambahkan %' })
  expect(parseLineDiscount('120%', 52000)).toEqual({ ok: false, error: 'Persen 0 sampai 100' })
  expect(parseLineDiscount('2,555%', 52000)).toEqual({ ok: false, error: 'Persen paling banyak 2 angka di belakang koma' })
  expect(parseLineDiscount('60000', 52000)).toEqual({ ok: false, error: 'Maksimal Rp 52.000' })
})

test('diskon yang tersimpan ditulis ulang di isian', () => {
  expect(discountText(null)).toBe('')
  expect(discountText({ kind: 'nominal', input: 2000 })).toBe('2.000')
  expect(discountText({ kind: 'persen', input: 2.5 })).toBe('2,5%')
})
