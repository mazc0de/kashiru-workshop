import { formatNumber, formatRupiah, parseRupiah } from '@/lib/format'
import type { Discount } from '@/pos/calculate'

// Isian diskon per baris langsung di tabel Kasir (R55): angka = rupiah untuk total baris, akhiran % = persen.

export type DiscountInputResult = { ok: true; discount: Discount } | { ok: false; error: string }

const NOT_A_NUMBER = 'Isi angka, mis. 2000 atau 10%'

/** Baca isian diskon untuk baris senilai `base` (qty x harga). Kosong atau 0 berarti tanpa diskon. */
export function parseLineDiscount(text: string, base: number): DiscountInputResult {
  const t = text.trim()
  if (!t) return { ok: true, discount: null }

  if (t.endsWith('%')) {
    const n = t.slice(0, -1).trim().replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(n)) return { ok: false, error: NOT_A_NUMBER }
    const value = Number(n)
    if (value > 100) return { ok: false, error: 'Persen 0 sampai 100' }
    if (Math.round(value * 100) !== value * 100) return { ok: false, error: 'Persen paling banyak 2 angka di belakang koma' }
    return { ok: true, discount: value === 0 ? null : { kind: 'persen', input: value } }
  }

  if (/^\d+,\d+$/.test(t)) return { ok: false, error: 'Diskon rupiah tanpa koma; untuk persen tambahkan %' }
  const value = parseRupiah(t)
  if (value === null) return { ok: false, error: NOT_A_NUMBER }
  if (value > base) return { ok: false, error: `Maksimal ${formatRupiah(base)}` }
  return { ok: true, discount: value === 0 ? null : { kind: 'nominal', input: value } }
}

/** Diskon tersimpan sebagai teks isian: "2.000" atau "2,5%". */
export function discountText(d: Discount): string {
  if (!d) return ''
  return d.kind === 'persen' ? `${String(d.input).replace('.', ',')}%` : formatNumber(d.input)
}
