import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { reloadLocalCopy } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { ReceivingItem } from '@/receiving/receiving'

// Penerimaan barang (PRD 4.4): wajib online, tidak pernah diedit, koreksi lewat void. Tanpa supplier dan
// nomor faktur (R52); kolom lama di database tetap ada tetapi tidak dipakai lagi.

export type ReceivingSummary = {
  id: string
  number: string
  /** Tanggal masuk barang (kolom tanggal_faktur). */
  receivedDate: string
  createdAt: string
  status: 'aktif' | 'void'
  account: string
  lineCount: number
}

// Harga beli tidak dibaca lagi (R64): harga beli angka diganti Kode Harga Beli di part.
const COLUMNS = 'id, nomor, tanggal_faktur, dibuat_pada, status, profiles!receipts_user_id_fkey ( nama ), receipt_items ( qty )'

type ReceivingRow = {
  id: string
  nomor: string
  tanggal_faktur: string
  dibuat_pada: string
  status: string
  profiles: { nama: string } | null
  receipt_items: { qty: number }[]
}

function toSummary(r: ReceivingRow): ReceivingSummary {
  return {
    id: r.id,
    number: r.nomor,
    receivedDate: r.tanggal_faktur,
    createdAt: r.dibuat_pada,
    status: r.status === 'void' ? 'void' : 'aktif',
    account: r.profiles?.nama ?? '',
    lineCount: r.receipt_items.length,
  }
}

export function useReceivingList(query: string) {
  const term = query.trim()
  return useQuery({
    queryKey: ['receiving', 'list', term],
    queryFn: async (): Promise<ReceivingSummary[]> => {
      let q = supabase().from('receipts').select(COLUMNS).order('dibuat_pada', { ascending: false }).limit(200)
      if (term) {
        const safe = term.replace(/[,()*%"\\]/g, ' ').replace(/\s+/g, ' ').trim()
        q = q.ilike('nomor', `%${safe}%`)
      }
      return unwrap(await q).map(toSummary)
    },
  })
}

const PAGE_SIZE = 1000

/** Penerimaan pada rentang tanggal masuk (laporan penerimaan), termasuk yang di-void. */
export async function fetchReceivingInRange(from: string, to: string): Promise<ReceivingSummary[]> {
  const result: ReceivingSummary[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const rows = unwrap(
      await supabase()
        .from('receipts')
        .select(COLUMNS)
        .gte('tanggal_faktur', from)
        .lte('tanggal_faktur', to)
        .order('tanggal_faktur', { ascending: false })
        .order('dibuat_pada', { ascending: false })
        .range(start, start + PAGE_SIZE - 1),
    )
    result.push(...rows.map(toSummary))
    if (rows.length < PAGE_SIZE) return result
  }
}

export type ReceivingDetail = ReceivingSummary & {
  voidReason: string | null
  voidedAt: string | null
  voidedBy: string | null
  lines: { name: string; brand: string | null; unit: string | null; qty: number }[]
}

export function useReceivingDetail(id: string | null) {
  return useQuery({
    queryKey: ['receiving', 'detail', id ?? ''],
    enabled: Boolean(id),
    queryFn: async (): Promise<ReceivingDetail> => {
      const r = unwrap(
        await supabase()
          .from('receipts')
          .select(
            `${COLUMNS}, void_alasan, void_pada, pembatal:profiles!receipts_void_oleh_fkey ( nama ),
             baris:receipt_items ( urutan, qty, products ( nama, merek, satuan ) )`,
          )
          .eq('id', id!)
          .single(),
      )
      return {
        id: r.id,
        number: r.nomor,
        receivedDate: r.tanggal_faktur,
        createdAt: r.dibuat_pada,
        status: r.status === 'void' ? 'void' : 'aktif',
        account: r.profiles?.nama ?? '',
        lineCount: r.receipt_items.length,
        voidReason: r.void_alasan,
        voidedAt: r.void_pada,
        voidedBy: r.pembatal?.nama ?? null,
        lines: [...r.baris]
          .sort((a, b) => a.urutan - b.urutan)
          .map((b) => ({
            name: b.products?.nama ?? '',
            brand: b.products?.merek ?? null,
            unit: b.products?.satuan ?? null,
            qty: Number(b.qty),
          })),
      }
    },
  })
}

export async function saveReceiving(options: {
  items: ReceivingItem[]
  receivedDate: string
}): Promise<{ id: string; number: string }> {
  const result = unwrap(
    await supabase().rpc('create_receipt', { p_items: options.items, p_tanggal_faktur: options.receivedDate }),
  ) as { id: string; number: string }
  await reloadLocalCopy().catch(() => undefined)
  return result
}

export async function voidReceiving(id: string, reason: string): Promise<void> {
  unwrap(await supabase().rpc('void_receipt', { p_receipt_id: id, p_alasan: reason }))
  await reloadLocalCopy().catch(() => undefined)
}
