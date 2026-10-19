import { describe, expect, test } from 'vitest'

import { calculatePayment, calculateDiscount, calculateSale, lineAmount } from '@/pos/calculate'

// Angka harapan sama dengan skenario database di supabase/tests/scenarios.mjs, supaya laptop kasir dan
// server selalu menghasilkan total yang sama.

describe('calculateSale', () => {
  test('contoh struk PRD 4.10: diskon baris, diskon nota, alokasi sisa ke pecahan terbesar', () => {
    const result = calculateSale(
      [
        { qty: 1, price: 45000, discount: null },
        { qty: 1, price: 52000, discount: { kind: 'nominal', input: 2000 } },
        { qty: 1, price: 35000, discount: null },
      ],
      { kind: 'nominal', input: 5000 },
    )
    expect(result).toEqual({
      lines: [
        { amount: 45000, discount: 0, net: 45000, saleDiscountShare: 1731 },
        { amount: 52000, discount: 2000, net: 50000, saleDiscountShare: 1923 },
        { amount: 35000, discount: 0, net: 35000, saleDiscountShare: 1346 },
      ],
      subtotal: 130000,
      saleDiscount: 5000,
      total: 125000,
      errorText: null,
    })
  })

  test('pembulatan rupiah terdekat untuk diskon persen dan qty pecahan (R2)', () => {
    const result = calculateSale(
      [
        { qty: 1, price: 45250, discount: { kind: 'persen', input: 12.5 } },
        { qty: 0.33, price: 12750, discount: null },
      ],
      null,
    )
    expect(result.lines.map((b) => [b.amount, b.discount])).toEqual([[45250, 5656], [4208, 0]])
    expect(result.total).toBe(43802)
  })

  test('diskon nominal baris berlaku untuk total baris (R3)', () => {
    expect(calculateSale([{ qty: 3, price: 52000, discount: { kind: 'nominal', input: 2000 } }], null).total).toBe(154000)
  })

  test('alokasi diskon nota hampir 100% tidak melebihi nilai baris', () => {
    const result = calculateSale(
      [
        { qty: 1, price: 100, discount: null },
        { qty: 1, price: 1, discount: null },
        { qty: 1, price: 1, discount: null },
      ],
      { kind: 'nominal', input: 101 },
    )
    expect(result.lines.map((b) => b.saleDiscountShare)).toEqual([99, 1, 1])
    expect(result.total).toBe(1)
  })

  test('diskon 100% membuat total 0, lebih dari harga ditolak', () => {
    expect(calculateSale([{ qty: 1, price: 10000, discount: { kind: 'persen', input: 100 } }], null).total).toBe(0)
    expect(calculateSale([{ qty: 1, price: 10000, discount: { kind: 'nominal', input: 10001 } }], null).errorText).toBe(
      'Diskon tidak boleh membuat harga di bawah Rp 0',
    )
  })

  test('nota tanpa baris bertotal 0', () => {
    expect(calculateSale([], null)).toEqual({ lines: [], subtotal: 0, saleDiscount: 0, total: 0, errorText: null })
  })
})

describe('calculateDiscount', () => {
  test('persen dengan 2 desimal, ditolak di luar 0 sampai 100', () => {
    expect(calculateDiscount({ kind: 'persen', input: 2.5 }, 30000)).toEqual({ value: 750 })
    expect(calculateDiscount({ kind: 'persen', input: 101 }, 30000)).toEqual({
      errorText: 'Diskon persen harus 0 sampai 100, paling banyak 2 angka di belakang koma',
    })
    expect('errorText' in calculateDiscount({ kind: 'persen', input: 1.255 }, 30000)).toBe(true)
  })
})

test('jumlahBaris memakai pembulatan 0,5 ke atas', () => {
  expect(lineAmount(1.5, 52000)).toBe(78000)
  expect(lineAmount(0.33, 12750)).toBe(4208)
  expect(lineAmount(0.01, 49)).toBe(0)
  expect(lineAmount(0.01, 50)).toBe(1)
})

describe('calculatePayment', () => {
  test('tunai menghitung kembalian, kurang dari total ditolak', () => {
    expect(calculatePayment('tunai', 125000, 150000)).toEqual({ cash: 150000, change: 25000 })
    expect(calculatePayment('tunai', 125000, 100000)).toBeNull()
  })

  test('metode lain: nominal sama dengan total', () => {
    expect(calculatePayment('qris', 125000, null)).toEqual({ cash: 125000, change: 0 })
  })
})
