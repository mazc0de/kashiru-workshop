import { Fragment, useState, type ReactNode } from 'react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import type { Cell, ColumnKind, ExportColumn } from '@/lib/export'
import { formatNumber, formatQty } from '@/lib/format'

export type ReportColumn<T> = ExportColumn<T> & {
  /** Isi sel di layar; tanpa ini nilai ekspornya yang ditampilkan. */
  render?: (row: T) => ReactNode
}

export type TableSpec<T> = {
  title: string
  note?: ReactNode
  columns: ReportColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  total?: Cell[]
  empty: string
  /** Baris yang tidak dihitung, mis. nota void. */
  muted?: (row: T) => boolean
  limit?: number
}

function cellText(v: Cell, kind: ColumnKind = 'text'): string {
  if (v === null || v === '') return '–'
  if (typeof v === 'string') return v
  return kind === 'qty' ? formatQty(v) : formatNumber(v)
}

/**
 * Tabel satu bagian laporan. Tabel panjang dipotong di layar; ekspor tetap lengkap.
 * Di HP setiap baris menjadi kartu: kolom pertama sebagai judul, kolom lain sebagai pasangan label dan nilai (PRD 6).
 */
export function TableSection<T>({ title, note, columns, rows, rowKey, total, empty, muted, limit }: TableSpec<T>) {
  const [all, setAll] = useState(false)
  const shown = limit && !all ? rows.slice(0, limit) : rows
  const numeric = (c: ReportColumn<T>) => (c.kind ?? 'text') !== 'text'
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-3 rounded-md border border-border bg-card md:hidden">
        {rows.length === 0 && <p className="px-4 py-3 text-muted-foreground">{empty}</p>}
        <ul>
          {shown.map((r) => (
            <li key={rowKey(r)} className={cn('border-rule px-4 py-3 not-first:border-t', muted?.(r) && 'text-muted-foreground')}>
              <div className="font-medium">{columns[0].render ? columns[0].render(r) : cellText(columns[0].value(r), columns[0].kind)}</div>
              <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-sm">
                {columns.slice(1).map((c) => {
                  const v = c.value(r)
                  if (v === null || v === '') return null
                  return (
                    <Fragment key={c.title}>
                      <dt className="text-muted-foreground">{c.title}</dt>
                      <dd className="text-right tabular-nums">{c.render ? c.render(r) : cellText(v, c.kind)}</dd>
                    </Fragment>
                  )
                })}
              </dl>
            </li>
          ))}
        </ul>
        {total && rows.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <div className="font-semibold">{total[0]}</div>
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-sm">
              {total.slice(1).map((v, i) =>
                v === null ? null : (
                  <Fragment key={i}>
                    <dt className="text-muted-foreground">{columns[i + 1].title}</dt>
                    <dd className="text-right font-semibold tabular-nums">{cellText(v, columns[i + 1].kind)}</dd>
                  </Fragment>
                ),
              )}
            </dl>
          </div>
        )}
      </div>
      <div className="mt-3 hidden overflow-x-auto rounded-md border border-border bg-card md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              {columns.map((c) => (
                <th key={c.title} className={cn('px-4 font-normal whitespace-nowrap', numeric(c) && 'text-right')}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={columns.length} className="px-4 py-3 text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={rowKey(r)} className={cn('h-11 border-t border-rule', muted?.(r) && 'text-muted-foreground')}>
                {columns.map((c) => (
                  <td key={c.title} className={cn('px-4 py-2 whitespace-nowrap', numeric(c) && 'text-right tabular-nums')}>
                    {c.render ? c.render(r) : cellText(c.value(r), c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && rows.length > 0 && (
            <tfoot>
              <tr className="h-11 border-t border-border font-semibold">
                {total.map((v, i) => (
                  <td key={i} className={cn('px-4', numeric(columns[i]) && 'text-right whitespace-nowrap tabular-nums')}>
                    {v === null ? '' : cellText(v, columns[i].kind)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {limit && rows.length > limit && (
        <Button variant="outline" className="mt-3" onClick={() => setAll(!all)}>
          {all ? `Tampilkan ${limit} teratas` : `Tampilkan semua (${rows.length})`}
        </Button>
      )}
    </section>
  )
}
