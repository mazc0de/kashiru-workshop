import { useMemo } from 'react'
import { Link } from 'react-router'

import { formatDate, formatQty } from '@/lib/format'
import { fullName } from '@/products/product'
import { useSalesByProduct, useStockValue } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { fastMoving, slowMoving } from '@/reports/reports'
import { reportFileName, useReportContext } from '@/reports/reportContext'
import { ReportView } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'

const partLink = (r: { productId: string; name: string; brand: string | null }) => (
  <Link to={`/stock/${r.productId}`} className="underline-offset-4 hover:underline">
    {fullName(r)}
  </Link>
)

/**
 * Laporan stok (PRD 4.11, R29, R33): stok per part dan slow-moving selalu saat ini, hanya fast-moving yang
 * mengikuti periode. Tanpa nilai persediaan dan laba kotor sejak R64, karena Kashiru tidak tahu harga beli.
 */
export function StockReport() {
  const { period, today } = useReportContext()
  const stock = useStockValue()
  const sales = useSalesByProduct(period.from, period.to)

  const sections = useMemo(() => {
    if (!stock.data || !sales.data) return null
    const negativeCount = stock.data.filter((r) => r.stock < 0).length
    const byCategory = [...stock.data].sort((a, b) => a.category.localeCompare(b.category, 'id') || a.name.localeCompare(b.name, 'id'))
    return [
      summarySection(
        [
          { label: 'Part aktif', value: stock.data.length, kind: 'count' },
          { label: 'Part minus', value: negativeCount, kind: 'count' },
        ],
        negativeCount ? `${negativeCount} part minus perlu dicek.` : undefined,
      ),
      tableSection({
        title: 'Stok per part',
        note: 'Urut kategori dan nama. Nama part membuka kartu stok.',
        rows: byCategory,
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
          {
            title: 'Keterangan',
            value: (r) => (r.stock < 0 ? 'Minus · perlu dicek' : ''),
            width: 22,
            render: (r) =>
              r.stock < 0 && <span className="inline-flex h-6 items-center rounded-sm bg-pill-warning px-2 text-sm whitespace-nowrap text-pill-warning-ink">Minus · perlu dicek</span>,
          },
        ],
      }),
      tableSection({
        title: 'Slow-moving',
        note: 'Part berstok yang tidak terjual dalam 90 hari terakhir dan terdaftar lebih dari 90 hari. Urut stok terbanyak.',
        rows: slowMoving(stock.data, today),
        rowKey: (r) => r.productId,
        empty: 'Tidak ada part slow-moving.',
        limit: 100,
        columns: [
          { title: 'Part', value: (r) => fullName(r), width: 36, render: partLink },
          { title: 'Terakhir terjual', value: (r) => (r.lastSold ? formatDate(r.lastSold) : 'Belum pernah'), width: 16 },
          { title: 'Stok', value: (r) => r.stock, kind: 'qty', width: 8 },
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
          { title: 'Stok', value: (r) => r.stock, kind: 'qty', width: 8 },
        ],
      }),
    ]
  }, [stock.data, sales.data, today, period])

  return (
    <ReportView
      title="Laporan stok"
      fileName={reportFileName('stok', period)}
      note={[`Stok dan slow-moving per ${formatDate(today)}`, `Fast-moving ${periodLabel(period)}`]}
      queries={[stock, sales]}
      sections={sections}
      orientation="landscape"
    />
  )
}
