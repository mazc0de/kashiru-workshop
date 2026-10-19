import { useQuery } from '@tanstack/react-query'

import { unwrap, type SupabaseError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod } from '@/pos/calculate'
import type { DailySummary } from '@/pos/dailySummary'
import { fetchSalesInRange } from '@/pos/sales'
import { fetchReceivingInRange } from '@/receiving/data'
import type { Reason } from '@/stock/stock'
import type { ProductSalesRow, StockValueRow } from '@/reports/reports'

// Data laporan dan dashboard (PRD 4.11) dari fungsi SQL migrasi 7. Angka bigint/numeric dari Data API
// diubah ke number; nilai rupiah selalu bulat.

const n = (v: unknown) => Number(v ?? 0)

const PAGE_SIZE = 1000 // batas baris per permintaan di Data API Supabase, berlaku juga untuk fungsi

/** Semua baris fungsi laporan yang bisa lebih dari 1000 baris. Urutan di fungsinya pasti, jadi aman dipotong. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: SupabaseError | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const data = unwrap(await page(from, from + PAGE_SIZE - 1))
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}

export type SalesSummary = {
  sales: number
  vehicles: number
  partRevenue: number
  serviceRevenue: number
  discount: number
  total: number
  cogs: number
  voidSales: number
  voidTotal: number
}

async function fetchSalesSummary(from: string, to: string): Promise<SalesSummary> {
  const [r] = unwrap(await supabase().rpc('report_sales_summary', { p_from: from, p_to: to }))
  return {
    sales: n(r?.nota),
    vehicles: n(r?.kendaraan),
    partRevenue: n(r?.omzet_part),
    serviceRevenue: n(r?.omzet_jasa),
    discount: n(r?.diskon),
    total: n(r?.total),
    cogs: n(r?.hpp),
    voidSales: n(r?.void_nota),
    voidTotal: n(r?.void_total),
  }
}

export function useSalesSummary(from: string, to: string) {
  return useQuery({ queryKey: ['reports', 'sales-summary', from, to], queryFn: () => fetchSalesSummary(from, to) })
}

export type SalesDay = { date: string; sales: number; partRevenue: number; serviceRevenue: number; discount: number; cogs: number }

export function useSalesByDay(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'sales-by-day', from, to],
    queryFn: async (): Promise<SalesDay[]> =>
      (await allRows((a, b) => supabase().rpc('report_sales_by_day', { p_from: from, p_to: to }).range(a, b))).map((r) => ({
        date: r.tanggal ?? '',
        sales: n(r.nota),
        partRevenue: n(r.omzet_part),
        serviceRevenue: n(r.omzet_jasa),
        discount: n(r.diskon),
        cogs: n(r.hpp),
      })),
  })
}

export type CategorySales = { categoryId: string; category: string; revenue: number; cogs: number }

export function useSalesByCategory(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'sales-by-category', from, to],
    queryFn: async (): Promise<CategorySales[]> =>
      unwrap(await supabase().rpc('report_sales_by_category', { p_from: from, p_to: to })).map((r) => ({
        categoryId: r.category_id ?? '',
        category: r.kategori ?? '',
        revenue: n(r.omzet),
        cogs: n(r.hpp),
      })),
  })
}

export type MethodSales = { method: PaymentMethod; sales: number; total: number }

async function fetchSalesByMethod(from: string, to: string): Promise<MethodSales[]> {
  return unwrap(await supabase().rpc('report_sales_by_method', { p_from: from, p_to: to })).map((r) => ({
    method: r.metode_bayar as PaymentMethod,
    sales: n(r.nota),
    total: n(r.total),
  }))
}

export function useSalesByMethod(from: string, to: string) {
  return useQuery({ queryKey: ['reports', 'sales-by-method', from, to], queryFn: () => fetchSalesByMethod(from, to) })
}

/** Isi ringkasan harian untuk printer struk (R32). */
export async function fetchDailySummary(date: string): Promise<DailySummary> {
  const [summary, byMethod] = await Promise.all([fetchSalesSummary(date, date), fetchSalesByMethod(date, date)])
  return {
    date,
    sales: summary.sales,
    partRevenue: summary.partRevenue,
    serviceRevenue: summary.serviceRevenue,
    total: summary.total,
    voidSales: summary.voidSales,
    voidTotal: summary.voidTotal,
    byMethod: Object.fromEntries(byMethod.map((m) => [m.method, m.total])),
  }
}

export function useSalesByProduct(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'sales-by-product', from, to],
    queryFn: async (): Promise<ProductSalesRow[]> =>
      (await allRows((a, b) => supabase().rpc('report_sales_by_product', { p_from: from, p_to: to }).range(a, b))).map((r) => ({
        productId: r.product_id ?? '',
        name: r.nama ?? '',
        brand: r.merek,
        type: r.tipe === 'jasa' ? 'jasa' : 'part',
        category: r.kategori ?? '',
        qty: n(r.qty),
        revenue: n(r.omzet),
        cogs: n(r.hpp),
        stock: r.stok === null ? null : n(r.stok),
      })),
  })
}

export type MechanicServices = { mechanicId: string | null; mechanic: string | null; sales: number; serviceRevenue: number }

export function useServicesByMechanic(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'services-by-mechanic', from, to],
    queryFn: async (): Promise<MechanicServices[]> =>
      unwrap(await supabase().rpc('report_services_by_mechanic', { p_from: from, p_to: to })).map((r) => ({
        mechanicId: r.mechanic_id,
        mechanic: r.mekanik,
        sales: n(r.nota),
        serviceRevenue: n(r.omzet_jasa),
      })),
  })
}

export function useStockValue() {
  return useQuery({
    queryKey: ['reports', 'stock-value'],
    queryFn: async (): Promise<StockValueRow[]> =>
      (await allRows((a, b) => supabase().rpc('report_stock_value').range(a, b))).map((r) => ({
        productId: r.product_id ?? '',
        name: r.nama ?? '',
        brand: r.merek,
        category: r.kategori ?? '',
        unit: r.satuan,
        stock: n(r.stok),
        avgCost: n(r.harga_beli_avg),
        value: n(r.nilai),
        registeredAt: r.terdaftar_pada ?? '',
        lastSold: r.terakhir_terjual,
      })),
  })
}

export type StocktakeSessionResult = {
  id: string
  number: string
  kind: 'penuh' | 'kategori'
  category: string | null
  confirmedAt: string
  variantParts: number
  over: number
  short: number
}

export function useStocktakeSessions(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'stocktake-sessions', from, to],
    queryFn: async (): Promise<StocktakeSessionResult[]> =>
      unwrap(await supabase().rpc('report_stocktake_sessions', { p_from: from, p_to: to })).map((r) => ({
        id: r.id ?? '',
        number: r.nomor ?? '',
        kind: r.jenis === 'kategori' ? 'kategori' : 'penuh',
        category: r.kategori,
        confirmedAt: r.dikonfirmasi_pada ?? '',
        variantParts: n(r.part_selisih),
        over: n(r.lebih),
        short: n(r.kurang),
      })),
  })
}

export type ReasonVariance = { reason: Reason | null; qty: number; value: number }

export function useStocktakeByReason(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'stocktake-by-reason', from, to],
    queryFn: async (): Promise<ReasonVariance[]> =>
      unwrap(await supabase().rpc('report_stocktake_by_reason', { p_from: from, p_to: to })).map((r) => ({
        reason: (r.alasan as Reason | null) ?? null,
        qty: n(r.qty),
        value: n(r.nilai),
      })),
  })
}

/** Daftar nota untuk laporan penjualan, termasuk yang di-void. */
export function useSalesInRange(from: string, to: string) {
  return useQuery({ queryKey: ['reports', 'sales-list', from, to], queryFn: () => fetchSalesInRange(from, to) })
}

/** Daftar penerimaan untuk laporan penerimaan, termasuk yang di-void. */
export function useReceivingInRange(from: string, to: string) {
  return useQuery({ queryKey: ['reports', 'receiving-list', from, to], queryFn: () => fetchReceivingInRange(from, to) })
}
