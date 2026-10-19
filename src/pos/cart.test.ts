import { describe, expect, test } from 'vitest'

import {
  stepQty,
  removeLine,
  EMPTY_CART,
  decreaseProduct,
  cartLabel,
  selectLine,
  qtyInCart,
  refreshPrices,
  addProduct,
  setServicePrice,
  changeQty,
  type Cart,
} from '@/pos/cart'
import type { LocalProduct } from '@/products/product'

function product(partial: Partial<LocalProduct> & Pick<LocalProduct, 'id' | 'name'>): LocalProduct {
  return {
    type: 'part', brand: null, categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false, sellingPrice: 10000,
    stock: 5, minStock: 0, avgCost: 8000, barcodes: [], partNumbers: [], active: true, ...partial,
  }
}

const OIL = product({ id: 'oli', name: 'Oli MPX 1L', brand: 'AHM', sellingPrice: 52000 })
const BULK = product({ id: 'curah', name: 'Oli Curah', unit: 'liter', allowsFraction: true, sellingPrice: 40000 })
const TIRE_PATCH = product({ id: 'tambal', name: 'Tambal ban', type: 'jasa', unit: null, stock: null, sellingPrice: 15000 })

let n = 0
const add = (k: Cart, p: LocalProduct) => addProduct(k, p, `b${++n}`)

describe('addProduct', () => {
  test('scan barcode yang sama menambah qty dan memilih barisnya', () => {
    let k = add(EMPTY_CART, OIL)
    k = add(k, TIRE_PATCH)
    k = add(k, OIL)
    expect(k.lines.map((b) => [b.productId, b.qty])).toEqual([['oli', 2], ['tambal', 1]])
    expect(k.selected).toBe(0)
  })

  test('jasa yang sama juga menambah qty (R4), kecuali harganya sudah diubah manual', () => {
    let k = add(EMPTY_CART, TIRE_PATCH)
    k = add(k, TIRE_PATCH)
    expect(k.lines[0].qty).toBe(2)
    k = setServicePrice(k, 0, 0)
    k = add(k, TIRE_PATCH)
    expect(k.lines.map((b) => [b.price, b.qty])).toEqual([[0, 2], [15000, 1]])
  })
})

describe('qty', () => {
  test('F7: pecahan hanya untuk part bisa pecahan, maksimal 2 desimal', () => {
    const k = add(add(EMPTY_CART, OIL), BULK)
    expect(changeQty(k, 1, 1.5)?.lines[1].qty).toBe(1.5)
    expect(changeQty(k, 0, 1.5)).toBeNull()
    expect(changeQty(k, 1, 1.555)).toBeNull()
    expect(changeQty(k, 0, 0)).toBeNull()
    expect(changeQty(k, 0, 10)?.lines[0].qty).toBe(10)
  })

  test('+ / − tidak turun di bawah 1', () => {
    const k = add(EMPTY_CART, OIL)
    expect(stepQty(k, 0, 1).lines[0].qty).toBe(2)
    expect(stepQty(k, 0, -1).lines[0].qty).toBe(1)
    expect(stepQty(changeQty(add(EMPTY_CART, BULK), 0, 1.5)!, 0, -1).lines[0].qty).toBe(1.5)
  })

  test('qty di keranjang dijumlah per produk untuk peringatan stok', () => {
    const k = changeQty(add(EMPTY_CART, OIL), 0, 3)!
    expect(qtyInCart(k, 'oli')).toBe(3)
    expect(qtyInCart(k, 'curah')).toBe(0)
  })
})

describe('pilih dan hapus baris', () => {
  test('↑/↓ berhenti di ujung, hapus menjaga baris terpilih', () => {
    let k = add(add(add(EMPTY_CART, OIL), BULK), TIRE_PATCH)
    expect(selectLine(k, 1).selected).toBe(2)
    expect(selectLine({ ...k, selected: 0 }, -1).selected).toBe(0)
    k = removeLine(k, 2)
    expect(k.selected).toBe(1)
    expect(k.lines.map((b) => b.productId)).toEqual(['oli', 'curah'])
  })
})

test('harga part tidak bisa diubah di keranjang, harga jasa bisa', () => {
  const k = add(add(EMPTY_CART, OIL), TIRE_PATCH)
  expect(setServicePrice(k, 0, 1000).lines[0].price).toBe(52000)
  expect(setServicePrice(k, 1, 20000).lines[1]).toMatchObject({ price: 20000, manualPrice: true })
})

describe('segarkanHarga saat keranjang ditahan dibuka lagi', () => {
  test('harga part ikut master dan ditandai, jasa manual tetap, produk nonaktif ditandai', () => {
    let k = add(add(add(EMPTY_CART, OIL), TIRE_PATCH), BULK)
    k = setServicePrice(k, 1, 25000)
    const copies = new Map([
      ['oli', { ...OIL, sellingPrice: 54000 }],
      ['tambal', { ...TIRE_PATCH, sellingPrice: 17000 }],
    ])
    const result = refreshPrices(k, copies)
    expect(result.lines.map((b) => [b.productId, b.price, b.oldPrice, b.inactive])).toEqual([
      ['oli', 54000, 52000, false],
      ['tambal', 25000, null, false],
      ['curah', 40000, null, true],
    ])
  })
})

test('label keranjang ditahan: nopol, lalu pelanggan, lalu jam', () => {
  const time = new Date('2026-10-18T07:32:00Z')
  expect(cartLabel({ ...EMPTY_CART, data: { ...EMPTY_CART.data, plate: 'B 1234 XYZ', customer: 'Pak Budi' } }, time)).toBe('B 1234 XYZ')
  expect(cartLabel({ ...EMPTY_CART, data: { ...EMPTY_CART.data, customer: 'Pak Budi' } }, time)).toBe('Pak Budi')
  expect(cartLabel(EMPTY_CART, time)).toBe('Ditahan 14:32')
})

describe('kurangi dari katalog (R54)', () => {
  test('qty berkurang 1; di qty 1 barang keluar dari keranjang', () => {
    let k = add(add(add(EMPTY_CART, OIL), OIL), TIRE_PATCH)
    k = decreaseProduct(k, 'oli')
    expect(k.lines.map((b) => [b.productId, b.qty])).toEqual([['oli', 1], ['tambal', 1]])
    k = decreaseProduct(k, 'oli')
    expect(k.lines.map((b) => b.productId)).toEqual(['tambal'])
    expect(k.selected).toBe(0)
  })

  test('qty pecahan di bawah 2 langsung keluar, produk yang tidak ada di keranjang tidak mengubah apa pun', () => {
    const k = changeQty(add(EMPTY_CART, BULK), 0, 1.5)!
    expect(decreaseProduct(k, 'curah').lines).toEqual([])
    expect(decreaseProduct(k, 'tidak-ada')).toBe(k)
  })
})
