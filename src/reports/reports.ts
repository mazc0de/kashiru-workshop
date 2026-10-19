import { addDays } from '@/reports/period'

// Olahan laporan di sisi aplikasi (R29, R30). Angka dasarnya dihitung SQL (migrasi 7).

export type StockValueRow = {
  productId: string
  name: string
  brand: string | null
  category: string
  unit: string | null
  stock: number
  avgCost: number
  /** Stok minus dihitung 0 (R30). */
  value: number
  registeredAt: string
  /** Tanggal nota terakhir yang tidak di-void, atau null kalau belum pernah terjual. */
  lastSold: string | null
}

export type ProductSalesRow = {
  productId: string
  name: string
  brand: string | null
  type: 'part' | 'jasa'
  category: string
  qty: number
  revenue: number
  cogs: number
  /** Stok sekarang, null untuk jasa. */
  stock: number | null
}

const SLOW_DAYS = 90
const FAST_COUNT = 20

const wibDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso))

/**
 * Slow-moving (R29): stok > 0, tidak terjual dalam 90 hari terakhir (termasuk belum pernah), dan sudah
 * terdaftar lebih dari 90 hari. Urut nilai persediaan terbesar.
 */
export function slowMoving(rows: StockValueRow[], today: string): StockValueRow[] {
  // 90 hari terakhir = hari ini dan 89 hari sebelumnya.
  const cutoff = addDays(today, -SLOW_DAYS)
  return rows
    .filter((r) => r.stock > 0 && wibDate(r.registeredAt) <= cutoff && (r.lastSold === null || r.lastSold <= cutoff))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'id'))
}

/** Fast-moving (R29): 20 part dengan qty terjual terbanyak di periode. */
export function fastMoving(rows: ProductSalesRow[]): ProductSalesRow[] {
  return rows
    .filter((r) => r.type === 'part')
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name, 'id'))
    .slice(0, FAST_COUNT)
}

export type StockValueSummary = {
  total: number
  /** Part dengan stok minus: tidak dihitung, perlu dicek (R30). */
  negativeCount: number
  /** Part berstok tanpa harga beli rata-rata: nilainya 0 (R30). */
  noCostCount: number
  byCategory: { category: string; parts: number; value: number }[]
}

export function summarizeStockValue(rows: StockValueRow[]): StockValueSummary {
  const byCategory = new Map<string, { parts: number; value: number }>()
  for (const r of rows) {
    const c = byCategory.get(r.category) ?? { parts: 0, value: 0 }
    c.parts++
    c.value += r.value
    byCategory.set(r.category, c)
  }
  return {
    total: rows.reduce((s, r) => s + r.value, 0),
    negativeCount: rows.filter((r) => r.stock < 0).length,
    noCostCount: rows.filter((r) => r.stock > 0 && r.avgCost === 0).length,
    byCategory: [...byCategory].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.value - a.value || a.category.localeCompare(b.category, 'id')),
  }
}

/** Margin laba kotor dalam persen, satu angka desimal; null kalau omzet 0. */
export function marginPercent(revenue: number, cogs: number): number | null {
  return revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : null
}
