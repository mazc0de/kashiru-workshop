import { useServicesByMechanic } from '@/reports/data'
import { periodLabel } from '@/reports/period'
import { reportFileName, sumOf, useReportContext } from '@/reports/reportContext'
import { ReportView } from '@/reports/ReportView'
import { tableSection } from '@/reports/sections'

/** Jasa per mekanik (PRD 4.11): nota lunas dan omzet jasa per mekanik, dengan baris "Tanpa mekanik". */
export function MechanicsReport() {
  const { period } = useReportContext()
  const rows = useServicesByMechanic(period.from, period.to)
  const sections = rows.data
    ? [
        tableSection({
          title: 'Jasa per mekanik',
          note: 'Omzet jasa setelah diskon. Nota tanpa mekanik dikumpulkan di baris "Tanpa mekanik".',
          rows: rows.data,
          rowKey: (m) => m.mechanicId ?? 'tanpa',
          empty: 'Belum ada nota pada periode ini.',
          columns: [
            {
              title: 'Mekanik',
              value: (m) => m.mechanic ?? 'Tanpa mekanik',
              width: 24,
              render: (m) => m.mechanic ?? <span className="text-muted-foreground">Tanpa mekanik</span>,
            },
            { title: 'Nota', value: (m) => m.sales, kind: 'qty', width: 8 },
            { title: 'Omzet jasa', value: (m) => m.serviceRevenue, kind: 'rupiah', width: 14 },
          ],
          total: ['Total', sumOf(rows.data, (m) => m.sales), sumOf(rows.data, (m) => m.serviceRevenue)],
        }),
      ]
    : null

  return (
    <ReportView
      title="Laporan jasa per mekanik"
      fileName={reportFileName('jasa-per-mekanik', period)}
      note={[`Periode ${periodLabel(period)}`]}
      queries={[rows]}
      sections={sections}
    />
  )
}
