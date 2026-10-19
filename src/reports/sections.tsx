import type { ReactNode } from 'react'

import { toTable, type ExportTable } from '@/lib/export'
import { formatNumber, formatRupiah } from '@/lib/format'
import { TableSection, type TableSpec } from '@/reports/TableSection'

export type { ReportColumn } from '@/reports/TableSection'

// Bagian laporan (R34): satu definisi dipakai untuk layar, Excel (satu sheet per bagian), dan PDF
// (bagian berurutan), jadi isi ekspor selalu sama dengan yang tampil.

export type Section = { title: string; table: ExportTable; node: ReactNode }

/** Bagian berupa tabel. */
export function tableSection<T>(spec: TableSpec<T>): Section {
  return { title: spec.title, table: toTable(spec.title, spec.columns, spec.rows, spec.total), node: <TableSection key={spec.title} {...spec} /> }
}

export type Stat = { label: string; value: number | null; kind?: 'rupiah' | 'count' | 'percent'; hint?: string }

const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const statText = (s: Stat) =>
  s.value === null ? '–' : s.kind === 'percent' ? `${percent.format(s.value)}%` : s.kind === 'count' ? formatNumber(s.value) : formatRupiah(s.value)

/** Ringkasan sebagai kartu angka di layar, dan tabel Keterangan/Nilai di ekspor. */
export function summarySection(stats: Stat[], note?: ReactNode): Section {
  return {
    title: 'Ringkasan',
    table: {
      title: 'Ringkasan',
      columns: [
        { title: 'Keterangan', kind: 'text', width: 30 },
        { title: 'Nilai', kind: 'rupiah', width: 18 },
      ],
      rows: stats.map((s) => [s.label, s.kind === 'percent' ? statText(s) : s.value]),
    },
    node: (
      <section key="Ringkasan" aria-label="Ringkasan" className="mt-6">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-card px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{statText(s)}</dd>
              {s.hint && <dd className="text-sm text-muted-foreground">{s.hint}</dd>}
            </div>
          ))}
        </dl>
        {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
      </section>
    ),
  }
}
