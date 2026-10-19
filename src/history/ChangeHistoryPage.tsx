import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { ACTION_GROUPS, actionLabel, describeChanges, type ActionGroup, type ChangeEntry } from '@/history/changeLog'
import { useAccountOptions, useChangeLog } from '@/history/data'
import { PeriodFilter } from '@/reports/PeriodFilter'
import { usePeriod } from '@/reports/usePeriod'
import { periodLabel } from '@/reports/period'
import { useMasterData } from '@/settings/masterData'

const SELECT = 'h-11 rounded-md border border-input bg-card px-3 text-[15px]'

/**
 * Riwayat perubahan (PRD 4.12, R35): filter akun, periode, dan jenis aksi tersimpan di alamat.
 * Di laptop setiap catatan satu baris berkolom; di HP menjadi kartu dan filternya bisa dilipat.
 */
export function ChangeHistoryPage() {
  const periodState = usePeriod()
  const { period } = periodState
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account')
  const groupParam = params.get('group')
  const group = ACTION_GROUPS.some((g) => g.id === groupParam) ? (groupParam as ActionGroup) : null
  const [filtersOpen, setFiltersOpen] = useState(false)
  const online = useOnline()
  const accounts = useAccountOptions()
  const categories = useMasterData('category')
  const categoryNames = useMemo(() => new Map((categories.data ?? []).map((k) => [k.id, k.name])), [categories.data])
  const log = useChangeLog({ accountId, from: period.from, to: period.to, group })
  const entries = log.data?.pages.flat() ?? []
  // Saat offline kueri ditahan, jadi riwayat tidak pernah selesai dimuat (R24).
  const needsInternet = !online && !log.isSuccess
  const activeFilters = (accountId ? 1 : 0) + (group ? 1 : 0) + (period.preset === 'thisMonth' ? 0 : 1)

  const setParam = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Riwayat perubahan</h1>
      <p className="mt-1 text-muted-foreground">Semua perubahan atas data yang sudah ada, terbaru di atas. Catatan tidak bisa diedit atau dihapus.</p>

      <Button variant="outline" className="mt-4 lg:hidden" aria-expanded={filtersOpen} aria-controls="history-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
        {filtersOpen ? 'Tutup filter' : `Filter${activeFilters ? ` (${activeFilters} aktif)` : ''}`}
      </Button>
      <div id="history-filters" className={cn('mt-4 flex-wrap items-center gap-2 lg:flex', filtersOpen ? 'flex' : 'hidden')}>
        <PeriodFilter {...periodState} />
        <select aria-label="Akun" className={SELECT} value={accountId ?? ''} onChange={(e) => setParam('account', e.target.value)}>
          <option value="">Semua akun</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.nama}
              {a.aktif ? '' : ' (nonaktif)'}
            </option>
          ))}
        </select>
        <select aria-label="Jenis aksi" className={SELECT} value={group ?? ''} onChange={(e) => setParam('group', e.target.value)}>
          <option value="">Semua aksi</option>
          {ACTION_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <div className="hidden grid-cols-[150px_160px_minmax(0,1fr)] gap-4 px-4 py-3 text-sm text-muted-foreground lg:grid">
          <span>Waktu</span>
          <span>Akun</span>
          <span>Perubahan · {periodLabel(period)}</span>
        </div>
        <p className="px-4 py-3 text-sm text-muted-foreground lg:hidden">{periodLabel(period)}</p>
        {needsInternet && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Butuh internet untuk menampilkan riwayat.</p>}
        {!needsInternet && log.isPending && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Memuat riwayat…</p>}
        {!needsInternet && log.isError && (
          <p className="border-t border-rule px-4 py-3 text-muted-foreground">
            Riwayat tidak bisa dimuat.{' '}
            <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void log.refetch()}>
              Coba lagi
            </button>
          </p>
        )}
        {log.isSuccess && entries.length === 0 && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Tidak ada perubahan dengan filter ini.</p>}
        <ul>
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} categories={categoryNames} />
          ))}
        </ul>
      </div>
      {log.hasNextPage && (
        <Button variant="outline" className="mt-4" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
          {log.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
        </Button>
      )}
      {log.isFetchNextPageError && (
        <Notice tone="error" className="mt-4">
          Catatan berikutnya tidak bisa dimuat. Periksa internet lalu tekan Muat lagi.
        </Notice>
      )}
    </>
  )
}

function EntryRow({ entry: e, categories }: { entry: ChangeEntry; categories: Map<string, string> }) {
  const details = describeChanges(e, categories)
  return (
    <li className="grid gap-x-4 border-t border-rule px-4 py-3 lg:grid-cols-[150px_160px_minmax(0,1fr)]">
      <span className="order-2 text-sm text-muted-foreground lg:order-none lg:text-[15px] lg:text-foreground">
        {formatDateTime(e.createdAt)}
        <span className="lg:hidden"> · {e.account ?? '–'}</span>
      </span>
      <span className="hidden truncate lg:block">{e.account ?? <span className="text-muted-foreground">–</span>}</span>
      <div className="order-1 min-w-0 lg:order-none">
        <p>
          <span className="font-medium">{actionLabel(e.action)}</span>
          {e.object && <span className="text-muted-foreground"> · {e.object}</span>}
        </p>
        {details.length > 0 && (
          <ul className="mt-0.5 text-sm text-muted-foreground">
            {details.map((d, i) => (
              <li key={i} className="break-words">
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
