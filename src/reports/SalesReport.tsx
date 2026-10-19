import { formatDate, formatDateTime, formatRupiah } from '@/lib/format'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/pos/calculate'
import { useSalesByCategory, useSalesByDay, useSalesByMethod, useSalesInRange, useSalesSummary } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { reportFileName, sumOf, useReportContext } from '@/reports/reportContext'
import { ReportView, VoidPill } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'

const METHODS: PaymentMethod[] = ['tunai', 'qris', 'transfer', 'edc']

/** Laporan penjualan (PRD 4.11, R34). Nota void ditandai dan tidak dihitung. */
export function SalesReport() {
  const { period } = useReportContext()
  const { from, to } = period
  const summary = useSalesSummary(from, to)
  const byDay = useSalesByDay(from, to)
  const byCategory = useSalesByCategory(from, to)
  const byMethod = useSalesByMethod(from, to)
  const list = useSalesInRange(from, to)

  const s = summary.data
  const sections =
    s && byDay.data && byCategory.data && byMethod.data && list.data
      ? [
          summarySection([
            { label: 'Nota', value: s.sales, kind: 'count' },
            { label: 'Omzet part', value: s.partRevenue },
            { label: 'Omzet jasa', value: s.serviceRevenue },
            { label: 'Total diskon', value: s.discount },
            { label: 'Total', value: s.total },
            { label: 'Nota void', value: s.voidSales, kind: 'count', hint: s.voidSales ? `${formatRupiah(s.voidTotal)}, tidak dihitung` : undefined },
          ]),
          tableSection({
            title: 'Per hari',
            rows: byDay.data,
            rowKey: (d) => d.date,
            empty: 'Tidak ada hari pada periode ini.',
            columns: [
              { title: 'Tanggal', value: (d) => formatDate(d.date), width: 12 },
              { title: 'Nota', value: (d) => d.sales, kind: 'qty', width: 8 },
              { title: 'Omzet part', value: (d) => d.partRevenue, kind: 'rupiah', width: 14 },
              { title: 'Omzet jasa', value: (d) => d.serviceRevenue, kind: 'rupiah', width: 14 },
              { title: 'Diskon', value: (d) => d.discount, kind: 'rupiah', width: 12 },
              { title: 'Total', value: (d) => d.partRevenue + d.serviceRevenue, kind: 'rupiah', width: 14 },
            ],
            total: ['Total', s.sales, s.partRevenue, s.serviceRevenue, s.discount, s.total],
          }),
          tableSection({
            title: 'Per kategori',
            rows: byCategory.data,
            rowKey: (k) => k.categoryId,
            empty: 'Belum ada penjualan.',
            columns: [
              { title: 'Kategori', value: (k) => k.category, width: 24 },
              { title: 'Omzet', value: (k) => k.revenue, kind: 'rupiah', width: 14 },
            ],
            total: ['Total', sumOf(byCategory.data, (k) => k.revenue)],
          }),
          tableSection({
            title: 'Per metode bayar',
            rows: METHODS.map((m) => byMethod.data.find((r) => r.method === m) ?? { method: m, sales: 0, total: 0 }),
            rowKey: (m) => m.method,
            empty: '',
            columns: [
              { title: 'Metode', value: (m) => PAYMENT_METHOD_LABELS[m.method], width: 14 },
              { title: 'Nota', value: (m) => m.sales, kind: 'qty', width: 8 },
              { title: 'Total', value: (m) => m.total, kind: 'rupiah', width: 14 },
            ],
            total: ['Total', sumOf(byMethod.data, (m) => m.sales), sumOf(byMethod.data, (m) => m.total)],
          }),
          tableSection({
            title: 'Daftar nota',
            note: 'Nota void ditandai dan tidak masuk total.',
            rows: list.data,
            rowKey: (n) => n.id,
            empty: 'Belum ada nota pada periode ini.',
            muted: (n) => n.status === 'void',
            limit: 100,
            columns: [
              { title: 'Nomor', value: (n) => n.number, width: 22, render: (n) => <span className="font-mono text-sm whitespace-nowrap">{n.number}</span> },
              { title: 'Waktu', value: (n) => formatDateTime(n.createdAt), width: 17, render: (n) => <span className="whitespace-nowrap">{formatDateTime(n.createdAt)}</span> },
              { title: 'Nopol', value: (n) => n.plate ?? '', width: 12 },
              { title: 'Pelanggan', value: (n) => n.customer ?? '', width: 20 },
              { title: 'Metode', value: (n) => PAYMENT_METHOD_LABELS[n.method], width: 10 },
              { title: 'Kasir', value: (n) => n.cashier, width: 16 },
              { title: 'Total', value: (n) => n.total, kind: 'rupiah', width: 14 },
              { title: 'Status', value: (n) => (n.status === 'void' ? 'Void' : ''), width: 8, render: (n) => (n.status === 'void' ? <VoidPill /> : null) },
            ],
            total: ['Total tanpa void', null, null, null, null, null, sumOf(list.data, (n) => (n.status === 'void' ? 0 : n.total)), null],
          }),
        ]
      : null

  return (
    <ReportView
      title="Laporan penjualan"
      fileName={reportFileName('penjualan', period)}
      note={[`Periode ${periodLabel(period)}`]}
      queries={[summary, byDay, byCategory, byMethod, list]}
      sections={sections}
      orientation="landscape"
    />
  )
}
