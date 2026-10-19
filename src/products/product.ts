// Bentuk produk di sisi aplikasi, pencarian kilat, dan status stok.
// Dipakai bersama oleh salinan lokal (Dexie), layar Produk, dan nanti layar Kasir.

export type ProductType = 'part' | 'jasa'

export type LocalProduct = {
  id: string
  type: ProductType
  name: string
  brand: string | null
  categoryId: string
  category: string
  unit: string | null
  allowsFraction: boolean
  sellingPrice: number
  /** null untuk jasa. */
  stock: number | null
  minStock: number
  avgCost: number
  barcodes: string[]
  partNumbers: string[]
  active: boolean
}

/** "Kampas Rem Depan Vario · Federal" seperti di hasil pencarian dan struk (PRD 4.2). */
export function fullName(p: Pick<LocalProduct, 'name' | 'brand'>): string {
  return p.brand ? `${p.name} · ${p.brand}` : p.name
}

// Status stok ----------------------------------------------------------------

export type StockStatus = 'safe' | 'low' | 'out' | 'negative'

/**
 * PRD 4.3: Aman (stok > stok minimum), Menipis (0 < stok <= stok minimum), Habis (stok = 0),
 * Minus (stok < 0). Part dengan stok minimum 0 hanya bisa Habis atau Minus; selain itu null.
 */
export function stockStatus(stock: number, minStock: number): StockStatus | null {
  if (stock < 0) return 'negative'
  if (stock === 0) return 'out'
  if (minStock <= 0) return null
  return stock <= minStock ? 'low' : 'safe'
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  safe: 'Aman',
  low: 'Menipis',
  out: 'Habis',
  negative: 'Minus',
}

// Pencarian ------------------------------------------------------------------

const foldCase = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
const alnum = (s: string) => foldCase(s).replace(/[^a-z0-9]/g, '')

type SearchIndex = { product: LocalProduct; text: string; words: string[]; code: string[]; barcode: string[] }

function buildIndex(p: LocalProduct): SearchIndex {
  const text = foldCase(`${p.name} ${p.brand ?? ''}`).replace(/\s+/g, ' ').trim()
  return {
    product: p,
    text,
    words: text.split(/[^a-z0-9]+/).filter(Boolean),
    code: p.partNumbers.map(alnum),
    barcode: p.barcodes.map((b) => b.toLowerCase()),
  }
}

function scoreToken(entry: SearchIndex, token: string): number {
  const alnumTokens = alnum(token)
  if (entry.words.some((k) => k.startsWith(token))) return 10
  if (entry.text.includes(token)) return 5
  if (alnumTokens && entry.code.some((k) => k.includes(alnumTokens))) return 8
  if (entry.barcode.some((b) => b.startsWith(token))) return 8
  return 0
}

export type SearchOptions = { categoryId?: string | null; includeInactive?: boolean; limit?: number }

/**
 * Pencarian kilat lewat nama, merek, barcode, atau kode part (PRD 4.3).
 * Setiap kata di kueri harus cocok. Barcode atau kode part yang sama persis ditaruh paling atas.
 */
export function searchProducts(list: LocalProduct[], query: string, options: SearchOptions = {}): LocalProduct[] {
  const candidates = list.filter(
    (p) => (options.includeInactive || p.active) && (!options.categoryId || p.categoryId === options.categoryId),
  )
  const token = foldCase(query).split(/\s+/).filter(Boolean)
  if (token.length === 0) {
    const sequence = [...candidates].sort((a, b) => fullName(a).localeCompare(fullName(b), 'id'))
    return options.limit ? sequence.slice(0, options.limit) : sequence
  }

  const fullQuery = foldCase(query.trim())
  const queryAlnum = alnum(query)
  const result: { product: LocalProduct; score: number }[] = []
  for (const p of candidates) {
    const entry = buildIndex(p)
    let score = 0
    let allMatch = true
    for (const t of token) {
      const s = scoreToken(entry, t)
      if (s === 0) {
        allMatch = false
        break
      }
      score += s
    }
    const sameBarcode = entry.barcode.includes(fullQuery)
    const sameCode = queryAlnum.length > 0 && entry.code.includes(queryAlnum)
    if (!allMatch && !sameBarcode && !sameCode) continue
    if (sameBarcode) score += 1000
    if (sameCode) score += 900
    if (entry.text.startsWith(token[0])) score += 20
    result.push({ product: p, score })
  }

  result.sort((a, b) => b.score - a.score || fullName(a.product).localeCompare(fullName(b.product), 'id'))
  const sequence = result.map((h) => h.product)
  return options.limit ? sequence.slice(0, options.limit) : sequence
}

/** Produk aktif yang barcode-nya persis sama dengan hasil scan. */
export function findByBarcode(list: LocalProduct[], code: string): LocalProduct | null {
  const target = code.trim().toLowerCase()
  return list.find((p) => p.active && p.barcodes.some((b) => b.toLowerCase() === target)) ?? null
}
