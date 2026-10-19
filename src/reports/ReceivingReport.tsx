import { formatDate, formatRupiah } from '@/lib/format'
import { useReceivingInRange } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { reportFileName, sumOf, useReportContext } from '@/reports/reportContext'
import { ReportView, VoidPill } from '@/reports/ReportView'
import { summarySection, tableSection } from '@/reports/sections'

/** Laporan penerimaan (PRD 4.11) per tanggal masuk, tanpa supplier (R52). Penerimaan void ditandai dan tidak dihitung. */
export function ReceivingReport() {
  const { period } = useReportContext()
  const list = useReceivingInRange(period.from, period.to)

  const sections =
    list.data
      ? (() => {
          const active = list.data.filter((r) => r.status === 'aktif')
          const voided = list.data.filter((r) => r.status === 'void')
          return [
            summarySection([
              { label: 'Penerimaan', value: active.length, kind: 'count' },
              { label: 'Total nilai', value: sumOf(active, (r) => r.total) },
              {
                label: 'Penerimaan void',
                value: voided.length,
                kind: 'count',
                hint: voided.length ? `${formatRupiah(sumOf(voided, (r) => r.total))}, tidak dihitung` : undefined,
              },
            ]),
            tableSection({
              title: 'Daftar penerimaan',
              note: 'Penerimaan void ditandai dan tidak masuk total.',
              rows: list.data,
              rowKey: (r) => r.id,
              empty: 'Belum ada penerimaan pada periode ini.',
              muted: (r) => r.status === 'void',
              limit: 100,
              columns: [
                { title: 'Nomor', value: (r) => r.number, width: 22, render: (r) => <span className="font-mono text-sm whitespace-nowrap">{r.number}</span> },
                { title: 'Tanggal masuk', value: (r) => formatDate(r.receivedDate), width: 14 },
                { title: 'Akun', value: (r) => r.account, width: 16 },
                { title: 'Baris', value: (r) => r.lineCount, kind: 'qty', width: 8 },
                { title: 'Total', value: (r) => r.total, kind: 'rupiah', width: 14 },
                { title: 'Status', value: (r) => (r.status === 'void' ? 'Void' : ''), width: 8, render: (r) => (r.status === 'void' ? <VoidPill /> : null) },
              ],
              total: ['Total tanpa void', null, null, null, sumOf(active, (r) => r.total), null],
            }),
          ]
        })()
      : null

  return (
    <ReportView
      title="Laporan penerimaan"
      fileName={reportFileName('penerimaan', period)}
      note={[`Periode tanggal masuk ${periodLabel(period)}`]}
      queries={[list]}
      sections={sections}
      orientation="landscape"
    />
  )
}
