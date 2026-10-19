import { formatQty } from '@/lib/format'
import { wrap, leftRight, center } from '@/pos/receipt'
import { fullName, stockStatus, type LocalProduct, type StockStatus } from '@/products/product'

// Status stok dan saran belanja (PRD 4.3). Saran belanja hanya catatan, karena tidak ada PO.

/** Harga beli terakhir per part (R52: tanpa supplier). */
export type LastPurchase = { purchasePrice: number }

export type Reason = 'rusak' | 'hilang' | 'ketemu' | 'salah_input' | 'lainnya'

/** Daftar alasan tetap untuk opname dan penyesuaian stok (R8). */
export const REASON_LABELS: Record<Reason, string> = {
  rusak: 'Rusak',
  hilang: 'Hilang',
  ketemu: 'Ketemu',
  salah_input: 'Salah input',
  lainnya: 'Lainnya',
}

export const MOVEMENT_LABELS: Record<string, string> = {
  stok_awal: 'Stok awal',
  jual: 'Jual',
  void_jual: 'Void jual',
  cost: 'Beli',
  void_beli: 'Void beli',
  stocktake: 'Opname',
  adjustment: 'Penyesuaian',
}

export type SuggestionLine = {
  product: LocalProduct
  status: StockStatus
  /** (stok minimum x 2) - stok saat ini, tidak kurang dari 0. */
  suggested: number
  last: LastPurchase | null
}

export function suggestedQty(stock: number, minStock: number): number {
  return Math.max(0, Math.round((minStock * 2 - stock) * 100) / 100)
}

/** Part aktif berstatus Menipis, Habis, atau Minus, urut nama. */
export function purchaseSuggestions(products: LocalProduct[], last: Map<string, LastPurchase>): SuggestionLine[] {
  const result: SuggestionLine[] = []
  for (const p of products) {
    if (!p.active || p.type !== 'part' || p.stock === null) continue
    const status = stockStatus(p.stock, p.minStock)
    if (status !== 'low' && status !== 'out' && status !== 'negative') continue
    result.push({ product: p, status, suggested: suggestedQty(p.stock, p.minStock), last: last.get(p.id) ?? null })
  }
  return result.sort((a, b) => fullName(a.product).localeCompare(fullName(b.product), 'id'))
}

export type StatusSummary = Record<StockStatus | 'all' | 'unmonitored', number>

export function summarizeStatus(products: LocalProduct[]): StatusSummary {
  const r: StatusSummary = { all: 0, safe: 0, low: 0, out: 0, negative: 0, unmonitored: 0 }
  for (const p of products) {
    if (!p.active || p.type !== 'part' || p.stock === null) continue
    r.all++
    const s = stockStatus(p.stock, p.minStock)
    r[s ?? 'unmonitored']++
  }
  return r
}

/** Saran belanja untuk printer struk: nama part, stok, dan usulan beli (PRD 4.3). */
export function buildSuggestionText(lines: SuggestionLine[], width: 32 | 48, title: string): string[] {
  const out = [...center(title, width), '-'.repeat(width)]
  for (const b of lines) {
    out.push(...wrap(fullName(b.product), width))
    out.push(...leftRight(`  stok ${formatQty(b.product.stock ?? 0)}`, `beli ${formatQty(b.suggested)} ${b.product.unit ?? ''}`.trim(), width))
  }
  out.push('-'.repeat(width))
  return out
}
