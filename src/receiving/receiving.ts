import { formatQty, parseQty } from '@/lib/format'
import { purchaseCodeError, tidyPurchaseCode } from '@/products/productForm'
import type { LocalProduct } from '@/products/product'

// Baris penerimaan barang (PRD 4.4). Qty disimpan sebagai teks seperti diketik, lalu diperiksa saat disimpan.
// Sejak R64 tidak ada harga beli angka: setiap baris punya Kode Harga Beli part itu, yang kalau diubah
// memperbarui kode part saat penerimaan disimpan. Harga beli dikirim 0 sebagai pengisi kolom lama.

export type ReceivingLine = {
  key: string
  productId: string
  name: string
  brand: string | null
  unit: string | null
  allowsFraction: boolean
  qty: string
  /** Isian Kode harga, terisi kode part saat baris dibuat. */
  code: string
  /** Kode part saat baris dibuat; kode hanya dikirim kalau diubah, supaya salinan lama tidak menimpa kode baru. */
  originalCode: string
}

/** Scan atau pilih part: menambah qty di baris part itu, atau baris baru dengan kode part saat ini. */
export function addPartLine(lines: ReceivingLine[], p: LocalProduct, key: string): { lines: ReceivingLine[]; index: number } {
  const i = lines.findIndex((b) => b.productId === p.id)
  if (i >= 0) {
    const qty = parseQty(lines[i].qty)
    const incremented = qty === null ? '1' : formatQty(qty + 1)
    return { lines: lines.map((b, j) => (j === i ? { ...b, qty: incremented } : b)), index: i }
  }
  const code = p.purchaseCode ?? ''
  const line: ReceivingLine = {
    key,
    productId: p.id,
    name: p.name,
    brand: p.brand,
    unit: p.unit,
    allowsFraction: p.allowsFraction,
    qty: '1',
    code,
    originalCode: code,
  }
  return { lines: [...lines, line], index: lines.length }
}

export type ReceivingItem = { product_id: string; qty: number; harga_beli: number; kode_harga_beli?: string }

export type CheckResult =
  | { ok: true; items: ReceivingItem[] }
  | { ok: false; errors: Record<string, string>; message: string }

export function validateReceiving(lines: ReceivingLine[]): CheckResult {
  const errors: Record<string, string> = {}
  const items: ReceivingItem[] = []
  for (const b of lines) {
    const qty = parseQty(b.qty)
    const codeError = purchaseCodeError(b.code)
    const code = tidyPurchaseCode(b.code)
    if (qty === null || qty <= 0) errors[b.key] = 'Qty harus lebih dari 0, paling banyak 2 angka di belakang koma'
    else if (!b.allowsFraction && !Number.isInteger(qty)) errors[b.key] = 'Qty harus bilangan bulat'
    else if (codeError) errors[b.key] = codeError
    else {
      // Kode kosong atau tidak berubah tidak dikirim, jadi kode part tetap.
      const changed = code !== '' && code !== tidyPurchaseCode(b.originalCode)
      items.push({ product_id: b.productId, qty, harga_beli: 0, ...(changed && { kode_harga_beli: code }) })
    }
  }
  if (lines.length === 0) return { ok: false, errors, message: 'Penerimaan belum punya baris. Scan atau cari part.' }
  if (Object.keys(errors).length) return { ok: false, errors, message: 'Periksa lagi baris yang ditandai.' }
  return { ok: true, items }
}
