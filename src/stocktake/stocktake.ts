import { wrap, leftRight, center } from '@/pos/receipt'
import type { Reason } from '@/stock/stock'

// Sesi opname (PRD 4.5): hitung -> tinjau -> konfirmasi. Baris tinjau berasal dari RPC review_opname.

export type Decision = 'dihitung' | 'dianggap_nol' | 'dilewati'
export type StocktakeStatus = 'dibuka' | 'dikonfirmasi' | 'dibatalkan'

export const DECISION_LABELS: Record<Decision, string> = { dihitung: 'Dihitung', dianggap_nol: 'Dianggap 0', dilewati: 'Dilewati' }
export const SESSION_STATUS_LABELS: Record<StocktakeStatus, string> = { dibuka: 'Terbuka', dikonfirmasi: 'Dikonfirmasi', dibatalkan: 'Dibatalkan' }

export function sessionScope(s: { kind: 'penuh' | 'kategori'; category: string | null }): string {
  return s.kind === 'penuh' ? 'Semua part aktif' : `Kategori ${s.category ?? ''}`
}

export type StocktakeLine = {
  productId: string
  name: string
  brand: string | null
  unit: string | null
  category: string
  decision: Decision | null
  countedQty: number | null
  countedAt: string | null
  stockAtCount: number | null
  currentStock: number
  /** null untuk part yang belum dihitung atau dilewati. */
  variance: number | null
  avgCost: number
  varianceValue: number | null
  reason: Reason | null
  reasonNote: string | null
  purchasePriceInput: number | null
  needsPurchasePrice: boolean
}

export type StocktakeSummary = {
  total: number
  dihitung: number
  undecided: number
  assumedZero: number
  dilewati: number
  overCount: number
  shortCount: number
  matched: number
  overValue: number
  shortValue: number
  /** Selisih bukan 0 yang alasannya belum lengkap, atau butuh harga beli (syarat konfirmasi, R8). */
  incomplete: number
}

export function isReasonComplete(b: StocktakeLine): boolean {
  if (b.variance === null || b.variance === 0) return true
  if (!b.reason || (b.reason === 'lainnya' && !b.reasonNote)) return false
  return !b.needsPurchasePrice || b.purchasePriceInput !== null
}

export function summarizeStocktake(lines: StocktakeLine[]): StocktakeSummary {
  const r: StocktakeSummary = {
    total: lines.length,
    dihitung: 0,
    undecided: 0,
    assumedZero: 0,
    dilewati: 0,
    overCount: 0,
    shortCount: 0,
    matched: 0,
    overValue: 0,
    shortValue: 0,
    incomplete: 0,
  }
  for (const b of lines) {
    if (b.decision === null) r.undecided++
    else if (b.decision === 'dihitung') r.dihitung++
    else if (b.decision === 'dianggap_nol') r.assumedZero++
    else r.dilewati++
    if (b.variance === null) continue
    if (b.variance > 0) {
      r.overCount++
      r.overValue += b.varianceValue ?? 0
    } else if (b.variance < 0) {
      r.shortCount++
      r.shortValue += b.varianceValue ?? 0
    } else r.matched++
    if (!isReasonComplete(b)) r.incomplete++
  }
  return r
}

/** Bisa dikonfirmasi kalau semua part sudah dihitung atau diputuskan dan semua selisih sudah beralasan. */
export function canConfirm(r: StocktakeSummary): boolean {
  return r.total > 0 && r.undecided === 0 && r.incomplete === 0
}

/**
 * Lembar hitung untuk printer struk (PRD 4.5): nama, merek, satuan, dan garis kosong untuk qty,
 * tanpa stok sistem. Urutannya sama dengan daftar input lembar hitung (kategori, nama, merek).
 */
export function buildCountSheet(lines: StocktakeLine[], width: 32 | 48, title: string[]): string[] {
  const out = [...title.flatMap((j) => center(j, width)), '-'.repeat(width)]
  let category: string | null = null
  for (const b of lines) {
    if (b.category !== category) {
      if (category !== null) out.push('')
      out.push(b.category.toUpperCase())
      category = b.category
    }
    const name = b.brand ? `${b.name} · ${b.brand}` : b.name
    out.push(...wrap(name, width))
    out.push(...leftRight(`  ${b.unit ?? ''}`, 'qty ________', width))
  }
  out.push('-'.repeat(width), '', 'Dihitung oleh: ______________')
  return out
}
