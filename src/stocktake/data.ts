import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { reloadLocalCopy } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { Reason } from '@/stock/stock'
import type { StocktakeLine, Decision, StocktakeStatus } from '@/stocktake/stocktake'

// Sesi opname (PRD 4.5): semua langkah wajib online dan lewat RPC, jadi stok baru berubah saat konfirmasi.

export type StocktakeSession = {
  id: string
  number: string
  kind: 'penuh' | 'kategori'
  categoryId: string | null
  category: string | null
  status: StocktakeStatus
  openedAt: string
  openedBy: string
  /** Waktu dan akun yang mengonfirmasi atau membatalkan. */
  closedAt: string | null
  closedBy: string | null
}

const COLUMNS = `
  id, nomor, jenis, category_id, status, dibuka_pada, dikonfirmasi_pada, dibatalkan_pada,
  categories ( nama ),
  pembuka:profiles!stock_opnames_dibuka_oleh_fkey ( nama ),
  pengonfirmasi:profiles!stock_opnames_dikonfirmasi_oleh_fkey ( nama ),
  pembatal:profiles!stock_opnames_dibatalkan_oleh_fkey ( nama )
`

type SessionRow = {
  id: string
  nomor: string
  jenis: string
  category_id: string | null
  status: string
  dibuka_pada: string
  dikonfirmasi_pada: string | null
  dibatalkan_pada: string | null
  categories: { nama: string } | null
  pembuka: { nama: string } | null
  pengonfirmasi: { nama: string } | null
  pembatal: { nama: string } | null
}

function toSession(r: SessionRow): StocktakeSession {
  const status = r.status as StocktakeStatus
  return {
    id: r.id,
    number: r.nomor,
    kind: r.jenis === 'kategori' ? 'kategori' : 'penuh',
    categoryId: r.category_id,
    category: r.categories?.nama ?? null,
    status,
    openedAt: r.dibuka_pada,
    openedBy: r.pembuka?.nama ?? '',
    closedAt: status === 'dikonfirmasi' ? r.dikonfirmasi_pada : r.dibatalkan_pada,
    closedBy: (status === 'dikonfirmasi' ? r.pengonfirmasi?.nama : r.pembatal?.nama) ?? null,
  }
}

export const sessionKey = (id: string) => ['stocktake', 'session', id] as const
/** Status ikut di kunci: sesi yang baru ditutup dimuat ulang dengan HPP dari mutasinya. Tanpa status = semua. */
export const reviewKey = (id: string, status?: StocktakeStatus) => (status ? (['stocktake', 'review', id, status] as const) : (['stocktake', 'review', id] as const))

export function useStocktakeList() {
  return useQuery({
    queryKey: ['stocktake', 'list'],
    queryFn: async (): Promise<StocktakeSession[]> =>
      unwrap(await supabase().from('stock_opnames').select(COLUMNS).order('dibuka_pada', { ascending: false }).limit(100)).map(toSession),
  })
}

export function useStocktakeSession(id: string) {
  return useQuery({
    queryKey: sessionKey(id),
    queryFn: async (): Promise<StocktakeSession> => toSession(unwrap(await supabase().from('stock_opnames').select(COLUMNS).eq('id', id).single())),
  })
}

/**
 * Semua part dalam cakupan sesi beserta hitungan dan selisihnya (RPC review_opname). Untuk sesi yang
 * sudah dikonfirmasi, selisih rupiah memakai HPP mutasi opname, bukan harga rata-rata hari ini.
 */
export function useStocktakeReview(id: string, status: StocktakeStatus | undefined) {
  return useQuery({
    queryKey: reviewKey(id, status),
    enabled: status !== undefined,
    queryFn: async (): Promise<StocktakeLine[]> => {
      const data = unwrap(await supabase().rpc('review_opname', { p_opname_id: id }))
      const cogs = new Map<string, number>()
      if (status === 'dikonfirmasi') {
        const movements = unwrap(await supabase().from('stock_movements').select('product_id, hpp_satuan').eq('ref_type', 'opname').eq('ref_id', id))
        for (const m of movements) cogs.set(m.product_id, Number(m.hpp_satuan))
      }
      return data.map((b) => {
        const variance = b.selisih === null ? null : Number(b.selisih)
        const movementCost = cogs.get(b.product_id ?? '')
        return {
          productId: b.product_id ?? '',
          name: b.nama ?? '',
          brand: b.merek,
          unit: b.satuan,
          category: b.kategori ?? '',
          decision: (b.keputusan as Decision | null) ?? null,
          countedQty: b.qty_hitung === null ? null : Number(b.qty_hitung),
          countedAt: b.dihitung_pada,
          stockAtCount: b.stok_sistem_saat_hitung === null ? null : Number(b.stok_sistem_saat_hitung),
          currentStock: Number(b.stok_sekarang ?? 0),
          variance: variance,
          avgCost: Number(b.harga_beli_avg ?? 0),
          varianceValue:
            variance !== null && movementCost !== undefined ? Math.round(variance * movementCost) : b.selisih_rupiah === null ? null : Number(b.selisih_rupiah),
          reason: (b.alasan as Reason | null) ?? null,
          reasonNote: b.alasan_keterangan,
          purchasePriceInput: b.harga_beli_input === null ? null : Number(b.harga_beli_input),
          needsPurchasePrice: Boolean(b.perlu_harga_beli),
        }
      })
    },
  })
}

export async function openStocktake(kind: 'penuh' | 'kategori', categoryId: string | null): Promise<{ id: string; number: string }> {
  return unwrap(
    await supabase().rpc('open_opname', { p_jenis: kind, p_category_id: categoryId ?? undefined }),
  ) as { id: string; number: string }
}

/** Scan menambah qty (tambah = true); mengetik qty mengganti hitungan. Mengembalikan qty hitung terbaru. */
export async function recordCount(stocktakeId: string, productId: string, qty: number, add: boolean): Promise<number> {
  const result = await supabase().rpc('record_opname_count', { p_opname_id: stocktakeId, p_product_id: productId, p_qty: qty, p_tambah: add })
  return Number(unwrap(result))
}

export async function saveDecision(stocktakeId: string, productIds: string[], decision: Exclude<Decision, 'dihitung'>): Promise<void> {
  unwrap(await supabase().rpc('set_opname_decision', { p_opname_id: stocktakeId, p_product_ids: productIds, p_keputusan: decision }))
}

export async function saveReason(stocktakeId: string, productIds: string[], reason: Reason, note: string): Promise<void> {
  unwrap(
    await supabase().rpc('set_opname_reason', {
      p_opname_id: stocktakeId,
      p_product_ids: productIds,
      p_alasan: reason,
      p_keterangan: note.trim() || undefined,
    }),
  )
}

export async function savePurchasePrice(stocktakeId: string, productId: string, price: number): Promise<void> {
  unwrap(await supabase().rpc('set_opname_purchase_price', { p_opname_id: stocktakeId, p_product_id: productId, p_harga_beli: price }))
}

export async function confirmStocktake(id: string): Promise<{ number: string; part_selisih: number }> {
  const result = unwrap(await supabase().rpc('confirm_opname', { p_opname_id: id })) as { number: string; part_selisih: number }
  await reloadLocalCopy().catch(() => undefined)
  return result
}

export async function cancelStocktake(id: string): Promise<void> {
  unwrap(await supabase().rpc('cancel_opname', { p_opname_id: id }))
}
