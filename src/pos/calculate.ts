// Hitungan nota di laptop kasir. Aturannya harus sama persis dengan fungsi checkout_sale di
// database (supabase/migrations/20261019000004_rpc.sql), karena server menghitung ulang dan menolak
// nota yang totalnya berbeda (PRD 4.6, R2, R3).
// Semua hitungan memakai bilangan bulat (qty dalam perseratus, persen dalam perseratus) supaya tidak
// ada galat pembulatan pecahan biner.

export type DiscountKind = 'nominal' | 'persen'
export type Discount = { kind: DiscountKind; input: number } | null

export type CalcLine = { qty: number; price: number; discount: Discount }

export type LineResult = {
  /** qty x harga, dibulatkan ke rupiah terdekat. */
  amount: number
  discount: number
  /** jumlah - diskon baris. */
  net: number
  saleDiscountShare: number
}

export type SaleCalculation = {
  lines: LineResult[]
  subtotal: number
  saleDiscount: number
  total: number
  /** Pesan pertama yang membuat nota belum bisa dibayar, atau null. */
  errorText: string | null
}

const toHundredths = (n: number) => Math.round(n * 100)

/** Pembagian bulat dibulatkan ke terdekat, 0,5 ke atas (sama dengan round() Postgres untuk bilangan positif). */
function divideRounded(numerator: bigint, denominator: bigint): number {
  return Number((numerator * 2n + denominator) / (denominator * 2n))
}

/** Nilai diskon dalam rupiah, atau pesan salah (sama dengan private.compute_discount). */
export function calculateDiscount(discount: Discount, base: number): { value: number } | { errorText: string } {
  if (!discount) return { value: 0 }
  let value: number
  if (discount.kind === 'nominal') {
    if (discount.input < 0 || !Number.isInteger(discount.input)) return { errorText: 'Diskon nominal harus rupiah penuh dan tidak negatif' }
    value = discount.input
  } else {
    const p = toHundredths(discount.input)
    if (discount.input < 0 || discount.input > 100 || Math.abs(p - discount.input * 100) > 1e-6) {
      return { errorText: 'Diskon persen harus 0 sampai 100, paling banyak 2 angka di belakang koma' }
    }
    value = divideRounded(BigInt(base) * BigInt(p), 10000n)
  }
  if (value > base) return { errorText: 'Diskon tidak boleh membuat harga di bawah Rp 0' }
  return { value }
}

export function lineAmount(qty: number, price: number): number {
  return divideRounded(BigInt(toHundredths(qty)) * BigInt(price), 100n)
}

export function calculateSale(lines: CalcLine[], saleDiscount: Discount): SaleCalculation {
  let errorText: string | null = null
  const result = lines.map((b) => {
    const amount = lineAmount(b.qty, b.price)
    const d = calculateDiscount(b.discount, amount)
    if ('errorText' in d) errorText ??= d.errorText
    const discount = 'value' in d ? d.value : 0
    return { amount, discount, net: amount - discount, saleDiscountShare: 0 }
  })
  const subtotal = result.reduce((s, b) => s + b.net, 0)

  const saleDisc = calculateDiscount(saleDiscount, subtotal)
  if ('errorText' in saleDisc) errorText ??= saleDisc.errorText
  const saleDiscountAmount = 'value' in saleDisc ? saleDisc.value : 0

  // Alokasi diskon nota sebanding nilai baris: dibulatkan ke bawah, lalu sisa rupiah dibagikan satu per
  // satu ke baris dengan sisa pembagian terbesar (lalu nilai terbesar, lalu urutan).
  if (saleDiscountAmount > 0 && subtotal > 0) {
    const D = BigInt(saleDiscountAmount)
    const S = BigInt(subtotal)
    const shares = result.map((b, i) => {
      const numerator = D * BigInt(b.net)
      return { i, base: Number(numerator / S), remainder: numerator % S, net: b.net }
    })
    let leftover = saleDiscountAmount - shares.reduce((s, p) => s + p.base, 0)
    const sequence = [...shares].sort((a, b) => (a.remainder === b.remainder ? b.net - a.net || a.i - b.i : a.remainder > b.remainder ? -1 : 1))
    for (const p of shares) result[p.i].saleDiscountShare = p.base
    for (const p of sequence) {
      if (leftover <= 0) break
      result[p.i].saleDiscountShare += 1
      leftover -= 1
    }
  }

  return { lines: result, subtotal, saleDiscount: saleDiscountAmount, total: subtotal - saleDiscountAmount, errorText }
}

export type PaymentMethod = 'tunai' | 'qris' | 'transfer' | 'edc'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', edc: 'EDC' }

/** Uang diterima dan kembalian. Metode selain tunai: nominal otomatis sama dengan total (PRD 4.6). */
export function calculatePayment(method: PaymentMethod, total: number, cashReceived: number | null): { cash: number; change: number } | null {
  if (method !== 'tunai') return { cash: total, change: 0 }
  if (cashReceived === null || cashReceived < total) return null
  return { cash: cashReceived, change: cashReceived - total }
}

/** Tombol pecahan cepat untuk tunai (PRD 4.6). */
export const QUICK_CASH = [20000, 50000, 100000]
