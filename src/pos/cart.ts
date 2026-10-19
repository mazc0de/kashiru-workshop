import { lineAmount, type CalcLine, type Discount } from '@/pos/calculate'
import type { LocalProduct } from '@/products/product'

// Keranjang di layar Kasir (PRD 4.6). Fungsi murni: setiap aksi mengembalikan keranjang baru.

export type CartLine = {
  key: string
  productId: string
  type: 'part' | 'jasa'
  name: string
  brand: string | null
  unit: string | null
  allowsFraction: boolean
  qty: number
  price: number
  /** Harga jasa yang diubah kasir tidak ikut diperbarui saat keranjang ditahan dibuka lagi. */
  manualPrice: boolean
  discount: Discount
  /** Diisi saat keranjang ditahan dibuka lagi dan harga part di master berubah. */
  oldPrice: number | null
  /** Produk sudah dinonaktifkan: harus dihapus dari keranjang sebelum bayar. */
  inactive: boolean
}

export type SaleInfo = {
  plate: string
  customer: string
  mechanicId: string | null
  serviceNote: string
}

export type Cart = {
  lines: CartLine[]
  selected: number
  data: SaleInfo
  saleDiscount: Discount
}

export type HeldCart = { id: string; label: string; heldAt: string; cart: Cart }

export const EMPTY_CART: Cart = {
  lines: [],
  selected: 0,
  data: { plate: '', customer: '', mechanicId: null, serviceNote: '' },
  saleDiscount: null,
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

/** Qty baru untuk baris; pecahan hanya untuk part bisa pecahan, maksimal 2 desimal. null kalau tidak valid. */
export function changeQty(k: Cart, i: number, qty: number): Cart | null {
  const b = k.lines[i]
  if (!b || !(qty > 0) || Math.round(qty * 100) !== qty * 100) return null
  if (!(b.type === 'part' && b.allowsFraction) && !Number.isInteger(qty)) return null
  return { ...k, lines: k.lines.map((x, j) => (j === i ? { ...x, qty } : x)) }
}

/** Tombol + / −. Qty tidak turun di bawah 1 (hapus baris memakai Delete). */
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

export function selectLine(k: Cart, direction: 1 | -1): Cart {
  if (k.lines.length === 0) return k
  return { ...k, selected: Math.max(0, Math.min(k.lines.length - 1, k.selected + direction)) }
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
export function qtyInCart(k: Cart, productId: string): number {
  return k.lines.filter((b) => b.productId === productId).reduce((s, b) => s + b.qty, 0)
}

/**
 * Saat keranjang ditahan dibuka lagi (PRD 4.6): harga part diperbarui ke harga terbaru di master dan
 * barisnya ditandai; harga jasa yang sudah diubah manual tidak ikut; produk nonaktif ditandai.
 */
export function refreshPrices(k: Cart, copies: Map<string, LocalProduct>): Cart {
  const lines = k.lines.map((b) => {
    const p = copies.get(b.productId)
    if (!p || !p.active) return { ...b, inactive: true, oldPrice: null }
    if (b.manualPrice || p.sellingPrice === b.price) return { ...b, inactive: false, oldPrice: null }
    return { ...b, inactive: false, oldPrice: b.price, price: p.sellingPrice }
  })
  return { ...k, lines }
}

/** Label keranjang ditahan: nopol, lalu nama pelanggan, lalu jam ditahan (PRD 4.6). */
export function cartLabel(k: Cart, heldAt: Date): string {
  if (k.data.plate.trim()) return k.data.plate.trim()
  if (k.data.customer.trim()) return k.data.customer.trim()
  const hours = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(heldAt)
  return `Ditahan ${hours}`
}

/** HPP x qty baris part, untuk peringatan diskon di bawah harga beli. */
export function lineCogs(b: CartLine, avgCost: number | undefined): number | null {
  if (b.type !== 'part' || avgCost === undefined) return null
  return lineAmount(b.qty, Math.round(avgCost))
}
