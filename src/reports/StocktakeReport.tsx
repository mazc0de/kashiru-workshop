import { Link } from 'react-router'

import { formatDateTime } from '@/lib/format'
import { useStocktakeByReason, useStocktakeSessions } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { reportFileName, sumOf, useReportContext } from '@/reports/reportContext'
import { ReportView } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'
import { REASON_LABELS } from '@/stock/stock'
import { sessionScope } from '@/stocktake/stocktake'

/** Laporan opname (PRD 4.11): sesi yang dikonfirmasi pada periode. Sesi batal tidak dihitung. */
export function StocktakeReport() {
  const { period } = useReportContext()
  const sessions = useStocktakeSessions(period.from, period.to)
  const byReason = useStocktakeByReason(period.from, period.to)

  const sections =
    sessions.data && byReason.data
      ? (() => {
          const over = sumOf(sessions.data, (s) => s.over)
          const short = sumOf(sessions.data, (s) => s.short)
          return [
            summarySection([
              { label: 'Sesi dikonfirmasi', value: sessions.data.length, kind: 'count' },
              { label: 'Part berselisih', value: sumOf(sessions.data, (s) => s.variantParts), kind: 'count' },
              { label: 'Selisih lebih', value: over },
              { label: 'Selisih kurang', value: short },
              { label: 'Selisih bersih', value: over + short },
            ]),
            tableSection({
              title: 'Sesi opname',
              note: 'Selisih dalam rupiah memakai harga beli rata-rata saat konfirmasi.',
              rows: sessions.data,
              rowKey: (s) => s.id,
              empty: 'Belum ada opname yang dikonfirmasi pada periode ini.',
              columns: [
                {
                  title: 'Nomor',
                  value: (s) => s.number,
                  width: 22,
                  render: (s) => (
                    <Link to={`/stocktake/${s.id}`} className="font-mono text-sm whitespace-nowrap underline-offset-4 hover:underline">
                      {s.number}
                    </Link>
                  ),
                },
                { title: 'Dikonfirmasi', value: (s) => formatDateTime(s.confirmedAt), width: 17 },
                { title: 'Cakupan', value: sessionScope, width: 22 },
                { title: 'Part berselisih', value: (s) => s.variantParts, kind: 'qty', width: 14 },
                { title: 'Lebih', value: (s) => s.over, kind: 'rupiah', width: 14 },
                { title: 'Kurang', value: (s) => s.short, kind: 'rupiah', width: 14 },
                { title: 'Bersih', value: (s) => s.over + s.short, kind: 'rupiah', width: 14 },
              ],
              total: ['Total', null, null, sumOf(sessions.data, (s) => s.variantParts), over, short, over + short],
            }),
            tableSection({
              title: 'Selisih per alasan',
              rows: byReason.data,
              rowKey: (r) => r.reason ?? 'tanpa',
              empty: 'Belum ada selisih pada periode ini.',
              columns: [
                { title: 'Alasan', value: (r) => (r.reason ? REASON_LABELS[r.reason] : 'Tanpa alasan'), width: 20 },
                { title: 'Qty', value: (r) => r.qty, kind: 'qty', width: 10 },
                { title: 'Nilai', value: (r) => r.value, kind: 'rupiah', width: 14 },
              ],
              total: ['Total', null, sumOf(byReason.data, (r) => r.value)],
            }),
          ]
        })()
      : null

  return (
    <ReportView
      title="Laporan opname"
      fileName={reportFileName('opname', period)}
      note={[`Periode tanggal konfirmasi ${periodLabel(period)}`]}
      queries={[sessions, byReason]}
      sections={sections}
      orientation="landscape"
    />
  )
}
