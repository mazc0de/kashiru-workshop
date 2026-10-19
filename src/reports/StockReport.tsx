import { useMemo } from 'react'
import { Link } from 'react-router'

import { formatDate, formatQty } from '@/lib/format'
import { fullName } from '@/products/product'
import { useSalesByProduct, useStockValue } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { fastMoving, slowMoving, summarizeStockValue, type StockValueRow } from '@/reports/reports'
import { reportFileName, useReportContext } from '@/reports/reportContext'
import { ReportView } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'

/** Tanda nilai persediaan yang perlu dicek (R30). */
function valueFlag(r: StockValueRow): string {
  if (r.stock < 0) return 'Minus · perlu dicek'
  if (r.stock > 0 && r.avgCost === 0) return 'Belum ada harga beli'
  return ''
}

const partLink = (r: { productId: string; name: string; brand: string | null }) => (
  <Link to={`/stock/${r.productId}`} className="underline-offset-4 hover:underline">
    {fullName(r)}
  </Link>
)

/**
 * Laporan stok (PRD 4.11, R29, R30, R33): nilai persediaan dan slow-moving selalu saat ini,
 * hanya fast-moving yang mengikuti periode.
 */
export function StockReport() {
  const { period, today } = useReportContext()
  const stock = useStockValue()
  const sales = useSalesByProduct(period.from, period.to)

  const sections = useMemo(() => {
    if (!stock.data || !sales.data) return null
    const summary = summarizeStockValue(stock.data)
    const byValue = [...stock.data].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'id'))
    const flags = [
      summary.negativeCount ? `${summary.negativeCount} part minus dihitung 0 dan perlu dicek.` : '',
      summary.noCostCount ? `${summary.noCostCount} part berstok belum ada harga beli, nilainya 0.` : '',
    ].filter(Boolean)
    return [
      summarySection(
        [
          { label: 'Nilai persediaan', value: summary.total, hint: 'Stok × harga beli rata-rata' },
          { label: 'Part aktif', value: stock.data.length, kind: 'count' },
          { label: 'Part minus', value: summary.negativeCount, kind: 'count' },
          { label: 'Belum ada harga beli', value: summary.noCostCount, kind: 'count' },
        ],
        flags.length ? flags.join(' ') : undefined,
      ),
      tableSection({
        title: 'Nilai per kategori',
        rows: summary.byCategory,
        rowKey: (k) => k.category,
        empty: 'Belum ada part aktif.',
        columns: [
          { title: 'Kategori', value: (k) => k.category, width: 24 },
          { title: 'Part', value: (k) => k.parts, kind: 'qty', width: 8 },
          { title: 'Nilai', value: (k) => k.value, kind: 'rupiah', width: 16 },
        ],
        total: ['Total', stock.data.length, summary.total],
      }),
      tableSection({
        title: 'Nilai per part',
        note: 'Urut nilai terbesar. Nama part membuka kartu stok.',
        rows: byValue,
        rowKey: (r) => r.productId,
        empty: 'Belum ada part aktif.',
        limit: 100,
        columns: [
          { title: 'Part', value: (r) => fullName(r), width: 36, render: partLink },
          { title: 'Kategori', value: (r) => r.category, width: 18 },
          {
            title: 'Stok',
            value: (r) => r.stock,
            kind: 'qty',
            width: 8,
            render: (r) => <span className={r.stock < 0 ? 'text-negative' : undefined}>{`${formatQty(r.stock)} ${r.unit ?? ''}`.trim()}</span>,
          },
          { title: 'Harga beli rata-rata', value: (r) => r.avgCost || null, kind: 'rupiah', width: 18 },
          { title: 'Nilai', value: (r) => r.value, kind: 'rupiah', width: 16 },
          {
            title: 'Keterangan',
            value: valueFlag,
            width: 22,
            render: (r) => valueFlag(r) && <span className="inline-flex h-6 items-center rounded-sm bg-pill-warning px-2 text-sm whitespace-nowrap text-pill-warning-ink">{valueFlag(r)}</span>,
          },
        ],
        total: ['Total', null, null, null, summary.total, null],
      }),
      tableSection({
        title: 'Slow-moving',
        note: 'Part berstok yang tidak terjual dalam 90 hari terakhir dan terdaftar lebih dari 90 hari. Urut nilai terbesar.',
        rows: slowMoving(stock.data, today),
        rowKey: (r) => r.productId,
        empty: 'Tidak ada part slow-moving.',
        limit: 100,
        columns: [
          { title: 'Part', value: (r) => fullName(r), width: 36, render: partLink },
          { title: 'Terakhir terjual', value: (r) => (r.lastSold ? formatDate(r.lastSold) : 'Belum pernah'), width: 16 },
          { title: 'Stok', value: (r) => r.stock, kind: 'qty', width: 8 },
          { title: 'Nilai', value: (r) => r.value, kind: 'rupiah', width: 16 },
        ],
      }),
      tableSection({
        title: 'Fast-moving',
        note: `20 part dengan qty terjual terbanyak, periode ${periodLabel(period)}. Nota void tidak dihitung.`,
        rows: fastMoving(sales.data),
        rowKey: (r) => r.productId,
        empty: 'Belum ada part terjual pada periode ini.',
        columns: [
          { title: 'Part', value: (r) => fullName(r), width: 36, render: partLink },
          { title: 'Qty terjual', value: (r) => r.qty, kind: 'qty', width: 12 },
          { title: 'Omzet', value: (r) => r.revenue, kind: 'rupiah', width: 14 },
          { title: 'Laba kotor', value: (r) => r.revenue - r.cogs, kind: 'rupiah', width: 14 },
          { title: 'Stok', value: (r) => r.stock, kind: 'qty', width: 8 },
        ],
      }),
    ]
  }, [stock.data, sales.data, today, period])

  return (
    <ReportView
      title="Laporan stok"
      fileName={reportFileName('stok', period)}
      note={[`Nilai persediaan dan slow-moving per ${formatDate(today)}`, `Fast-moving ${periodLabel(period)}`]}
      queries={[stock, sales]}
      sections={sections}
      orientation="landscape"
    />
  )
}
