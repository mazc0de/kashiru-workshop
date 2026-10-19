import { formatNumber, formatQty, parseQty, parseRupiah } from '@/lib/format'
import type { LocalProduct } from '@/products/product'

// Baris penerimaan barang (PRD 4.4). Qty dan harga disimpan sebagai teks seperti diketik, lalu diperiksa
// saat disimpan. Barang bonus dari supplier dicatat sebagai baris terpisah dengan harga Rp 0 (R6).

export type ReceivingLine = {
  key: string
  productId: string
  name: string
  brand: string | null
  unit: string | null
  allowsFraction: boolean
  qty: string
  price: string
  bonus: boolean
}

/** Scan atau pilih part: menambah qty di baris yang sama (bukan baris bonus), atau baris baru. */
export function addPartLine(lines: ReceivingLine[], p: LocalProduct, defaultPrice: number | null, key: string): { lines: ReceivingLine[]; index: number } {
  const i = lines.findIndex((b) => b.productId === p.id && !b.bonus)
  if (i >= 0) {
    const qty = parseQty(lines[i].qty)
    const incremented = qty === null ? '1' : formatQty(qty + 1)
    return { lines: lines.map((b, j) => (j === i ? { ...b, qty: incremented } : b)), index: i }
  }
  const line: ReceivingLine = {
    key,
    productId: p.id,
    name: p.name,
    brand: p.brand,
    unit: p.unit,
    allowsFraction: p.allowsFraction,
    qty: '1',
    price: defaultPrice ? formatNumber(defaultPrice) : '',
    bonus: false,
  }
  return { lines: [...lines, line], index: lines.length }
}

/** "+ Bonus": baris baru untuk part yang sama dengan harga beli Rp 0, tepat di bawah barisnya. */
export function addBonusLine(lines: ReceivingLine[], i: number, key: string): ReceivingLine[] {
  const source = lines[i]
  if (!source) return lines
  const bonus: ReceivingLine = { ...source, key, qty: '1', price: '0', bonus: true }
  return [...lines.slice(0, i + 1), bonus, ...lines.slice(i + 1)]
}

export type ReceivingItem = { product_id: string; qty: number; harga_beli: number }

export type CheckResult =
  | { ok: true; items: ReceivingItem[]; total: number }
  | { ok: false; errors: Record<string, string>; message: string }

export function validateReceiving(lines: ReceivingLine[]): CheckResult {
  const errors: Record<string, string> = {}
  const items: ReceivingItem[] = []
  let total = 0
  for (const b of lines) {
    const qty = parseQty(b.qty)
    const price = parseRupiah(b.price)
    if (qty === null || qty <= 0) errors[b.key] = 'Qty harus lebih dari 0, paling banyak 2 angka di belakang koma'
    else if (!b.allowsFraction && !Number.isInteger(qty)) errors[b.key] = 'Qty harus bilangan bulat'
    else if (price === null) errors[b.key] = 'Isi harga beli dalam rupiah (boleh 0 untuk bonus)'
    else {
      items.push({ product_id: b.productId, qty, harga_beli: price })
      total += Math.round(qty * price)
    }
  }
  if (lines.length === 0) return { ok: false, errors, message: 'Penerimaan belum punya baris. Scan atau cari part.' }
  if (Object.keys(errors).length) return { ok: false, errors, message: 'Periksa lagi baris yang ditandai.' }
  return { ok: true, items, total }
}

/** Nilai baris untuk ditampilkan selagi diketik; null kalau isian belum valid. */
export function lineValue(b: ReceivingLine): number | null {
  const qty = parseQty(b.qty)
  const price = parseRupiah(b.price)
  return qty === null || price === null ? null : Math.round(qty * price)
}
