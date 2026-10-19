import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { exportExcel, exportPdf, type ExportData } from '@/lib/export'
import { formatNumber, formatQty, formatRupiah, formatDateTime, parseRupiah } from '@/lib/format'
import { useSettings } from '@/lib/settings'
import { PRODUCT_LIST_KEY } from '@/products/data'
import { fullName } from '@/products/product'
import { REASON_LABELS, type Reason } from '@/stock/stock'
import { saveReason, savePurchasePrice, saveDecision, confirmStocktake, reviewKey, useStocktakeReview, type StocktakeSession } from '@/stocktake/data'
import { SessionHeader } from '@/stocktake/StocktakePage'
import { isReasonComplete, canConfirm, sessionScope, DECISION_LABELS, SESSION_STATUS_LABELS, summarizeStocktake, type StocktakeLine, type StocktakeSummary } from '@/stocktake/stocktake'

const signedRupiah = (n: number) => (n > 0 ? `+${formatRupiah(n)}` : formatRupiah(n))
const signedQty = (n: number) => (n > 0 ? `+${formatQty(n)}` : formatQty(n))

function SummaryCards({ r }: { r: StocktakeSummary }) {
  const cards = [
    { label: 'Dihitung', value: `${r.dihitung} dari ${r.total}`, sub: null, invalid: false },
    { label: 'Belum dihitung', value: String(r.undecided), sub: r.assumedZero + r.dilewati ? `${r.assumedZero} dianggap 0 · ${r.dilewati} dilewati` : null, invalid: r.undecided > 0 },
    { label: 'Selisih lebih', value: `${r.overCount} part`, sub: signedRupiah(r.overValue), invalid: false },
    { label: 'Selisih kurang', value: `${r.shortCount} part`, sub: signedRupiah(r.shortValue), invalid: false },
  ]
  return (
    <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map((k) => (
        <div key={k.label} className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">{k.label}</p>
          <p className={cn('text-lg font-semibold', k.invalid && 'text-negative')}>{k.value}</p>
          {k.sub && <p className="text-sm text-muted-foreground">{k.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function RowCheckbox({ label, selected, update, partial = false }: { label: string; selected: boolean; update: (v: boolean) => void; partial?: boolean }) {
  return (
    <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        className="size-[18px] accent-foreground"
        checked={selected}
        ref={(el) => {
          if (el) el.indeterminate = partial
        }}
        onChange={(e) => update(e.target.checked)}
      />
    </label>
  )
}

function useSet() {
  const [ids, setIds] = useState<Set<string>>(() => new Set())
  return {
    ids: ids,
    has: (id: string) => ids.has(id),
    set: (id: string, v: boolean) =>
      setIds((s) => {
        const next = new Set(s)
        if (v) next.add(id)
        else next.delete(id)
        return next
      }),
    all: (ids: string[], v: boolean) => setIds(v ? new Set(ids) : new Set()),
    clear: () => setIds(new Set()),
  }
}

/**
 * Tinjau (PRD 4.5): part yang belum dihitung diputuskan dianggap 0 atau dilewati, selisih diberi alasan
 * (bisa sekaligus untuk baris terpilih), selisih lebih tanpa harga rata-rata diberi harga beli.
 */
export function ReviewTab({ session, canEdit }: { session: StocktakeSession; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const review = useStocktakeReview(session.id, session.status)
  const lines = useMemo(() => review.data ?? [], [review.data])
  const r = summarizeStocktake(lines)
  const uncounted = lines.filter((b) => b.decision !== 'dihitung')
  const variance = lines.filter((b) => b.variance !== null && b.variance !== 0)
  const uncountedSelection = useSet()
  const varianceSelection = useSet()
  const [dialog, setDialog] = useState<'reason' | 'confirm' | null>(null)
  const needsPriceColumn = variance.some((b) => b.needsPurchasePrice)
  const reload = () => queryClient.invalidateQueries({ queryKey: reviewKey(session.id) })

  const decision = useMutation({
    mutationFn: (k: 'dianggap_nol' | 'dilewati') => saveDecision(session.id, [...uncountedSelection.ids], k),
    onSuccess: async () => {
      uncountedSelection.clear()
      await reload()
    },
  })

  if (review.isPending) return <p className="mt-6 text-muted-foreground">Memuat tinjauan…</p>
  if (review.isError) return null

  const uncountedIds = uncounted.map((b) => b.productId)
  const varianceIds = variance.map((b) => b.productId)
  const missing = [
    r.undecided > 0 && `${r.undecided} part belum dihitung: pilih dianggap 0 atau dilewati.`,
    r.incomplete > 0 && `${r.incomplete} selisih belum diberi alasan atau harga beli.`,
  ].filter(Boolean)

  return (
    <>
      <SummaryCards r={r} />

      {uncounted.length > 0 && (
        <section aria-labelledby="uncounted-title" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="uncounted-title" className="text-lg font-semibold">
                Belum dihitung
              </h2>
              <p className="text-muted-foreground">Dianggap 0: stok dijadikan 0 saat konfirmasi. Dilewati: stok tidak diubah.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!canEdit || !uncountedSelection.ids.size || decision.isPending} onClick={() => decision.mutate('dianggap_nol')}>
                Anggap 0{uncountedSelection.ids.size ? ` (${uncountedSelection.ids.size})` : ''}
              </Button>
              <Button variant="outline" disabled={!canEdit || !uncountedSelection.ids.size || decision.isPending} onClick={() => decision.mutate('dilewati')}>
                Lewati{uncountedSelection.ids.size ? ` (${uncountedSelection.ids.size})` : ''}
              </Button>
            </div>
          </div>
          {decision.isError && (
            <Notice tone="error" className="mt-3">
              {decision.error.message}
            </Notice>
          )}
          <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-left">
              <thead>
                <tr className="h-11 text-sm text-muted-foreground">
                  <th className="w-12 pl-1">
                    <RowCheckbox
                      label="Pilih semua part yang belum dihitung"
                      selected={uncountedSelection.ids.size > 0 && uncountedSelection.ids.size === uncountedIds.length}
                      partial={uncountedSelection.ids.size > 0 && uncountedSelection.ids.size < uncountedIds.length}
                      update={(v) => uncountedSelection.all(uncountedIds, v)}
                    />
                  </th>
                  <th className="px-3 font-normal">{uncounted.length} part</th>
                  <th className="w-[200px] px-4 font-normal">Kategori</th>
                  <th className="w-[140px] px-4 text-right font-normal">Stok sistem</th>
                  <th className="w-[150px] px-4 font-normal">Keputusan</th>
                </tr>
              </thead>
              <tbody>
                {uncounted.map((b) => (
                  <tr key={b.productId} className="h-12 border-t border-rule">
                    <td className="pl-1">
                      <RowCheckbox label={`Pilih ${b.name}`} selected={uncountedSelection.has(b.productId)} update={(v) => uncountedSelection.set(b.productId, v)} />
                    </td>
                    <td className="max-w-0 truncate px-3">{fullName(b)}</td>
                    <td className="truncate px-4 text-muted-foreground">{b.category}</td>
                    <td className="px-4 text-right">
                      {formatQty(b.currentStock)} <span className="text-sm text-muted-foreground">{b.unit}</span>
                    </td>
                    <td className="px-4">
                      {b.decision ? DECISION_LABELS[b.decision] : <span className="text-negative">Belum diputuskan</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="variance-title" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="variance-title" className="text-lg font-semibold">
              Selisih
            </h2>
            <p className="text-muted-foreground">
              Selisih = qty hitung − stok sistem saat part itu terakhir dihitung. {r.matched} part cocok tidak ditampilkan.
            </p>
          </div>
          <Button variant="outline" disabled={!canEdit || !varianceSelection.ids.size} onClick={() => setDialog('reason')}>
            Isi alasan{varianceSelection.ids.size ? ` (${varianceSelection.ids.size})` : ''}
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="h-11 text-sm text-muted-foreground">
                <th className="w-12 pl-1">
                  <RowCheckbox
                    label="Pilih semua part yang berselisih"
                    selected={varianceSelection.ids.size > 0 && varianceSelection.ids.size === varianceIds.length}
                    partial={varianceSelection.ids.size > 0 && varianceSelection.ids.size < varianceIds.length}
                    update={(v) => varianceSelection.all(varianceIds, v)}
                  />
                </th>
                <th className="px-3 font-normal">{variance.length} part</th>
                <th className="w-[100px] px-3 text-right font-normal">Stok saat hitung</th>
                <th className="w-[90px] px-3 text-right font-normal">Hitung</th>
                <th className="w-[90px] px-3 text-right font-normal">Selisih</th>
                <th className="w-[130px] px-3 text-right font-normal">Rupiah</th>
                <th className="w-[200px] px-3 font-normal">Alasan</th>
                {needsPriceColumn && <th className="w-[150px] px-3 text-right font-normal">Harga beli</th>}
              </tr>
            </thead>
            <tbody>
              {variance.length === 0 && (
                <tr className="border-t border-rule">
                  <td colSpan={needsPriceColumn ? 8 : 7} className="px-4 py-3 text-muted-foreground">
                    Tidak ada selisih.
                  </td>
                </tr>
              )}
              {variance.map((b) => {
                const complete = isReasonComplete(b)
                return (
                  <tr key={b.productId} className={cn('h-12 border-t border-rule', !complete && 'bg-pill-warning/40')}>
                    <td className="pl-1">
                      <RowCheckbox label={`Pilih ${b.name}`} selected={varianceSelection.has(b.productId)} update={(v) => varianceSelection.set(b.productId, v)} />
                    </td>
                    <td className="max-w-0 px-3">
                      <span className="block truncate">{fullName(b)}</span>
                      <span className="block text-sm text-muted-foreground">
                        {b.category}
                        {b.decision === 'dianggap_nol' && ' · dianggap 0'}
                      </span>
                    </td>
                    <td className="px-3 text-right text-muted-foreground">{formatQty(b.decision === 'dianggap_nol' ? b.currentStock : (b.stockAtCount ?? 0))}</td>
                    <td className="px-3 text-right">{formatQty(b.countedQty ?? 0)}</td>
                    <td className={cn('px-3 text-right font-medium', (b.variance ?? 0) < 0 ? 'text-negative' : 'text-positive')}>{signedQty(b.variance ?? 0)}</td>
                    <td className="px-3 text-right">{b.needsPurchasePrice && b.purchasePriceInput === null ? '–' : signedRupiah(b.varianceValue ?? 0)}</td>
                    <td className="max-w-0 truncate px-3">
                      {b.reason ? (
                        <span title={b.reasonNote ?? undefined}>
                          {REASON_LABELS[b.reason]}
                          {b.reasonNote && <span className="text-muted-foreground"> · {b.reasonNote}</span>}
                        </span>
                      ) : (
                        <span className="text-negative">Belum diisi</span>
                      )}
                    </td>
                    {needsPriceColumn && (
                      <td className="px-3 py-1.5">
                        {b.needsPurchasePrice && <PurchasePriceInput key={`${b.productId}-${b.purchasePriceInput}`} session={session} lines={b} canEdit={canEdit} />}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-8 mt-6 flex flex-wrap items-center justify-end gap-4 border-t border-border bg-background px-8 py-4">
        <span className={cn('mr-auto text-sm', missing.length ? 'text-negative' : 'text-muted-foreground')}>
          {missing.length ? missing.join(' ') : 'Siap dikonfirmasi.'}
        </span>
        <Button variant="outline" disabled={review.isFetching} onClick={() => void reload()}>
          {review.isFetching ? 'Memuat…' : 'Muat ulang'}
        </Button>
        <Button disabled={!canEdit || !canConfirm(r)} onClick={() => setDialog('confirm')}>
          Konfirmasi opname
        </Button>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === 'reason' && (
            <ReasonDialog
              session={session}
              ids={[...varianceSelection.ids]}
              onDone={() => {
                varianceSelection.clear()
                setDialog(null)
              }}
              close={() => setDialog(null)}
            />
          )}
          {dialog === 'confirm' && <ConfirmDialog session={session} r={r} close={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Harga beli untuk selisih lebih pada part tanpa harga rata-rata; disimpan saat pindah kolom (PRD 4.5). */
function PurchasePriceInput({ session, lines, canEdit }: { session: StocktakeSession; lines: StocktakeLine; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(lines.purchasePriceInput === null ? '' : formatNumber(lines.purchasePriceInput))
  const save = useMutation({
    mutationFn: (price: number) => savePurchasePrice(session.id, lines.productId, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewKey(session.id) }),
  })
  const price = parseRupiah(value)
  const invalid = value.trim() !== '' && (price === null || price <= 0)
  return (
    <Input
      aria-label={`Harga beli ${lines.name}`}
      inputMode="numeric"
      placeholder="Wajib"
      title={save.error?.message ?? (invalid ? 'Isi harga beli lebih dari Rp 0' : undefined)}
      className={cn('h-10 text-right', (invalid || save.isError) && 'border-negative')}
      disabled={!canEdit || save.isPending}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (price !== null && price > 0 && price !== lines.purchasePriceInput) {
          setValue(formatNumber(price))
          save.mutate(price)
        }
      }}
    />
  )
}

/** Alasan selisih sekaligus untuk baris terpilih; Lainnya wajib keterangan (R8). */
function ReasonDialog({ session, ids, onDone, close }: { session: StocktakeSession; ids: string[]; onDone: () => void; close: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState<Reason | ''>('')
  const [note, setNote] = useState('')
  const complete = reason !== '' && (reason !== 'lainnya' || note.trim() !== '')
  const save = useMutation({
    mutationFn: () => saveReason(session.id, ids, reason as Reason, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reviewKey(session.id) })
      onDone()
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
        <DialogTitle>Alasan selisih</DialogTitle>
        <DialogDescription>Untuk {ids.length} part terpilih. Alasan yang sudah ada di part ini diganti.</DialogDescription>
      </DialogHeader>
      <Field id="stocktake-reason" label="Alasan">
        <select
          id="stocktake-reason"
          autoFocus
          className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason | '')}
        >
          <option value="">Pilih alasan</option>
          {(Object.keys(REASON_LABELS) as Reason[]).map((a) => (
            <option key={a} value={a}>
              {REASON_LABELS[a]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="stocktake-note" label={reason === 'lainnya' ? 'Keterangan (wajib)' : 'Keterangan'}>
        <Input id="stocktake-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!complete || save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan alasan'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Konfirmasi membuat mutasi opname sebesar selisih, ditambahkan ke stok saat itu. Tidak bisa dibatalkan. */
function ConfirmDialog({ session, r, close }: { session: StocktakeSession; r: StocktakeSummary; close: () => void }) {
  const queryClient = useQueryClient()
  const confirm = useMutation({
    mutationFn: () => confirmStocktake(session.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stocktake'] }),
        queryClient.invalidateQueries({ queryKey: PRODUCT_LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ])
      close()
    },
  })
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Konfirmasi {session.number}?</DialogTitle>
        <DialogDescription>
          Stok {r.overCount + r.shortCount} part disesuaikan sebesar selisihnya. Sesi yang sudah dikonfirmasi tidak bisa dibatalkan; kesalahan diperbaiki lewat
          penyesuaian stok atau opname berikutnya.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1">
        <dt className="text-muted-foreground">Selisih lebih</dt>
        <dd className="text-right">
          {r.overCount} part · {signedRupiah(r.overValue)}
        </dd>
        <dt className="text-muted-foreground">Selisih kurang</dt>
        <dd className="text-right">
          {r.shortCount} part · {signedRupiah(r.shortValue)}
        </dd>
        <dt className="text-muted-foreground">Dilewati, stok tidak diubah</dt>
        <dd className="text-right">{r.dilewati} part</dd>
      </dl>
      {r.assumedZero > 0 && <p className="text-sm text-muted-foreground">Part yang dianggap 0 dibandingkan dengan stok saat konfirmasi.</p>}
      {confirm.isError && <Notice tone="error">{confirm.error.message}</Notice>}
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Kembali
        </Button>
        <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          {confirm.isPending ? 'Mengonfirmasi…' : 'Konfirmasi opname'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// Hasil sesi yang sudah ditutup -------------------------------------------------------

function exportData(session: StocktakeSession, lines: StocktakeLine[], workshopName: string | undefined): ExportData<StocktakeLine> {
  const total = lines.reduce((s, b) => s + (b.varianceValue ?? 0), 0)
  return {
    fileName: `opname-${session.number}`,
    title: `Hasil opname ${session.number}`,
    note: [
      [workshopName, sessionScope(session), SESSION_STATUS_LABELS[session.status]].filter(Boolean).join(' · '),
      `Dibuka ${formatDateTime(session.openedAt)} oleh ${session.openedBy}${session.closedAt ? ` · ${SESSION_STATUS_LABELS[session.status].toLowerCase()} ${formatDateTime(session.closedAt)} oleh ${session.closedBy ?? '-'}` : ''}`,
    ],
    columns: [
      { title: 'Kategori', value: (b) => b.category, width: 16 },
      { title: 'Part', value: (b) => b.name, width: 32 },
      { title: 'Merek', value: (b) => b.brand ?? '', width: 14 },
      { title: 'Satuan', value: (b) => b.unit ?? '', width: 8 },
      { title: 'Keputusan', value: (b) => (b.decision ? DECISION_LABELS[b.decision] : ''), width: 11 },
      { title: 'Stok saat hitung', value: (b) => b.stockAtCount, kind: 'qty', width: 10 },
      { title: 'Qty hitung', value: (b) => b.countedQty, kind: 'qty', width: 10 },
      { title: 'Selisih', value: (b) => b.variance, kind: 'qty', width: 9 },
      { title: 'Selisih (Rp)', value: (b) => b.varianceValue, kind: 'rupiah', width: 13 },
      { title: 'Alasan', value: (b) => (b.reason ? REASON_LABELS[b.reason] : ''), width: 12 },
      { title: 'Keterangan', value: (b) => b.reasonNote ?? '', width: 24 },
    ],
    rows: lines,
    total: session.status === 'dikonfirmasi' ? ['Total', null, null, null, null, null, null, null, total, null, null] : undefined,
  }
}

/** Sesi dikonfirmasi atau dibatalkan: hasil hitungan tetap bisa dilihat dan diekspor (PRD 4.5). */
export function ClosedSession({ session }: { session: StocktakeSession }) {
  const review = useStocktakeReview(session.id, session.status)
  const settings = useSettings()
  const lines = useMemo(() => review.data ?? [], [review.data])
  const r = summarizeStocktake(lines)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const data = () => exportData(session, lines, settings.data?.nama_bengkel)
  const failed = (e: unknown) => setErrorMessage(e instanceof Error ? e.message : String(e))
  const dikonfirmasi = session.status === 'dikonfirmasi'

  return (
    <>
      <SessionHeader session={session}>
        <Button variant="outline" disabled={!lines.length} onClick={() => void exportPdf(data(), 'landscape').catch(failed)}>
          Ekspor PDF
        </Button>
        <Button variant="outline" disabled={!lines.length} onClick={() => void exportExcel(data()).catch(failed)}>
          Ekspor Excel
        </Button>
      </SessionHeader>
      <Notice className="mt-4">
        {dikonfirmasi
          ? `Dikonfirmasi ${session.closedAt ? formatDateTime(session.closedAt) : ''} oleh ${session.closedBy ?? '-'}. Stok ${r.overCount + r.shortCount} part sudah disesuaikan.`
          : `Dibatalkan ${session.closedAt ? formatDateTime(session.closedAt) : ''} oleh ${session.closedBy ?? '-'}. Stok tidak berubah; hasil hitungan disimpan sebagai catatan.`}
      </Notice>
      {errorMessage && (
        <Notice tone="error" className="mt-4">
          {errorMessage}
        </Notice>
      )}
      {review.isError && (
        <Notice tone="error" className="mt-4">
          {review.error.message}
        </Notice>
      )}
      {dikonfirmasi && review.isSuccess && <SummaryCards r={r} />}

      <div className="mt-6 overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">{review.isSuccess ? `${lines.length} part` : 'Part'}</th>
              <th className="w-[120px] px-3 font-normal">Keputusan</th>
              <th className="w-[100px] px-3 text-right font-normal">Stok saat hitung</th>
              <th className="w-[90px] px-3 text-right font-normal">Hitung</th>
              {dikonfirmasi && <th className="w-[90px] px-3 text-right font-normal">Selisih</th>}
              {dikonfirmasi && <th className="w-[130px] px-3 text-right font-normal">Rupiah</th>}
              {dikonfirmasi && <th className="w-[200px] px-3 font-normal">Alasan</th>}
            </tr>
          </thead>
          <tbody>
            {review.isPending && (
              <tr className="border-t border-rule">
                <td colSpan={7} className="px-4 py-3 text-muted-foreground">
                  Memuat hasil…
                </td>
              </tr>
            )}
            {review.isSuccess && lines.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={7} className="px-4 py-3 text-muted-foreground">
                  Tidak ada part yang dihitung di sesi ini.
                </td>
              </tr>
            )}
            {lines.map((b) => (
              <tr key={b.productId} className="h-12 border-t border-rule">
                <td className="max-w-0 px-4">
                  <span className="block truncate">{fullName(b)}</span>
                  <span className="block text-sm text-muted-foreground">{b.category}</span>
                </td>
                <td className="px-3 text-muted-foreground">{b.decision ? DECISION_LABELS[b.decision] : '–'}</td>
                <td className="px-3 text-right text-muted-foreground">{b.stockAtCount === null ? '–' : formatQty(b.stockAtCount)}</td>
                <td className="px-3 text-right">{b.countedQty === null ? '–' : formatQty(b.countedQty)}</td>
                {dikonfirmasi && (
                  <td className={cn('px-3 text-right font-medium', (b.variance ?? 0) < 0 && 'text-negative', (b.variance ?? 0) > 0 && 'text-positive')}>
                    {b.variance === null ? '–' : signedQty(b.variance)}
                  </td>
                )}
                {dikonfirmasi && <td className="px-3 text-right">{b.varianceValue === null || b.variance === 0 ? '–' : signedRupiah(b.varianceValue)}</td>}
                {dikonfirmasi && (
                  <td className="max-w-0 truncate px-3">
                    {b.reason ? REASON_LABELS[b.reason] : '–'}
                    {b.reasonNote && <span className="text-muted-foreground"> · {b.reasonNote}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
