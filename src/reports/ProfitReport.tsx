import { formatDate } from '@/lib/format'
import { fullName } from '@/products/product'
import { useSalesByCategory, useSalesByDay, useSalesByProduct, useSalesSummary } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { marginPercent } from '@/reports/reports'
import { reportFileName, sumOf, useReportContext } from '@/reports/reportContext'
import { ReportView } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'

/** Laba kotor (PRD 4.11, R28): omzet setelah semua diskon − HPP; jasa tanpa HPP. */
export function ProfitReport() {
  const { period } = useReportContext()
  const { from, to } = period
  const summary = useSalesSummary(from, to)
  const byDay = useSalesByDay(from, to)
  const byCategory = useSalesByCategory(from, to)
  const byProduct = useSalesByProduct(from, to)

  const s = summary.data
  const sections =
    s && byDay.data && byCategory.data && byProduct.data
      ? [
          summarySection([
            { label: 'Omzet', value: s.total },
            { label: 'HPP', value: s.cogs },
            { label: 'Laba kotor', value: s.total - s.cogs },
            { label: 'Margin', value: marginPercent(s.total, s.cogs), kind: 'percent' },
          ]),
          tableSection({
            title: 'Per hari',
            rows: byDay.data,
            rowKey: (d) => d.date,
            empty: 'Tidak ada hari pada periode ini.',
            columns: [
              { title: 'Tanggal', value: (d) => formatDate(d.date), width: 12 },
              { title: 'Omzet', value: (d) => d.partRevenue + d.serviceRevenue, kind: 'rupiah', width: 14 },
              { title: 'HPP', value: (d) => d.cogs, kind: 'rupiah', width: 14 },
              { title: 'Laba kotor', value: (d) => d.partRevenue + d.serviceRevenue - d.cogs, kind: 'rupiah', width: 14 },
              { title: 'Margin %', value: (d) => marginPercent(d.partRevenue + d.serviceRevenue, d.cogs), kind: 'qty', width: 10 },
            ],
            total: ['Total', s.total, s.cogs, s.total - s.cogs, marginPercent(s.total, s.cogs)],
          }),
          tableSection({
            title: 'Per kategori',
            rows: byCategory.data,
            rowKey: (k) => k.categoryId,
            empty: 'Belum ada penjualan.',
            columns: [
              { title: 'Kategori', value: (k) => k.category, width: 24 },
              { title: 'Omzet', value: (k) => k.revenue, kind: 'rupiah', width: 14 },
              { title: 'HPP', value: (k) => k.cogs, kind: 'rupiah', width: 14 },
              { title: 'Laba kotor', value: (k) => k.revenue - k.cogs, kind: 'rupiah', width: 14 },
              { title: 'Margin %', value: (k) => marginPercent(k.revenue, k.cogs), kind: 'qty', width: 10 },
            ],
            total: ['Total', s.total, s.cogs, s.total - s.cogs, marginPercent(s.total, s.cogs)],
          }),
          tableSection({
            title: 'Per produk',
            note: 'Part dan jasa, urut laba kotor terbesar.',
            rows: byProduct.data,
            rowKey: (p) => p.productId,
            empty: 'Belum ada penjualan.',
            limit: 100,
            columns: [
              { title: 'Produk', value: (p) => fullName(p), width: 36 },
              { title: 'Tipe', value: (p) => (p.type === 'jasa' ? 'Jasa' : 'Part'), width: 8 },
              { title: 'Qty', value: (p) => p.qty, kind: 'qty', width: 8 },
              { title: 'Omzet', value: (p) => p.revenue, kind: 'rupiah', width: 14 },
              { title: 'HPP', value: (p) => p.cogs, kind: 'rupiah', width: 14 },
              { title: 'Laba kotor', value: (p) => p.revenue - p.cogs, kind: 'rupiah', width: 14 },
              { title: 'Margin %', value: (p) => marginPercent(p.revenue, p.cogs), kind: 'qty', width: 10 },
            ],
            total: ['Total', null, null, sumOf(byProduct.data, (p) => p.revenue), sumOf(byProduct.data, (p) => p.cogs), sumOf(byProduct.data, (p) => p.revenue - p.cogs), null],
          }),
        ]
      : null

  return (
    <ReportView
      title="Laporan laba kotor"
      fileName={reportFileName('laba-kotor', period)}
      note={[`Periode ${periodLabel(period)}`]}
      queries={[summary, byDay, byCategory, byProduct]}
      sections={sections}
      orientation="landscape"
    />
  )
}
