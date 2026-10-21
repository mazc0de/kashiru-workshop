import { lineAmount, type CalcLine, type Discount } from '@/pos/calculate'
import type { LocalProduct } from '@/products/product'

// Keranjang di layar Kasir (PRD 4.6). Fungsi murni: setiap aksi mengembalikan keranjang baru.

export type CartLine = {
  key: string
  /** null untuk jasa manual: nama dan tarif diketik kasir, tidak ada di daftar jasa. */
  productId: string | null
  type: 'part' | 'jasa'
  name: string
  brand: string | null
  unit: string | null
  allowsFraction: boolean
  qty: number
  price: number
  /** Harga jasa yang diubah kasir tidak ikut diperbarui saat keranjang dibuka lagi. */
  manualPrice: boolean
  discount: Discount
  /** Diisi saat keranjang dibuka lagi atau Bayar ditekan dan harga part di master berubah. */
  oldPrice: number | null
  /** Produk sudah dinonaktifkan: harus dihapus dari keranjang sebelum bayar. */
  inactive: boolean
}

export type SaleInfo = {
  plate: string
  customer: string
  /** Keterangan nota: pengenal bebas kendaraan atau pemiliknya, mis. "Vario hitam". */
  description: string
  mechanicId: string | null
  serviceNote: string
}

export type Cart = {
  lines: CartLine[]
  selected: number
  data: SaleInfo
  saleDiscount: Discount
}

/** Keranjang ditahan dari versi sebelum banyak keranjang. Hanya dibaca untuk memindahkan data lama di laptop. */
export type HeldCart = { id: string; label: string; heldAt: string; cart: Cart }

export const EMPTY_CART: Cart = {
  lines: [],
  selected: 0,
  data: { plate: '', customer: '', description: '', mechanicId: null, serviceNote: '' },
  saleDiscount: null,
}

/** Keranjang yang tersimpan sebelum ada Keterangan nota belum punya isian itu. */
export function normalizeCart(k: Cart): Cart {
  return { ...k, data: { ...EMPTY_CART.data, ...k.data } }
}

export function lineFromProduct(p: LocalProduct, key: string): CartLine {
  return {
    key,
    productId: p.id,
    type: p.type,
    name: p.name,
    brand: p.brand,
    unit: p.unit,
    allowsFraction: p.allowsFraction,
    qty: 1,
    price: p.sellingPrice,
    manualPrice: false,
    discount: null,
    oldPrice: null,
    inactive: false,
  }
}

/** Scan atau pilih produk: kalau baris yang sama sudah ada, qty +1 (PRD 4.6, R4). Baris itu jadi terpilih. */
export function addProduct(k: Cart, p: LocalProduct, newKey: string): Cart {
  const i = k.lines.findIndex((b) => b.productId === p.id && !b.manualPrice && !b.inactive)
  if (i >= 0) {
    const lines = k.lines.map((b, j) => (j === i ? { ...b, qty: b.qty + 1 } : b))
    return { ...k, lines, selected: i }
  }
  return { ...k, lines: [...k.lines, lineFromProduct(p, newKey)], selected: k.lines.length }
}

/**
 * Jasa manual dari jendela Jasa: nama dan tarif diketik kasir, hanya tercatat di nota. Jasa manual dengan
 * nama dan tarif yang sama menambah qty barisnya, seperti produk. Nama kosong atau tarif negatif ditolak.
 */
export function addManualService(k: Cart, name: string, price: number, newKey: string): Cart | null {
  const tidy = name.trim().replace(/\s+/g, ' ')
  if (!tidy || tidy.length > MANUAL_SERVICE_NAME_MAX || !Number.isInteger(price) || price < 0) return null
  const i = k.lines.findIndex((b) => b.productId === null && b.name.toLowerCase() === tidy.toLowerCase() && b.price === price)
  if (i >= 0) {
    const lines = k.lines.map((b, j) => (j === i ? { ...b, qty: b.qty + 1 } : b))
    return { ...k, lines, selected: i }
  }
  const line: CartLine = {
    key: newKey,
    productId: null,
    type: 'jasa',
    name: tidy,
    brand: null,
    unit: null,
    allowsFraction: false,
    qty: 1,
    price,
    manualPrice: true,
    discount: null,
    oldPrice: null,
    inactive: false,
  }
  return { ...k, lines: [...k.lines, line], selected: k.lines.length }
}

/** Batas nama jasa manual, sama dengan pemeriksaan di checkout_sale. */
export const MANUAL_SERVICE_NAME_MAX = 100

/** Qty baru untuk baris; pecahan hanya untuk part bisa pecahan, maksimal 2 desimal. null kalau tidak valid. */
export function changeQty(k: Cart, i: number, qty: number): Cart | null {
  const b = k.lines[i]
  if (!b || !(qty > 0) || Math.round(qty * 100) !== qty * 100) return null
  if (!(b.type === 'part' && b.allowsFraction) && !Number.isInteger(qty)) return null
  return { ...k, lines: k.lines.map((x, j) => (j === i ? { ...x, qty } : x)) }
}

/** Tombol + / −. Qty tidak turun di bawah 1 (hapus baris memakai tombol ×). */
export function stepQty(k: Cart, i: number, direction: 1 | -1): Cart {
  const b = k.lines[i]
  if (!b) return k
  const qty = Math.round((b.qty + direction) * 100) / 100
  return qty < 1 ? k : (changeQty(k, i, qty) ?? k)
}

/**
 * Tombol − di kotak katalog (R54): kurangi 1 dari baris produk itu (baris yang sama dengan yang ditambah
 * katalog dan scan). Katalog tidak punya tombol hapus, jadi qty di bawah 1 berarti barang keluar dari keranjang.
 */
export function decreaseProduct(k: Cart, productId: string): Cart {
  let i = k.lines.findIndex((b) => b.productId === productId && !b.manualPrice && !b.inactive)
  if (i < 0) i = k.lines.findLastIndex((b) => b.productId === productId)
  if (i < 0) return k
  return k.lines[i].qty - 1 >= 1 ? stepQty(k, i, -1) : removeLine(k, i)
}

export function removeLine(k: Cart, i: number): Cart {
  if (!k.lines[i]) return k
  const lines = k.lines.filter((_, j) => j !== i)
  return { ...k, lines, selected: Math.max(0, Math.min(k.selected, lines.length - 1)) }
}

/** Harga jasa boleh diubah langsung tanpa konfirmasi, termasuk Rp 0. Harga part tidak bisa diubah (PRD 4.6). */
export function setServicePrice(k: Cart, i: number, price: number): Cart {
  const b = k.lines[i]
  if (!b || b.type !== 'jasa' || !Number.isInteger(price) || price < 0) return k
  return { ...k, lines: k.lines.map((x, j) => (j === i ? { ...x, price, manualPrice: true } : x)) }
}

export function setLineDiscount(k: Cart, i: number, discount: Discount): Cart {
  if (!k.lines[i]) return k
  return { ...k, lines: k.lines.map((x, j) => (j === i ? { ...x, discount } : x)) }
}

export function toCalcLines(k: Cart): CalcLine[] {
  return k.lines.map((b) => ({ qty: b.qty, price: b.price, discount: b.discount }))
}

/** Qty part yang sudah ada di keranjang, untuk peringatan stok. */
export function qtyInCart(k: Cart, productId: string | null): number {
  return k.lines.filter((b) => b.productId === productId).reduce((s, b) => s + b.qty, 0)
}

/**
 * Saat keranjang dibuka dan saat Bayar ditekan (PRD 4.6): harga part diperbarui ke harga terbaru di
 * master dan barisnya ditandai; harga jasa yang sudah diubah manual tidak ikut; produk nonaktif ditandai.
 * Jasa manual tidak punya produk, jadi dibiarkan apa adanya.
 */
export function refreshPrices(k: Cart, copies: Map<string, LocalProduct>): Cart {
  const lines = k.lines.map((b) => {
    if (b.productId === null) return b
    const p = copies.get(b.productId)
    if (!p || !p.active) return { ...b, inactive: true, oldPrice: null }
    if (b.manualPrice || p.sellingPrice === b.price) return { ...b, inactive: false, oldPrice: null }
    return { ...b, inactive: false, oldPrice: b.price, price: p.sellingPrice }
  })
  return { ...k, lines }
}

/** Ada harga atau status nonaktif yang berbeda dari master, jadi keranjang perlu diperiksa lagi sebelum bayar. */
export function pricesChanged(k: Cart, copies: Map<string, LocalProduct>): boolean {
  const refreshed = refreshPrices(k, copies)
  return refreshed.lines.some((b, i) => b.price !== k.lines[i].price || b.inactive !== k.lines[i].inactive)
}

/** HPP x qty baris part, untuk peringatan diskon di bawah harga beli. */
export function lineCogs(b: CartLine, avgCost: number | undefined): number | null {
  if (b.type !== 'part' || avgCost === undefined) return null
  return lineAmount(b.qty, Math.round(avgCost))
}
