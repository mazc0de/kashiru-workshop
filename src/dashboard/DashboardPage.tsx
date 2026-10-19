import { useState } from 'react'
import { Link } from 'react-router'
import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { formatNumber, formatRupiah } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useSaleOutbox } from '@/pos/outbox'
import { wibDate } from '@/pos/saleNumber'
import { useProductList } from '@/products/data'
import type { StockStatus } from '@/products/product'
import { useSalesByDay, useSalesSummary } from '@/reports/data'
import { addDays } from '@/reports/period'
import { backupOverdue, daysSinceBackup } from '@/settings/backup'
import { useLastBackup } from '@/settings/backupData'
import { summarizeStatus } from '@/stock/stock'
import { dayLabel } from '@/dashboard/chart'
import { SalesChart } from '@/dashboard/SalesChart'

/**
 * Dashboard hari ini (PRD 4.11, R36): angka utama besar dengan grafik 30 hari di sampingnya (grid
 * asimetris, PRD 6), lalu jumlah part Menipis, Habis, dan Minus yang membuka layar Stok dengan filternya.
 */
export function DashboardPage() {
  const [today] = useState(() => wibDate(new Date()))
  const online = useOnline()
  const summary = useSalesSummary(today, today)
  const days = useSalesByDay(addDays(today, -29), today)
  const products = useProductList()
  // Saat offline kueri ditahan, jadi angka dari server tidak pernah selesai dimuat (R24).
  const needsInternet = !online && !(summary.isSuccess && days.isSuccess && products.isSuccess)
  const failed = summary.isError || days.isError || products.isError

  const s = summary.data
  const value = (v: number | undefined, format: (n: number) => string = formatNumber) => (v === undefined ? '–' : format(v))

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">Hari ini, {dayLabel(today)}</p>

      <FailedSalesNotice />
      <BackupReminder />
      {needsInternet && (
        <Notice tone="warning" className="mt-4">
          Butuh internet untuk menampilkan angka dashboard.
        </Notice>
      )}
      {!needsInternet && failed && (
        <Notice tone="error" className="mt-4">
          Sebagian angka tidak bisa dimuat.{' '}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => [summary, days, products].filter((q) => q.isError).forEach((q) => void q.refetch())}
          >
            Coba lagi
          </button>
        </Notice>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="Omzet hari ini" className="rounded-md border border-border bg-card p-5">
          <p className="text-muted-foreground">Omzet hari ini</p>
          <p className="mt-1 text-[40px] leading-[48px] font-semibold tracking-tight tabular-nums">{value(s?.total, formatRupiah)}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-rule pt-4">
            <Stat label="Omzet part" value={value(s?.partRevenue)} swatch="var(--chart-part)" />
            <Stat label="Omzet jasa" value={value(s?.serviceRevenue)} swatch="var(--chart-service)" />
            <Stat label="Laba kotor" value={value(s && s.total - s.cogs)} />
            <Stat label="Nota" value={value(s?.sales)} />
            <Stat label="Kendaraan" value={value(s?.vehicles)} hint="Nopol berbeda" />
          </dl>
        </section>
        <section aria-label="Omzet 30 hari terakhir" className="min-w-0 rounded-md border border-border bg-card p-5">
          {days.isSuccess ? <SalesChart days={days.data} /> : <p className="text-muted-foreground">{needsInternet ? 'Grafik tampil saat online.' : 'Memuat grafik…'}</p>}
        </section>
      </div>

      <StockCounts summary={products.isSuccess ? summarizeStatus(products.data) : null} />
    </>
  )
}

function Stat({ label, value, hint, swatch }: { label: string; value: string; hint?: string; swatch?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {swatch && <span className="inline-block size-2.5 rounded-[2px]" style={{ background: swatch }} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-sm text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** Angka status stok; setiap angka membuka layar Stok dengan filter itu (R36). */
function StockCounts({ summary }: { summary: Record<StockStatus, number> | null }) {
  const items: { status: StockStatus; label: string }[] = [
    { status: 'low', label: 'Menipis' },
    { status: 'out', label: 'Habis' },
    { status: 'negative', label: 'Minus' },
  ]
  return (
    <section aria-label="Status stok part" className="mt-4 rounded-md border border-border bg-card lg:max-w-[560px]">
      <h2 className="px-4 pt-3 text-sm text-muted-foreground">Stok part</h2>
      {/* Satu kartu bersekat, bukan tiga kartu sama besar (PRD 6). */}
      <div className="grid grid-cols-3 divide-x divide-rule">
        {items.map((k) => {
          const count = summary?.[k.status]
          return (
            <Link key={k.status} to={`/stock?status=${k.status}`} className="flex min-h-14 flex-col justify-center px-4 py-2 hover:bg-muted/40">
              <span className="text-sm text-muted-foreground">{k.label}</span>
              <span className={cn('text-lg font-semibold tabular-nums', k.status === 'negative' && count ? 'text-negative' : '')}>
                {count === undefined ? '–' : count}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/** Pengingat backup manual (R47), dari catatan backup di database, jadi tampil di laptop dan HP. */
function BackupReminder() {
  const last = useLastBackup()
  const [now] = useState(() => new Date())
  if (!last.isSuccess) return null
  const days = daysSinceBackup(last.data?.createdAt ?? null, now)
  if (!backupOverdue(days)) return null
  return (
    <Notice tone="warning" className="mt-4">
      {days === null ? 'Belum pernah ada backup.' : `Backup terakhir ${days} hari lalu.`} Unduh backup di{' '}
      <Link to="/settings/backup" className="underline underline-offset-4">
        Pengaturan → Backup
      </Link>{' '}
      (laptop).
    </Notice>
  )
}

/**
 * Nota gagal terkirim (R31). Antrean nota hanya ada di perangkat yang membuatnya, yaitu laptop kasir,
 * jadi HP pemilik tidak pernah menampilkannya.
 */
function FailedSalesNotice() {
  const { failed } = useSaleOutbox()
  if (failed === 0) return null
  return (
    <Notice tone="warning" className="mt-4">
      {failed} nota gagal terkirim. Omzet dan stok di laporan belum menghitungnya.{' '}
      <Link to="/sales" className="underline underline-offset-4">
        Buka Riwayat nota
      </Link>
    </Notice>
  )
}
