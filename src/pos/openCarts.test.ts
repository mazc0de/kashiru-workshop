import { describe, expect, test } from 'vitest'

import { addProduct, EMPTY_CART, type Cart } from '@/pos/cart'
import {
  addHeldCarts,
  clearDraft,
  descriptionError,
  initialCarts,
  listedCarts,
  openCart,
  qtyInSavedCarts,
  saveDraft,
  savedCartsQty,
  suggestedDescription,
  updateDraft,
  type CartsState,
} from '@/pos/openCarts'
import type { LocalProduct } from '@/products/product'

const OIL: LocalProduct = {
  id: 'oli', type: 'part', name: 'Oli MPX 1L', brand: 'AHM', categoryId: 'k', category: 'K', unit: 'pcs', allowsFraction: false,
  sellingPrice: 52000, stock: 1, minStock: 0, avgCost: 40000, purchaseCode: null, barcodes: [], partNumbers: [], active: true,
}
const ROLLER: LocalProduct = { ...OIL, id: 'roller', name: 'Roller set', brand: null, sellingPrice: 80000 }

let n = 0
const at = (minute: number) => new Date(Date.UTC(2026, 9, 21, 7, minute))
const add = (s: CartsState, p: LocalProduct) => updateDraft(s, (k) => addProduct(k, p, `b${++n}`))
const withData = (s: CartsState, d: Partial<Cart['data']>) => updateDraft(s, (k) => ({ ...k, data: { ...k.data, ...d } }))
const same = (k: Cart) => k

describe('tambah ke keranjang', () => {
  test('motor A ganti oli: isian layar masuk keranjang dengan keterangan, layar bersih untuk motor B', () => {
    let s = add(initialCarts(at(0)), OIL)
    s = saveDraft(s, '  Vario   hitam ', 'a', at(5))
    expect(s.draft.lines).toEqual([])
    expect(s.draft.createdAt).toBe(at(5).toISOString())
    expect(listedCarts(s).map((k) => [k.id, k.data.description, k.lines.length, k.createdAt])).toEqual([['a', 'Vario hitam', 1, at(0).toISOString()]])
  })

  test('layar tanpa barang atau keterangan kosong tidak bisa ditambahkan', () => {
    const empty = initialCarts(at(0))
    expect(saveDraft(empty, 'Vario hitam', 'a', at(1))).toBe(empty)
    const s = add(empty, OIL)
    expect(descriptionError(s, '   ')).toMatch(/Isi keterangan/)
    expect(saveDraft(s, '   ', 'a', at(1))).toBe(s)
  })

  test('keterangan harus unik, tanpa membedakan huruf besar-kecil dan spasi', () => {
    let s = saveDraft(add(initialCarts(at(0)), OIL), 'Vario hitam', 'a', at(1))
    s = add(s, ROLLER)
    expect(descriptionError(s, 'vario  HITAM')).toMatch(/Sudah ada keranjang Vario hitam/)
    expect(saveDraft(s, 'vario hitam', 'b', at(2))).toBe(s)
    expect(descriptionError(s, 'Vario hitam B 1234 XYZ')).toBeNull()
  })

  test('usulan keterangan: keterangan, lalu nopol, lalu nama pelanggan', () => {
    const data = (d: Partial<Cart['data']>): Cart => ({ ...EMPTY_CART, data: { ...EMPTY_CART.data, ...d } })
    expect(suggestedDescription(data({ plate: 'B 1234 XYZ', customer: 'Pak Budi', description: 'Vario hitam' }))).toBe('Vario hitam')
    expect(suggestedDescription(data({ plate: 'B 1234 XYZ', customer: 'Pak Budi' }))).toBe('B 1234 XYZ')
    expect(suggestedDescription(data({ customer: ' Pak  Budi ' }))).toBe('Pak Budi')
    expect(suggestedDescription(EMPTY_CART)).toBe('')
  })
})

describe('buka keranjang', () => {
  test('motor A nambah kampas rem: isi keranjang pindah ke layar dan keluar dari daftar, harga diperbarui', () => {
    let s = saveDraft(add(initialCarts(at(0)), OIL), 'Vario hitam', 'a', at(1))
    s = openCart(s, 'a', (k) => ({ ...k, saleDiscount: { kind: 'nominal', input: 1000 } }))
    expect(listedCarts(s)).toEqual([])
    expect(s.draft).toMatchObject({ fromCart: true, createdAt: at(0).toISOString(), saleDiscount: { kind: 'nominal', input: 1000 } })
    expect(s.draft.data.description).toBe('Vario hitam')
    // Ditambahkan lagi dengan keterangan yang sama, karena keranjang lamanya sudah keluar dari daftar.
    s = saveDraft(add(s, ROLLER), 'Vario hitam', 'a2', at(2))
    expect(listedCarts(s).map((k) => [k.data.description, k.lines.length, k.createdAt])).toEqual([['Vario hitam', 2, at(0).toISOString()]])
  })

  test('layar yang masih berisi barang tidak pernah tertimpa', () => {
    let s = saveDraft(add(initialCarts(at(0)), OIL), 'Vario hitam', 'a', at(1))
    s = add(s, ROLLER)
    expect(openCart(s, 'a', same)).toBe(s)
    expect(openCart(s, 'tidak-ada', same)).toBe(s)
  })

  test('daftar urut waktu isian mulai dibuat', () => {
    let s = saveDraft(add(initialCarts(at(0)), OIL), 'Motor A', 'a', at(1))
    s = saveDraft(add(s, ROLLER), 'Motor B', 'b', at(2))
    s = saveDraft(add(openCart(s, 'a', same), ROLLER), 'Motor A', 'a2', at(3))
    expect(listedCarts(s).map((k) => k.data.description)).toEqual(['Motor A', 'Motor B'])
  })
})

test('setelah bayar atau Kosongkan, layar bersih dan keranjang lain tetap', () => {
  let s = saveDraft(add(initialCarts(at(0)), OIL), 'Vario hitam', 'a', at(1))
  s = clearDraft(withData(add(s, ROLLER), { plate: 'B 1' }), at(2))
  expect(s.draft).toMatchObject({ lines: [], fromCart: false, data: EMPTY_CART.data })
  expect(listedCarts(s)).toHaveLength(1)
})

test('qty part di keranjang yang ditunda untuk peringatan stok dan katalog', () => {
  let s = saveDraft(add(add(initialCarts(at(0)), OIL), OIL), 'Vario hitam', 'a', at(1))
  s = add(s, OIL)
  expect(qtyInSavedCarts(s, 'oli')).toEqual([{ label: 'Vario hitam', qty: 2 }])
  expect(qtyInSavedCarts(s, 'roller')).toEqual([])
  expect(savedCartsQty(s)).toEqual(new Map([['oli', 2]]))
})

test('keranjang ditahan dari versi lama masuk daftar dengan keterangan yang unik', () => {
  const held = (id: string, label: string, minute: number, cart: Cart) => ({ id, label, heldAt: at(minute).toISOString(), cart })
  const plate = { ...EMPTY_CART.data, plate: 'B 1234 XYZ' }
  const s = addHeldCarts(initialCarts(at(9)), [
    held('h1', 'B 1234 XYZ', 1, addProduct({ ...EMPTY_CART, data: plate }, OIL, 'x1')),
    held('h2', 'B 1234 XYZ', 2, addProduct({ ...EMPTY_CART, data: plate }, ROLLER, 'x2')),
    held('h3', 'Ditahan 14:03', 3, addProduct(EMPTY_CART, OIL, 'x3')),
    held('h4', 'Ditahan 14:04', 4, EMPTY_CART),
  ])
  expect(listedCarts(s).map((k) => k.data.description)).toEqual(['B 1234 XYZ', 'B 1234 XYZ (2)', 'Ditahan 14:03'])
  expect(addHeldCarts(s, [held('h1', 'B 1234 XYZ', 1, EMPTY_CART)])).toBe(s)
})
