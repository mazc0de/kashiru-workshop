import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { refreshLocalProduct } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { Reason, LastPurchase } from '@/stock/stock'

/** Harga beli terakhir per part (view last_purchase). */
export function useLastPurchases() {
  return useQuery({
    queryKey: ['stock', 'last-purchase'],
    queryFn: async (): Promise<Map<string, LastPurchase>> => {
      const productMap = new Map<string, LastPurchase>()
      for (let from = 0; ; from += 1000) {
        const data = unwrap(
          await supabase().from('last_purchase').select('product_id, harga_beli').order('product_id').range(from, from + 999),
        )
        for (const b of data) {
          if (b.product_id) productMap.set(b.product_id, { purchasePrice: Number(b.harga_beli) })
        }
        if (data.length < 1000) return productMap
      }
    },
  })
}

export type StockCardEntry = {
  id: number
  time: string
  kind: string
  qtyIn: number | null
  qtyOut: number | null
  balance: number
  cogs: number
  documentNumber: string | null
  refType: string | null
  refId: string | null
  reason: Reason | null
  note: string | null
  account: string | null
}

/** Kartu stok satu part (PRD 4.3), terbaru di atas. */
export function useStockCard(productId: string) {
  return useQuery({
    queryKey: ['stock', 'card', productId],
    queryFn: async (): Promise<StockCardEntry[]> => {
      const data = unwrap(
        await supabase()
          .from('stock_card')
          .select('id, created_at, jenis, qty_masuk, qty_keluar, saldo, hpp_satuan, nomor_dokumen, ref_type, ref_id, alasan, keterangan, nama_akun')
          .eq('product_id', productId)
          .order('id', { ascending: false })
          .limit(500),
      )
      return data.map((m) => ({
        id: Number(m.id),
        time: m.created_at ?? '',
        kind: m.jenis ?? '',
        qtyIn: m.qty_masuk === null ? null : Number(m.qty_masuk),
        qtyOut: m.qty_keluar === null ? null : Number(m.qty_keluar),
        balance: Number(m.saldo),
        cogs: Number(m.hpp_satuan),
        documentNumber: m.nomor_dokumen,
        refType: m.ref_type,
        refId: m.ref_id,
        reason: (m.alasan as Reason | null) ?? null,
        note: m.keterangan,
        account: m.nama_akun,
      }))
    },
  })
}

/** Penyesuaian stok (PRD 4.3, R8). qty positif = tambah, negatif = kurang. */
export async function adjustStock(options: {
  productId: string
  qty: number
  reason: Reason
  note: string
  purchasePrice: number | null
}): Promise<void> {
  unwrap(
    await supabase().rpc('adjust_stock', {
      p_product_id: options.productId,
      p_qty: options.qty,
      p_alasan: options.reason,
      p_keterangan: options.note || undefined,
      p_harga_beli: options.purchasePrice ?? undefined,
    }),
  )
  await refreshLocalProduct(options.productId).catch(() => undefined)
}
