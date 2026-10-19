import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatNumber, formatQty, formatRupiah, formatDate, formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useReceivingList, useReceivingDetail, voidReceiving, type ReceivingDetail } from '@/receiving/data'

/** Penerimaan barang (PRD 4.4): daftar, detail, dan void. */
export function ReceivingPage() {
  const online = useOnline()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [dibuka, setOpenId] = useState<string | null>(null)
  const list = useReceivingList(query)
  const message = (location.state as { message?: string } | null)?.message

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Penerimaan</h1>
          <p className="mt-1 text-muted-foreground">Barang masuk. Satu-satunya jalan stok masuk selain stok awal dan penyesuaian.</p>
        </div>
        <Button render={<Link to="/receiving/new" />} nativeButton={false} disabled={!online}>
          Penerimaan baru
        </Button>
      </div>
      {message && <Notice className="mt-4">{message}</Notice>}
      {!online && (
        <Notice tone="warning" className="mt-4">
          Penerimaan hanya bisa dibuat saat online.
        </Notice>
      )}

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Cari penerimaan" placeholder="Nomor penerimaan" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">Penerimaan</th>
              <th className="w-[140px] px-4 text-right font-normal">Tanggal masuk</th>
              <th className="w-[80px] px-4 text-right font-normal">Baris</th>
              <th className="w-[150px] px-4 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.isPending && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">Memuat penerimaan…</td>
              </tr>
            )}
            {list.isSuccess && list.data.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">{query.trim() ? 'Tidak ada penerimaan yang cocok.' : 'Belum ada penerimaan.'}</td>
              </tr>
            )}
            {list.data?.map((r) => (
              <tr key={r.id} className="h-14 cursor-pointer border-t border-rule hover:bg-muted/40" onClick={() => setOpenId(r.id)}>
                <td className="px-4">
                  <button type="button" className={cn('block font-mono text-sm', r.status === 'void' && 'text-muted-foreground line-through')} onClick={() => setOpenId(r.id)}>
                    {r.number}
                  </button>
                  <span className="block text-sm text-muted-foreground">
                    {formatDateTime(r.createdAt)} · {r.account}
                  </span>
                </td>
                <td className="px-4 text-right text-muted-foreground">{formatDate(`${r.receivedDate}T12:00:00+07:00`)}</td>
                <td className="px-4 text-right text-muted-foreground">{r.lineCount}</td>
                <td className="px-4 text-right">
                  {r.status === 'void' ? (
                    <span className="inline-flex h-6 items-center rounded-sm bg-pill-negative px-2 text-sm text-pill-negative-ink">Void</span>
                  ) : (
                    formatNumber(r.total)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dibuka !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="sm:max-w-xl">{dibuka && <DetailDialog id={dibuka} close={() => setOpenId(null)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function DetailDialog({ id, close }: { id: string; close: () => void }) {
  const detail = useReceivingDetail(id)
  const [voiding, setVoiding] = useState(false)
  if (detail.isPending) return <DialogTitle>Memuat penerimaan…</DialogTitle>
  if (detail.isError) {
    return (
      <>
        <DialogTitle>Penerimaan tidak bisa dimuat</DialogTitle>
        <Notice tone="error">{detail.error.message}</Notice>
      </>
    )
  }
  const r = detail.data
  if (voiding) return <FormVoid receiving={r} onDone={() => setVoiding(false)} />
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="font-mono">{r.number}</DialogTitle>
        <DialogDescription>
          {r.status === 'void'
            ? `Void ${r.voidedAt ? formatDateTime(r.voidedAt) : ''} oleh ${r.voidedBy ?? '-'}: ${r.voidReason ?? ''}`
            : `Disimpan ${formatDateTime(r.createdAt)} oleh ${r.account}`}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1">
        <dt className="text-muted-foreground">Tanggal masuk</dt>
        <dd>{formatDate(`${r.receivedDate}T12:00:00+07:00`)}</dd>
      </dl>
      <ul className="border-y border-rule py-2">
        {r.lines.map((b, i) => (
          <li key={i} className="flex justify-between gap-3 py-1">
            <span className="min-w-0">
              <span className="block truncate">{b.brand ? `${b.name} · ${b.brand}` : b.name}</span>
              <span className="block text-sm text-muted-foreground">
                {formatQty(b.qty)} {b.unit} x {formatNumber(b.purchasePrice)}
                {b.purchasePrice === 0 && ' · bonus'}
              </span>
            </span>
            <span className="flex-none">{formatNumber(Math.round(b.qty * b.purchasePrice))}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-lg">
        <span>Total</span>
        <span className="font-bold">{formatRupiah(r.total)}</span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Tutup
        </Button>
        {r.status === 'aktif' && (
          <Button variant="destructive" onClick={() => setVoiding(true)}>
            Void penerimaan
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

/** Void seluruh penerimaan: alasan wajib; stok boleh jadi minus; HPP nota lama tidak berubah (PRD 4.4). */
function FormVoid({ receiving, onDone }: { receiving: ReceivingDetail; onDone: () => void }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => voidReceiving(receiving.id, reason.trim()),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['receiving'] }), queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['stock'] })])
      onDone()
    },
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason.trim()) save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>Void {receiving.number}?</DialogTitle>
        <DialogDescription>
          Seluruh penerimaan dibatalkan dan stok part dikurangi lagi, boleh sampai minus. Harga beli rata-rata dihitung ulang seolah penerimaan ini tidak pernah ada. HPP nota yang sudah dibuat tidak berubah. Setelah itu input ulang penerimaan yang benar.
        </DialogDescription>
      </DialogHeader>
      <Field id="void-receiving-reason" label="Alasan void">
        <Input id="void-receiving-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {!online && <Notice tone="warning">Void hanya bisa dilakukan saat online.</Notice>}
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" variant="destructive" disabled={!online || !reason.trim() || save.isPending}>
          {save.isPending ? 'Memproses…' : 'Void penerimaan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
