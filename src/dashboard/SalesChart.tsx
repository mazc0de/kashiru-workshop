import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { dayLabel, niceScale, shortRupiah } from '@/dashboard/chart'
import type { SalesDay } from '@/reports/data'

/*
 * Grafik omzet 30 hari (R36, skill dataviz): batang per hari, part di bawah dan jasa di atasnya,
 * celah 2px warna kartu di antara segmen dan antarbatang, ujung atas membulat 4px, batang paling lebar 24px.
 * Warna jasa di bawah 3:1 terhadap kartu, jadi identitas juga dibawa legenda, tooltip, dan tampilan tabel.
 */

const HEIGHT = 220
const PLOT_LEFT = 52
/** Ruang kanan supaya label tanggal terakhir tidak terpotong. */
const PLOT_RIGHT_PAD = 16
const PLOT_TOP = 8
const PLOT_BOTTOM = HEIGHT - 26
const GAP = 2
const MAX_BAR = 24
const RADIUS = 4

const PART = 'var(--chart-part)'
const SERVICE = 'var(--chart-service)'

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** Batang dengan dua sudut atas membulat dan dasar rata di garis dasar. */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
}

export function SalesChart({ days }: { days: SalesDay[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Omzet 30 hari terakhir</h2>
        <Button variant="ghost" size="sm" className="-my-2 -mr-2" aria-pressed={view === 'table'} onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
          {view === 'chart' ? 'Tabel' : 'Grafik'}
        </Button>
      </div>
      <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Swatch color={PART} />
          Part
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color={SERVICE} />
          Jasa
        </span>
      </div>
      {view === 'chart' ? <Bars days={days} /> : <DayTable days={days} />}
    </>
  )
}

function Bars({ days }: { days: SalesDay[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const [active, setActive] = useState<number | null>(null)

  const totals = days.map((d) => d.partRevenue + d.serviceRevenue)
  const { top, ticks } = niceScale(Math.max(0, ...totals))
  const plotRight = width - PLOT_RIGHT_PAD
  const slot = days.length ? (plotRight - PLOT_LEFT) / days.length : 0
  const barWidth = Math.max(2, Math.min(MAX_BAR, slot - Math.max(GAP, slot * 0.3)))
  const scale = (v: number) => (v / top) * (PLOT_BOTTOM - PLOT_TOP)
  const y = (v: number) => PLOT_BOTTOM - scale(v)
  const sum = totals.reduce((s, t) => s + t, 0)
  const activeDay = active === null ? null : days[active]

  return (
    <div ref={ref} className="relative mt-4" style={{ height: HEIGHT }} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`Omzet 30 hari terakhir, total Rp ${formatNumber(sum)}. Rincian per hari ada di tampilan tabel.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PLOT_LEFT} x2={plotRight} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border)' : 'var(--rule)'} />
              <text x={PLOT_LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--muted-foreground)">
                {shortRupiah(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const center = PLOT_LEFT + slot * (i + 0.5)
            const x = center - barWidth / 2
            const partHeight = scale(d.partRevenue)
            const serviceHeight = scale(d.serviceRevenue)
            // Celah 2px diambil dari segmen jasa supaya tinggi total tetap sesuai omzet.
            const serviceShown = partHeight > 0 ? Math.max(0, serviceHeight - GAP) : serviceHeight
            const partOnTop = serviceShown === 0
            const labelled = (days.length - 1 - i) % 7 === 0
            return (
              <g key={d.date}>
                {active === i && <rect x={center - slot / 2} y={PLOT_TOP} width={slot} height={PLOT_BOTTOM - PLOT_TOP} fill="var(--muted)" />}
                {partHeight > 0 &&
                  (partOnTop ? (
                    <path d={topRounded(x, PLOT_BOTTOM - partHeight, barWidth, partHeight)} fill={PART} />
                  ) : (
                    <rect x={x} y={PLOT_BOTTOM - partHeight} width={barWidth} height={partHeight} fill={PART} />
                  ))}
                {serviceShown > 0 && <path d={topRounded(x, y(d.partRevenue + d.serviceRevenue), barWidth, serviceShown)} fill={SERVICE} />}
                {labelled && (
                  <text x={center} y={HEIGHT - 6} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">
                    {`${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`}
                  </text>
                )}
                {/* Area sentuh selebar slot dan setinggi grafik, lebih besar dari batangnya. */}
                <rect
                  x={center - slot / 2}
                  y={PLOT_TOP}
                  width={slot}
                  height={PLOT_BOTTOM - PLOT_TOP}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                />
              </g>
            )
          })}
        </svg>
      )}
      {activeDay && active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-[184px] rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-sm"
          style={{ left: Math.min(Math.max(0, PLOT_LEFT + slot * (active + 0.5) - 92), Math.max(0, width - 184)) }}
        >
          <p className="font-medium">{dayLabel(activeDay.date)}</p>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Swatch color={PART} />
              Part
            </dt>
            <dd className="text-right tabular-nums">{formatNumber(activeDay.partRevenue)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Swatch color={SERVICE} />
              Jasa
            </dt>
            <dd className="text-right tabular-nums">{formatNumber(activeDay.serviceRevenue)}</dd>
            <dt className="pl-4 text-muted-foreground">Total</dt>
            <dd className="text-right font-medium tabular-nums">{formatNumber(activeDay.partRevenue + activeDay.serviceRevenue)}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}

function DayTable({ days }: { days: SalesDay[] }) {
  return (
    <div className="mt-4 max-h-[220px] overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="h-9 text-muted-foreground">
            <th className="font-normal">Tanggal</th>
            <th className="text-right font-normal">Part</th>
            <th className="text-right font-normal">Jasa</th>
            <th className="text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.date} className={cn('h-9 border-t border-rule tabular-nums', d.partRevenue + d.serviceRevenue === 0 && 'text-muted-foreground')}>
              <td>{dayLabel(d.date)}</td>
              <td className="text-right">{formatNumber(d.partRevenue)}</td>
              <td className="text-right">{formatNumber(d.serviceRevenue)}</td>
              <td className="text-right">{formatNumber(d.partRevenue + d.serviceRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
