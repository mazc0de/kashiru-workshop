import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { exportPdf } from '@/lib/export'
import { formatQty, formatDate, formatDateTime, parseQty } from '@/lib/format'
import { db } from '@/lib/localCopy'
import { useOnline } from '@/lib/online'
import { printText } from '@/lib/printText'
import { useBarcodeScanner } from '@/lib/scanner'
import { useSettings } from '@/lib/settings'
import { playSuccess, playError } from '@/lib/sound'
import { useUnsentSaleCount } from '@/pos/outbox'
import { findByBarcode, fullName, type LocalProduct } from '@/products/product'
import { SearchBox } from '@/products/ProductSearchBox'
import { NewBarcodeDialog } from '@/products/UnknownBarcodeDialog'
import { cancelStocktake, recordCount, reviewKey, useStocktakeSession, useStocktakeReview, type StocktakeSession } from '@/stocktake/data'
import { ClosedSession, ReviewTab } from '@/stocktake/StocktakeReview'
import { SessionHeader } from '@/stocktake/StocktakePage'
import { summarizeStocktake, buildCountSheet, type StocktakeLine } from '@/stocktake/stocktake'

type Tab = 'count' | 'sheet' | 'review'
type RecordCount = (productId: string, qty: number, add: boolean) => Promise<number>

/** Sesi opname (PRD 4.5): hitung, input lembar hitung, tinjau, konfirmasi atau batalkan. */
export function StocktakeSessionPage() {
  const { id = '' } = useParams()
  const session = useStocktakeSession(id)

  return (
    <>
      <Link to="/stocktake" className="inline-flex h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Opname
      </Link>
      {session.isPending && <h1 className="mt-1 text-2xl font-semibold tracking-tight">Memuat sesi…</h1>}
      {session.isError && (
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sesi tidak bisa dimuat</h1>
          <Notice tone="error" className="mt-4">
            {session.error.message}
          </Notice>
        </>
      )}
      {session.data && (session.data.status === 'dibuka' ? <OpenSession session={session.data} /> : <ClosedSession session={session.data} />)}
    </>
  )
}

/**
 * Hitungan dikirim satu per satu lewat antrean, jadi scan cepat tetap berurutan. Daftar tinjau di cache
 * ditambal langsung dan ditandai basi; selisihnya dimuat ulang saat tab Tinjau dibuka.
 */
function useCountRecorder(stocktakeId: string): RecordCount {
  const queryClient = useQueryClient()
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  return useCallback(
    (productId, qty, add) => {
      const job = queue.current.then(async () => {
        const count = await recordCount(stocktakeId, productId, qty, add)
        const key = reviewKey(stocktakeId, 'dibuka')
        const has = queryClient.getQueryData<StocktakeLine[]>(key)?.some((b) => b.productId === productId) ?? false
        queryClient.setQueryData<StocktakeLine[]>(key, (old) =>
          old?.map((b) => (b.productId === productId ? { ...b, decision: 'dihitung', countedQty: count, countedAt: new Date().toISOString() } : b)),
        )
        // Part baru yang belum ada di daftar (dibuat selama sesi terbuka) perlu dimuat ulang.
        await queryClient.invalidateQueries({ queryKey: reviewKey(stocktakeId), refetchType: has ? 'none' : 'active' })
        return count
      })
      queue.current = job.catch(() => undefined)
      return job
    },
    [stocktakeId, queryClient],
  )
}

function OpenSession({ session }: { session: StocktakeSession }) {
  const online = useOnline()
  const unsentCount = useUnsentSaleCount()
  const settings = useSettings()
  const review = useStocktakeReview(session.id, session.status)
  const record = useCountRecorder(session.id)
  const [param, setParam] = useSearchParams()
  const [dialog, setDialog] = useState<'sheet' | 'cancel' | null>(null)
  const tab: Tab = param.get('tab') === 'sheet' ? 'sheet' : param.get('tab') === 'review' ? 'review' : 'count'
  const blind = settings.data?.blind_count ?? true
  const canCount = online && unsentCount === 0
  const lines = useMemo(() => review.data ?? [], [review.data])
  const r = summarizeStocktake(lines)

  return (
    <>
      <SessionHeader session={session}>
        <Button variant="outline" disabled={!review.isSuccess} onClick={() => setDialog('sheet')}>
          Lembar hitung
        </Button>
        <Button variant="outline" disabled={!online} onClick={() => setDialog('cancel')}>
          Batalkan sesi
        </Button>
      </SessionHeader>

      {!online && (
        <Notice tone="warning" className="mt-4">
          Opname wajib online. Hitungan bisa dilanjutkan setelah koneksi kembali.
        </Notice>
      )}
      {online && unsentCount > 0 && (
        <Notice tone="warning" className="mt-4">
          Ada {unsentCount} nota belum terkirim. Selesaikan dulu sebelum menghitung.{' '}
          <Link to="/sales" className="underline underline-offset-2">
            Lihat nota
          </Link>
        </Notice>
      )}
      {review.isError && (
        <Notice tone="error" className="mt-4">
          {review.error.message}
        </Notice>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <div role="tablist" aria-label="Langkah opname" className="flex gap-6">
          {(
            [
              ['count', 'Hitung'],
              ['sheet', 'Input lembar hitung'],
              ['review', 'Tinjau dan konfirmasi'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setParam(t === 'count' ? {} : { tab: t }, { replace: true })}
              className={cn('-mb-px h-11 border-b-2 text-[15px]', tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
        {review.isSuccess && (
          <p className="pb-2.5 text-sm text-muted-foreground">
            {r.dihitung} dari {r.total} part dihitung
            {r.assumedZero + r.dilewati > 0 && `, ${r.assumedZero + r.dilewati} diputuskan`}
          </p>
        )}
      </div>

      {tab === 'count' && <CountTab session={session} lines={lines} canCount={canCount && dialog === null} blind={blind} record={record} />}
      {tab === 'sheet' && <SheetTab lines={lines} loading={review.isPending} canCount={canCount} blind={blind} record={record} />}
      {tab === 'review' && <ReviewTab session={session} canEdit={online} />}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === 'sheet' && <CountSheetDialog session={session} lines={lines} close={() => setDialog(null)} />}
          {dialog === 'cancel' && <CancelSessionDialog session={session} close={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Hitung -----------------------------------------------------------------------

/** Scan menambah 1; cari part lalu ketik qty untuk jumlah besar. Blind count menyembunyikan stok sistem. */
function CountTab({ session, lines, canCount, blind, record }: { session: StocktakeSession; lines: StocktakeLine[]; canCount: boolean; blind: boolean; record: RecordCount }) {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const scope = useMemo(
    () => products.filter((p) => p.type === 'part' && p.active && (session.kind === 'penuh' || p.categoryId === session.categoryId)),
    [products, session],
  )
  const lineById = useMemo(() => new Map(lines.map((b) => [b.productId, b])), [lines])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LocalProduct | null>(null)
  const [qty, setQty] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newBarcode, setNewBarcode] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const qtyInput = useRef<HTMLInputElement>(null)

  const send = async (p: LocalProduct, n: number, add: boolean) => {
    try {
      await record(p.id, n, add)
      setErrorMessage(null)
      playSuccess()
      return true
    } catch (e) {
      playError()
      setErrorMessage(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  useBarcodeScanner(
    (code) => {
      const p = findByBarcode(scope, code)
      if (p) {
        setSelected(p)
        setQty('')
        void send(p, 1, true)
        return
      }
      playError()
      const other = findByBarcode(products, code)
      if (other) setErrorMessage(`${fullName(other)} di luar cakupan sesi ini.`)
      else setNewBarcode(code)
    },
    canCount && newBarcode === null,
  )

  const qtyError = (() => {
    if (!qty.trim() || !selected) return null
    const n = parseQty(qty)
    if (n === null) return 'Isi angka 0 atau lebih'
    if (!selected.allowsFraction && !Number.isInteger(n)) return 'Qty harus bilangan bulat'
    return null
  })()

  const b = selected ? lineById.get(selected.id) : undefined
  const last = useMemo(
    () =>
      lines
        .filter((x) => x.decision === 'dihitung' && x.countedAt)
        .sort((x, y) => (y.countedAt ?? '').localeCompare(x.countedAt ?? ''))
        .slice(0, 12),
    [lines],
  )

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <SearchBox
          ref={searchInput}
          query={query}
          setQuery={setQuery}
          products={scope}
          onPick={(p) => {
            setSelected(p)
            setQuery('')
            setQty('')
            setErrorMessage(null)
            setTimeout(() => qtyInput.current?.focus())
          }}
          disabled={!canCount || newBarcode !== null}
          placeholder="Scan barcode part (+1), atau cari nama, merek, kode part lalu ketik qty"
        />
        {errorMessage && (
          <Notice tone="error" className="mt-3">
            {errorMessage}
          </Notice>
        )}

        <div className="mt-4 rounded-md border border-border bg-card p-5">
          {!selected ? (
            <p className="text-muted-foreground">Scan barcode part yang sedang dihitung. Setiap scan menambah qty 1. Untuk jumlah besar, cari part lalu ketik qty.</p>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const n = parseQty(qty)
                if (n === null || qtyError) return
                if (await send(selected, n, false)) {
                  setQty('')
                  searchInput.current?.focus()
                }
              }}
            >
              <div>
                <p className="text-lg font-medium">{fullName(selected)}</p>
                <p className="text-muted-foreground">
                  {selected.category} · {selected.unit}
                  {!blind && ` · stok sistem ${formatQty(selected.stock ?? 0)}`}
                </p>
              </div>
              <p>
                Hitungan sekarang{' '}
                <span className="text-2xl font-semibold">{b?.decision === 'dihitung' && b.countedQty !== null ? formatQty(b.countedQty) : '–'}</span>{' '}
                <span className="text-muted-foreground">{selected.unit}</span>
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <Field id="stocktake-qty" label="Ganti hitungan menjadi" error={qtyError ?? undefined}>
                  <Input
                    id="stocktake-qty"
                    ref={qtyInput}
                    inputMode="decimal"
                    className="w-36 text-right"
                    disabled={!canCount}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </Field>
                <Button type="submit" className="mt-7" disabled={!canCount || !qty.trim() || qtyError !== null}>
                  Simpan qty
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      <section aria-labelledby="recent-title">
        <h2 id="recent-title" className="text-sm text-muted-foreground">
          Terakhir dihitung
        </h2>
        <ul className="mt-2 rounded-md border border-border bg-card">
          {last.length === 0 && <li className="px-4 py-3 text-muted-foreground">Belum ada part yang dihitung.</li>}
          {last.map((x) => (
            <li key={x.productId} className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2 first:border-t-0">
              <span className="min-w-0">
                <span className="block truncate">{fullName(x)}</span>
                <span className="block text-sm text-muted-foreground">{x.countedAt && formatDateTime(x.countedAt)}</span>
              </span>
              <span className="flex-none font-medium">
                {formatQty(x.countedQty ?? 0)} <span className="text-sm font-normal text-muted-foreground">{x.unit}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <NewBarcodeDialog code={newBarcode} list={scope} onClose={() => setNewBarcode(null)} />
    </div>
  )
}

// Input lembar hitung -----------------------------------------------------------

type SaveStatus = { kind: 'saving' | 'saved' } | { kind: 'error'; message: string }

/**
 * Hasil tulisan tangan di lembar hitung diinput dengan urutan yang sama (kategori, nama, merek).
 * Qty disimpan saat Enter atau saat pindah kolom; waktu hitung = saat qty diinput (PRD 4.5).
 */
function SheetTab({ lines, loading, canCount, blind, record }: { lines: StocktakeLine[]; loading: boolean; canCount: boolean; blind: boolean; record: RecordCount }) {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const fractional = useMemo(() => new Map(products.map((p) => [p.id, p.allowsFraction])), [products])
  const categoryNames = useMemo(() => [...new Set(lines.map((b) => b.category))], [lines])
  const [category, setCategory] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, SaveStatus>>({})
  const tableRef = useRef<HTMLTableElement>(null)
  const shown = category ? lines.filter((b) => b.category === category) : lines

  const dropDraft = (id: string) =>
    setDrafts((d) => {
      const remaining = { ...d }
      delete remaining[id]
      return remaining
    })

  const save = async (b: StocktakeLine) => {
    const text = drafts[b.productId]
    if (text === undefined) return
    if (!text.trim()) return dropDraft(b.productId)
    const n = parseQty(text)
    if (n === null) return setStatus((s) => ({ ...s, [b.productId]: { kind: 'error', message: 'Isi angka 0 atau lebih' } }))
    if (fractional.get(b.productId) === false && !Number.isInteger(n)) {
      return setStatus((s) => ({ ...s, [b.productId]: { kind: 'error', message: 'Harus bilangan bulat' } }))
    }
    if (b.decision === 'dihitung' && n === b.countedQty) return dropDraft(b.productId)
    setStatus((s) => ({ ...s, [b.productId]: { kind: 'saving' } }))
    try {
      await record(b.productId, n, false)
      dropDraft(b.productId)
      setStatus((s) => ({ ...s, [b.productId]: { kind: 'saved' } }))
    } catch (e) {
      setStatus((s) => ({ ...s, [b.productId]: { kind: 'error', message: e instanceof Error ? e.message : String(e) } }))
    }
  }

  const focusNext = (from: HTMLInputElement) => {
    const all = [...(tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-qty]') ?? [])]
    const next = all[all.indexOf(from) + 1]
    // Baris terakhir: lepas fokus supaya qty-nya ikut tersimpan.
    if (next) next.focus()
    else from.blur()
  }

  const columns = blind ? 4 : 5

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[640px] text-muted-foreground">
          Ketik qty dari lembar hitung, lalu Enter untuk pindah ke part berikutnya. Hindari menjual part di antara saat dihitung dan saat diinput.
        </p>
        {categoryNames.length > 1 && (
          <Field id="sheet-category" label="Kategori">
            <select
              id="sheet-category"
              className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Semua kategori</option>
              {categoryNames.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">{`${shown.length} part`}</th>
              <th className="w-[100px] px-4 font-normal">Satuan</th>
              {!blind && <th className="w-[120px] px-4 text-right font-normal">Stok sistem</th>}
              <th className="w-[150px] px-4 text-right font-normal">Qty hitung</th>
              <th className="w-[200px] px-4 font-normal">
                <span className="sr-only">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="border-t border-rule">
                <td colSpan={columns} className="px-4 py-3 text-muted-foreground">
                  Memuat part…
                </td>
              </tr>
            )}
            {shown.flatMap((b, i) => {
              const s = status[b.productId]
              const header =
                i === 0 || shown[i - 1].category !== b.category ? (
                  <tr key={`k-${b.category}`} className="h-10 border-t border-rule bg-muted/40">
                    <td colSpan={columns} className="px-4 text-sm font-medium">
                      {b.category}
                    </td>
                  </tr>
                ) : null
              const value = drafts[b.productId] ?? (b.decision === 'dihitung' && b.countedQty !== null ? String(b.countedQty).replace('.', ',') : '')
              return [
                header,
                <tr key={b.productId} className={cn('h-12 border-t border-rule', s?.kind === 'error' && 'bg-pill-negative/40')}>
                  <td className="max-w-0 truncate px-4">{fullName(b)}</td>
                  <td className="px-4 text-muted-foreground">{b.unit}</td>
                  {!blind && <td className="px-4 text-right text-muted-foreground">{formatQty(b.currentStock)}</td>}
                  <td className="px-4 py-1.5">
                    <Input
                      data-qty
                      aria-label={`Qty hitung ${b.name}`}
                      inputMode="decimal"
                      className="h-10 text-right"
                      disabled={!canCount}
                      placeholder={b.decision === 'dianggap_nol' ? 'dianggap 0' : b.decision === 'dilewati' ? 'dilewati' : ''}
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value
                        setDrafts((d) => ({ ...d, [b.productId]: v }))
                        setStatus((st) => {
                          const remaining = { ...st }
                          delete remaining[b.productId]
                          return remaining
                        })
                      }}
                      onBlur={() => void save(b)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        focusNext(e.currentTarget)
                      }}
                    />
                  </td>
                  <td className="px-4 text-sm">
                    {s?.kind === 'saving' && <span className="text-muted-foreground">Menyimpan…</span>}
                    {s?.kind === 'saved' && <span className="text-positive">Tersimpan</span>}
                    {s?.kind === 'error' && <span className="text-negative">{s.message}</span>}
                    {!s && b.decision === 'dihitung' && b.countedAt && <span className="text-muted-foreground">{formatDateTime(b.countedAt)}</span>}
                  </td>
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Lembar hitung dan batalkan ------------------------------------------------------

/** Lembar hitung per kategori ke printer struk atau PDF: tanpa stok sistem (PRD 4.5). */
function CountSheetDialog({ session, lines, close }: { session: StocktakeSession; lines: StocktakeLine[]; close: () => void }) {
  const settings = useSettings()
  const categoryNames = useMemo(() => [...new Set(lines.map((b) => b.category))], [lines])
  const [category, setCategory] = useState('')
  const [date] = useState(() => formatDate(new Date()))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const choice = category ? lines.filter((b) => b.category === category) : lines
  const width = settings.data?.ukuran_kertas === 58 ? 58 : 80
  const label = category || (session.kind === 'kategori' ? (session.category ?? '') : 'Semua kategori')

  const pdf = () =>
    exportPdf({
      fileName: `lembar-hitung-${session.number}${category ? `-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`,
      title: `Lembar hitung ${session.number}`,
      note: [[settings.data?.nama_bengkel, label, `dicetak ${date}`].filter(Boolean).join(' · '), 'Dihitung oleh: ______________________'],
      columns: [
        { title: 'Kategori', value: (b) => b.category },
        { title: 'Part', value: (b) => b.name },
        { title: 'Merek', value: (b) => b.brand ?? '' },
        { title: 'Satuan', value: (b) => b.unit ?? '' },
        { title: 'Qty hitung', value: () => '' },
      ],
      rows: choice,
    }).catch((e: unknown) => setErrorMessage(e instanceof Error ? e.message : String(e)))

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Lembar hitung</DialogTitle>
        <DialogDescription>Nama, merek, satuan, dan kolom kosong untuk qty, tanpa stok sistem. Urutannya sama dengan tab Input lembar hitung.</DialogDescription>
      </DialogHeader>
      {categoryNames.length > 1 && (
        <Field id="print-sheet-category" label="Kategori">
          <select
            id="print-sheet-category"
            className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Semua kategori</option>
            {categoryNames.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="text-muted-foreground">{choice.length} part.</p>
      {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Tutup
        </Button>
        <Button variant="outline" disabled={!choice.length} onClick={() => void pdf()}>
          Ekspor PDF
        </Button>
        <Button
          disabled={!choice.length}
          onClick={() => void printText(buildCountSheet(choice, width === 58 ? 32 : 48, ['LEMBAR HITUNG', session.number, label, date]), width)}
        >
          Cetak
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Stok tidak berubah; hasil hitungan tetap tersimpan dan ditandai Dibatalkan (PRD 4.5). */
function CancelSessionDialog({ session, close }: { session: StocktakeSession; close: () => void }) {
  const queryClient = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => cancelStocktake(session.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stocktake'] })
      close()
    },
  })
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Batalkan {session.number}?</DialogTitle>
        <DialogDescription>Stok tidak berubah sama sekali. Hasil hitungan tetap tersimpan dan ditandai Dibatalkan. Tercatat di riwayat perubahan.</DialogDescription>
      </DialogHeader>
      {cancel.isError && <Notice tone="error">{cancel.error.message}</Notice>}
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Kembali
        </Button>
        <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          {cancel.isPending ? 'Membatalkan…' : 'Batalkan sesi'}
        </Button>
      </DialogFooter>
    </div>
  )
}
