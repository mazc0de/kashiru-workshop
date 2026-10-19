import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useMasterData } from '@/settings/masterData'
import { openStocktake, useStocktakeList, type StocktakeSession } from '@/stocktake/data'
import { sessionScope, SESSION_STATUS_LABELS, type StocktakeStatus } from '@/stocktake/stocktake'

export function SessionStatusPill({ status }: { status: StocktakeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-none items-center rounded-sm px-2 text-sm whitespace-nowrap',
        status === 'dibuka' && 'bg-pill-warning text-pill-warning-ink',
        status === 'dikonfirmasi' && 'bg-pill-positive text-pill-positive-ink',
        status === 'dibatalkan' && 'bg-muted text-muted-foreground',
      )}
    >
      {SESSION_STATUS_LABELS[status]}
    </span>
  )
}

/** Nomor sesi, status, cakupan, dan siapa yang membuka, dengan tombol aksi di kanan. */
export function SessionHeader({ session, children }: { session: StocktakeSession; children?: ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="font-mono">{session.number}</span>
          <SessionStatusPill status={session.status} />
        </h1>
        <p className="mt-1 text-muted-foreground">
          {sessionScope(session)} · dibuka {formatDateTime(session.openedAt)} oleh {session.openedBy}
        </p>
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  )
}

/** Opname (PRD 4.5): daftar sesi. Hanya satu sesi yang boleh terbuka. */
export function StocktakePage() {
  const online = useOnline()
  const location = useLocation()
  const list = useStocktakeList()
  const [open, setOpen] = useState(false)
  const openSession = list.data?.find((s) => s.status === 'dibuka')
  const message = (location.state as { message?: string } | null)?.message

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Opname</h1>
          <p className="mt-1 max-w-[720px] text-muted-foreground">
            Hitung stok fisik per sesi: hitung, tinjau, lalu konfirmasi. Stok sistem baru berubah setelah sesi dikonfirmasi. Penjualan dan penerimaan tetap boleh selama sesi terbuka.
          </p>
        </div>
        {list.isSuccess && !openSession && (
          <Button disabled={!online} onClick={() => setOpen(true)}>
            Buka sesi opname
          </Button>
        )}
      </div>
      {message && <Notice className="mt-4">{message}</Notice>}
      {!online && (
        <Notice tone="warning" className="mt-4">
          Opname wajib online.
        </Notice>
      )}
      {list.isError && (
        <Notice tone="error" className="mt-4">
          {list.error.message}
        </Notice>
      )}

      {openSession && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-foreground bg-card px-5 py-4">
          <div>
            <p className="flex items-center gap-2">
              <span className="font-mono">{openSession.number}</span>
              <SessionStatusPill status="dibuka" />
            </p>
            <p className="mt-1 text-muted-foreground">
              {sessionScope(openSession)} · dibuka {formatDateTime(openSession.openedAt)} oleh {openSession.openedBy}
            </p>
          </div>
          <Button render={<Link to={`/stocktake/${openSession.id}`} />} nativeButton={false}>
            Lanjutkan sesi
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">Sesi</th>
              <th className="px-4 font-normal">Cakupan</th>
              <th className="w-[140px] px-4 font-normal">Status</th>
              <th className="px-4 font-normal">Selesai</th>
            </tr>
          </thead>
          <tbody>
            {list.isPending && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">Memuat sesi opname…</td>
              </tr>
            )}
            {list.isSuccess && list.data.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">Belum ada sesi opname.</td>
              </tr>
            )}
            {list.data?.map((s) => (
              <tr key={s.id} className="h-14 border-t border-rule hover:bg-muted/40">
                <td className="px-4">
                  <Link to={`/stocktake/${s.id}`} className="block font-mono text-sm">
                    {s.number}
                  </Link>
                  <span className="block text-sm text-muted-foreground">
                    {formatDateTime(s.openedAt)} · {s.openedBy}
                  </span>
                </td>
                <td className="px-4">{sessionScope(s)}</td>
                <td className="px-4">
                  <SessionStatusPill status={s.status} />
                </td>
                <td className="px-4 text-muted-foreground">{s.closedAt ? `${formatDateTime(s.closedAt)} · ${s.closedBy ?? '-'}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <OpenSessionDialog close={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

/** Sesi penuh (semua part aktif) atau per kategori. Kategori nonaktif tidak bisa dipilih. */
function OpenSessionDialog({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const category = useMasterData('category')
  const [kind, setKind] = useState<'penuh' | 'kategori'>('penuh')
  const [categoryId, setCategoryId] = useState('')
  const active = (category.data ?? []).filter((k) => k.active)
  const complete = kind === 'penuh' || categoryId !== ''

  const save = useMutation({
    mutationFn: () => openStocktake(kind, kind === 'kategori' ? categoryId : null),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['stocktake'] })
      navigate(`/stocktake/${result.id}`)
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (complete) save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>Buka sesi opname</DialogTitle>
        <DialogDescription>Part yang dibuat selama sesi terbuka ikut masuk cakupan kalau kategorinya sesuai.</DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label="Jenis sesi" className="inline-flex h-11 w-fit rounded-md border border-input bg-card p-1">
        {(
          [
            ['penuh', 'Penuh'],
            ['kategori', 'Per kategori'],
          ] as const
        ).map(([j, label]) => (
          <button
            key={j}
            type="button"
            role="radio"
            aria-checked={kind === j}
            onClick={() => setKind(j)}
            className={cn('rounded-sm px-4 text-[15px] text-muted-foreground', kind === j && 'bg-active text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === 'kategori' ? (
        <Field id="stocktake-category" label="Kategori">
          <select
            id="stocktake-category"
            className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Pilih kategori</option>
            {active.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-muted-foreground">Semua part aktif di semua kategori.</p>
      )}
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!complete || save.isPending}>
          {save.isPending ? 'Membuka…' : 'Buka sesi'}
        </Button>
      </DialogFooter>
    </form>
  )
}
