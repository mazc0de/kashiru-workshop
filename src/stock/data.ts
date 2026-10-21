import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { refreshLocalProduct } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { Reason } from '@/stock/stock'

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
}): Promise<void> {
  unwrap(
    await supabase().rpc('adjust_stock', {
      p_product_id: options.productId,
      p_qty: options.qty,
      p_alasan: options.reason,
      p_keterangan: options.note || undefined,
    }),
  )
  await refreshLocalProduct(options.productId).catch(() => undefined)
}
