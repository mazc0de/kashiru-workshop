import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toTable } from '@/lib/export'
import { formatDateTime, formatNumber, formatQty } from '@/lib/format'
import { formatPlate, plateKey } from '@/pos/plate'
import { useServiceHistory, type ServiceVisit } from '@/pos/sales'
import { fullName } from '@/products/product'
import { ReportView, VoidPill } from '@/reports/ReportView'
import { type ReportColumn } from '@/reports/sections'

const lineText = (l: ServiceVisit['lines'][number]) => `${fullName(l)} × ${formatQty(l.qty)}`

const COLUMNS: ReportColumn<ServiceVisit>[] = [
  { title: 'Waktu', value: (v) => formatDateTime(v.createdAt), width: 17 },
  { title: 'Nomor', value: (v) => v.number, width: 22 },
  { title: 'Pelanggan', value: (v) => v.customer ?? '', width: 18 },
  { title: 'Mekanik', value: (v) => v.mechanic ?? '', width: 16 },
  { title: 'Catatan servis', value: (v) => v.serviceNote ?? '', width: 30 },
  { title: 'Rincian', value: (v) => v.lines.map(lineText).join('; '), width: 50 },
  { title: 'Total', value: (v) => v.total, kind: 'rupiah', width: 14 },
  { title: 'Status', value: (v) => (v.status === 'void' ? 'Void' : ''), width: 8 },
]

/** Riwayat servis satu kendaraan (PRD 4.11): semua nota untuk satu nopol, terbaru di atas, tanpa periode. */
export function ServiceHistoryReport() {
  const [params, setParams] = useSearchParams()
  const plate = params.get('plate') ?? ''
  const [text, setText] = useState(plate)
  const visits = useServiceHistory(plate)
  const tooShort = plateKey(plate.trim()).length < 3

  const sections = visits.data
    ? [
        {
          title: 'Riwayat servis',
          table: toTable('Riwayat servis', COLUMNS, visits.data),
          node: <VisitList key="riwayat" visits={visits.data} />,
        },
      ]
    : null

  return (
    <>
      <form
        className="mt-4 flex max-w-[480px] gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const value = formatPlate(text)
          setText(value)
          setParams(
            (current) => {
              const next = new URLSearchParams(current)
              if (value) next.set('plate', value)
              else next.delete('plate')
              return next
            },
            { replace: true },
          )
        }}
      >
        <Input aria-label="Nopol" placeholder="Nopol, mis. B 1234 XYZ" className="uppercase" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit">Cari</Button>
      </form>
      {tooShort ? (
        <p className="mt-6 text-muted-foreground">Ketik nopol kendaraan untuk melihat semua notanya, terbaru di atas.</p>
      ) : (
        <ReportView
          title="Riwayat servis"
          fileName={`riwayat-servis-${plateKey(plate)}`}
          note={[`Nopol ${formatPlate(plate)}`]}
          queries={[visits]}
          sections={sections}
          orientation="landscape"
        />
      )}
    </>
  )
}

function VisitList({ visits }: { visits: ServiceVisit[] }) {
  if (visits.length === 0) return <p className="mt-6 text-muted-foreground">Belum ada nota untuk nopol ini.</p>
  return (
    <section className="mt-6">
      <p className="text-sm text-muted-foreground">
        {visits.length >= 200 ? '200 nota terbaru.' : `${visits.length} nota.`} Nota void ditandai.
      </p>
      <ul className="mt-3 overflow-hidden rounded-md border border-border bg-card">
        {visits.map((v, i) => (
          <li key={v.id} className={cn('px-4 py-3', i > 0 && 'border-t border-rule', v.status === 'void' && 'text-muted-foreground')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{v.number}</span>
                  {v.status === 'void' && <VoidPill />}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(v.createdAt)} · {v.mechanic ?? 'Tanpa mekanik'}
                  {v.customer ? ` · ${v.customer}` : ''}
                </p>
              </div>
              <p className="shrink-0 tabular-nums">{formatNumber(v.total)}</p>
            </div>
            {v.serviceNote && <p className="mt-1.5 text-sm">Catatan: {v.serviceNote}</p>}
            <ul className="mt-1.5 text-sm text-muted-foreground">
              {v.lines.map((l, j) => (
                <li key={j}>
                  {l.type === 'jasa' ? 'Jasa' : 'Part'} · {lineText(l)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
