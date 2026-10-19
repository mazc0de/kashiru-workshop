import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { reloadLocalCopy } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod } from '@/pos/calculate'
import { plateKey } from '@/pos/plate'
import type { ReceiptLine } from '@/pos/receipt'

// Riwayat nota (PRD 4.6) dan void nota (PRD 4.7).

export type SaleSummary = {
  id: string
  number: string
  originalNumber: string | null
  createdAt: string
  plate: string | null
  customer: string | null
  total: number
  method: PaymentMethod
  status: 'lunas' | 'void'
  cashier: string
}

const COLUMNS = 'id, nomor, nomor_asli, dibuat_pada, nopol, nama_pelanggan, total, metode_bayar, status, profiles!sales_user_id_fkey ( nama )'

function toSummary(b: {
  id: string
  nomor: string
  nomor_asli: string | null
  dibuat_pada: string
  nopol: string | null
  nama_pelanggan: string | null
  total: number
  metode_bayar: string
  status: string
  profiles: { nama: string } | null
}): SaleSummary {
  return {
    id: b.id,
    number: b.nomor,
    originalNumber: b.nomor_asli,
    createdAt: b.dibuat_pada,
    plate: b.nopol,
    customer: b.nama_pelanggan,
    total: Number(b.total),
    method: b.metode_bayar as PaymentMethod,
    status: b.status === 'void' ? 'void' : 'lunas',
    cashier: b.profiles?.nama ?? '',
  }
}

const PAGE_SIZE = 1000 // batas baris per permintaan di Data API Supabase

/** Semua nota pada rentang tanggal nota (laporan penjualan), termasuk yang di-void. */
export async function fetchSalesInRange(from: string, to: string): Promise<SaleSummary[]> {
  const result: SaleSummary[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const rows = unwrap(
      await supabase()
        .from('sales')
        .select(COLUMNS)
        .gte('tanggal_nota', from)
        .lte('tanggal_nota', to)
        .order('dibuat_pada', { ascending: false })
        .order('id')
        .range(start, start + PAGE_SIZE - 1),
    )
    result.push(...rows.map(toSummary))
    if (rows.length < PAGE_SIZE) return result
  }
}

export type ServiceVisit = SaleSummary & {
  mechanic: string | null
  serviceNote: string | null
  lines: { type: 'part' | 'jasa'; name: string; brand: string | null; qty: number }[]
}

/** Riwayat servis satu kendaraan (PRD 4.11): semua nota dengan nopol itu, terbaru di atas. */
export function useServiceHistory(plate: string) {
  const key = plateKey(plate.trim())
  return useQuery({
    queryKey: ['sale', 'service-history', key],
    enabled: key.length >= 3,
    queryFn: async (): Promise<ServiceVisit[]> => {
      const rows = unwrap(
        await supabase()
          .from('sales')
          .select(`${COLUMNS}, catatan_servis, mechanics ( nama ), sale_items ( urutan, tipe, nama_snapshot, merek_snapshot, qty )`)
          .eq('nopol_kunci', key)
          .order('dibuat_pada', { ascending: false })
          .limit(200),
      )
      return rows.map((b) => ({
        ...toSummary(b),
        mechanic: b.mechanics?.nama ?? null,
        serviceNote: b.catatan_servis,
        lines: [...b.sale_items]
          .sort((x, y) => x.urutan - y.urutan)
          .map((s) => ({ type: s.tipe === 'jasa' ? 'jasa' : 'part', name: s.nama_snapshot, brand: s.merek_snapshot, qty: Number(s.qty) })),
      }))
    },
  })
}

/** Nota pada satu tanggal, atau hasil pencarian nomor/nopol/pelanggan di semua tanggal. */
export function useSaleList(date: string, query: string) {
  const term = query.trim()
  return useQuery({
    queryKey: ['sale', 'list', term ? `cari:${term}` : `tgl:${date}`],
    queryFn: async (): Promise<SaleSummary[]> => {
      let q = supabase().from('sales').select(COLUMNS).order('dibuat_pada', { ascending: false }).limit(200)
      if (term) {
        // Karakter pemisah filter PostgREST dibuang dari kata kunci.
        const safe = term.replace(/[,()*%"\\]/g, ' ').replace(/\s+/g, ' ').trim()
        q = q.or(`nomor.ilike."*${safe}*",nopol_kunci.ilike."*${plateKey(safe)}*",nama_pelanggan.ilike."*${safe}*"`)
      } else {
        q = q.eq('tanggal_nota', date)
      }
      return unwrap(await q).map(toSummary)
    },
  })
}

export type SaleDetail = SaleSummary & {
  mechanic: string | null
  serviceNote: string | null
  subtotal: number
  saleDiscount: number
  cash: number
  change: number
  voidReason: string | null
  voidedAt: string | null
  voidedBy: string | null
  lines: ReceiptLine[]
}

export function useSaleDetail(id: string | null) {
  return useQuery({
    queryKey: ['sale', 'detail', id ?? ''],
    enabled: Boolean(id),
    queryFn: async (): Promise<SaleDetail> => {
      const b = unwrap(
        await supabase()
          .from('sales')
          .select(
            `${COLUMNS}, catatan_servis, subtotal, diskon_nota, uang_diterima, kembalian, void_alasan, void_pada,
             mechanics ( nama ), pembatal:profiles!sales_void_oleh_fkey ( nama ),
             sale_items ( urutan, nama_snapshot, merek_snapshot, tipe, qty, harga, jumlah, diskon )`,
          )
          .eq('id', id!)
          .single(),
      )
      return {
        ...toSummary(b),
        mechanic: b.mechanics?.nama ?? null,
        serviceNote: b.catatan_servis,
        subtotal: Number(b.subtotal),
        saleDiscount: Number(b.diskon_nota),
        cash: Number(b.uang_diterima),
        change: Number(b.kembalian),
        voidReason: b.void_alasan,
        voidedAt: b.void_pada,
        voidedBy: b.pembatal?.nama ?? null,
        lines: [...b.sale_items]
          .sort((x, y) => x.urutan - y.urutan)
          .map((s) => ({
            type: s.tipe === 'jasa' ? 'jasa' : 'part',
            name: s.nama_snapshot,
            brand: s.merek_snapshot,
            qty: Number(s.qty),
            price: Number(s.harga),
            amount: Number(s.jumlah),
            discount: Number(s.diskon),
          })),
      }
    },
  })
}

/** Void seluruh nota (PRD 4.7). Stok part kembali lewat mutasi void jual di server. */
export async function voidSale(id: string, reason: string): Promise<void> {
  unwrap(await supabase().rpc('void_sale', { p_sale_id: id, p_alasan: reason }))
  await reloadLocalCopy().catch(() => undefined)
}
