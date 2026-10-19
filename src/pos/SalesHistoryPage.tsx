import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatNumber, formatQty, formatRupiah, formatDateTime } from '@/lib/format'
import { useLogo } from '@/lib/logo'
import { printText } from '@/lib/printText'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { PAYMENT_METHOD_LABELS } from '@/pos/calculate'
import { buildDailySummary } from '@/pos/dailySummary'
import { printReceipt } from '@/pos/printReceipt'
import { wibDate } from '@/pos/saleNumber'
import { useSaleList, useSaleDetail, voidSale, type SaleDetail, type SaleSummary } from '@/pos/sales'
import { UnsentSalesSection } from '@/pos/UnsentSalesSection'
import { fetchDailySummary } from '@/reports/data'

/**
 * Riwayat nota (PRD 4.6): cari lewat nomor, tanggal, nopol, atau nama pelanggan, lalu cetak ulang atau void.
 * Responsif untuk HP pemilik (PRD 6): tabel menjadi daftar dua baris di layar sempit.
 */
export function SalesHistoryPage() {
  const [today] = useState(() => wibDate(new Date()))
  const [date, setDate] = useState(today)
  const [query, setQuery] = useState('')
  const [dibuka, setOpenId] = useState<string | null>(null)
  const online = useOnline()
  const list = useSaleList(date, query)
  // Saat offline kueri ditahan, jadi daftar dari server tidak pernah selesai dimuat (R24).
  const needsInternet = !online && !list.isSuccess
  const sale = list.data ?? []
  const lunas = sale.filter((n) => n.status === 'lunas')
  const revenue = lunas.reduce((s, n) => s + n.total, 0)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Riwayat nota</h1>
      <p className="mt-1 text-muted-foreground">
        {query.trim()
          ? `Hasil pencarian di semua tanggal${sale.length >= 200 ? ', 200 nota terbaru' : ''}.`
          : list.isSuccess
            ? `${lunas.length} nota, ${formatRupiah(revenue)}${sale.length > lunas.length ? `, ${sale.length - lunas.length} void tidak dihitung` : ''}.`
            : 'Nota per tanggal.'}
      </p>

      <UnsentSalesSection />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Cari nota" placeholder="Nomor, nopol, atau nama pelanggan" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Input
          type="date"
          aria-label="Tanggal nota"
          className="w-auto"
          disabled={Boolean(query.trim())}
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        {/* Ringkasan memakai tanggal terpilih, jadi disembunyikan saat mencari di semua tanggal (R32). */}
        {!query.trim() && <PrintDailySummary date={date} />}
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_110px_140px] gap-4 px-4 py-3 text-sm text-muted-foreground md:grid">
          <span>Nota</span>
          <span>Nopol · pelanggan</span>
          <span>Metode</span>
          <span className="text-right">Total</span>
        </div>
        {needsInternet && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Butuh internet untuk menampilkan nota yang sudah terkirim.</p>}
        {!needsInternet && list.isPending && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Memuat nota…</p>}
        {!needsInternet && list.isError && (
          <p className="border-t border-rule px-4 py-3 text-muted-foreground">
            Nota tidak bisa dimuat.{' '}
            <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void list.refetch()}>
              Coba lagi
            </button>
          </p>
        )}
        {list.isSuccess && sale.length === 0 && (
          <p className="border-t border-rule px-4 py-3 text-muted-foreground">{query.trim() ? 'Tidak ada nota yang cocok.' : 'Belum ada nota pada tanggal ini.'}</p>
        )}
        <ul>
          {sale.map((n) => (
            <SaleRow key={n.id} sale={n} open={() => setOpenId(n.id)} />
          ))}
        </ul>
      </div>

      <Dialog open={dibuka !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="sm:max-w-xl">{dibuka && <SaleDetailDialog id={dibuka} close={() => setOpenId(null)} />}</DialogContent>
      </Dialog>
    </>
  )
}

/** Ringkasan harian ke printer struk (PRD 4.11, R32). Angkanya dari server, jadi butuh internet. */
function PrintDailySummary({ date }: { date: string }) {
  const online = useOnline()
  const settings = useSettings()
  const print = useMutation({
    mutationFn: async () => {
      const width = settings.data?.ukuran_kertas === 58 ? 58 : 80
      const summary = await fetchDailySummary(date)
      await printText(buildDailySummary(summary, width === 58 ? 32 : 48, settings.data?.nama_bengkel ?? '', new Date()), width)
    },
  })
  return (
    <>
      <Button
        variant="outline"
        disabled={!online || print.isPending}
        title={online ? undefined : 'Butuh internet'}
        onClick={() => print.mutate()}
      >
        {print.isPending ? 'Menyiapkan…' : 'Cetak ringkasan harian'}
      </Button>
      {print.isError && (
        <Notice tone="error" className="w-full">
          Ringkasan tidak bisa dicetak. {print.error.message}
        </Notice>
      )}
    </>
  )
}

function SaleRow({ sale: n, open }: { sale: SaleSummary; open: () => void }) {
  const who = [n.plate, n.customer].filter(Boolean).join(' · ')
  return (
    <li className="border-t border-rule">
      <button
        type="button"
        onClick={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-2.5 text-left hover:bg-muted/40 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_110px_140px] md:items-center"
      >
        <span className="min-w-0">
          <span className={cn('block truncate font-mono text-sm', n.status === 'void' && 'text-muted-foreground line-through')}>{n.number}</span>
          <span className="block text-sm text-muted-foreground">
            {formatDateTime(n.createdAt)} · {n.cashier}
          </span>
        </span>
        <span className="col-start-1 row-start-2 truncate text-sm text-muted-foreground md:col-start-auto md:row-start-auto md:text-[15px] md:text-foreground">
          {who || <span className="text-muted-foreground">–</span>}
        </span>
        <span className="hidden text-muted-foreground md:block">{PAYMENT_METHOD_LABELS[n.method]}</span>
        <span className="row-span-2 self-center text-right md:row-span-1">
          {n.status === 'void' ? (
            <span className="inline-flex h-6 items-center rounded-sm bg-pill-negative px-2 text-sm text-pill-negative-ink">Void</span>
          ) : (
            formatNumber(n.total)
          )}
        </span>
      </button>
    </li>
  )
}

function SaleDetailDialog({ id, close }: { id: string; close: () => void }) {
  const detail = useSaleDetail(id)
  const settings = useSettings()
  const logo = useLogo(settings.data?.logo_url)
  const [voiding, setVoiding] = useState(false)

  if (detail.isPending) return <DialogTitle>Memuat nota…</DialogTitle>
  if (detail.isError) {
    return (
      <>
        <DialogTitle>Nota tidak bisa dimuat</DialogTitle>
        <Notice tone="error">{detail.error.message}</Notice>
      </>
    )
  }
  const n = detail.data
  if (voiding) return <FormVoid sale={n} onDone={() => setVoiding(false)} />

  const reprint = () => {
    const p = settings.data
    if (!p) return
    void printReceipt(
      {
        workshop: { name: p.nama_bengkel, address: p.alamat, phone: p.telepon, footer: p.footer_struk },
        number: n.number,
        time: n.createdAt,
        cashier: n.cashier,
        plate: n.plate,
        customer: n.customer,
        mechanic: n.mechanic,
        serviceNote: n.serviceNote,
        lines: n.lines,
        subtotal: n.subtotal,
        saleDiscount: n.saleDiscount,
        total: n.total,
        method: n.method,
        cash: n.cash,
        change: n.change,
        isCopy: true,
        void: n.status === 'void',
      },
      p.ukuran_kertas === 58 ? 58 : 80,
      logo,
      1,
    )
  }

  const info: [string, string | null][] = [
    ['Waktu', formatDateTime(n.createdAt)],
    ['Kasir', n.cashier],
    ['Nopol', n.plate],
    ['Pelanggan', n.customer],
    ['Mekanik', n.mechanic],
    ['Catatan', n.serviceNote],
  ]
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="font-mono">{n.number}</DialogTitle>
        <DialogDescription>
          {n.status === 'void'
            ? `Void ${n.voidedAt ? formatDateTime(n.voidedAt) : ''} oleh ${n.voidedBy ?? '-'}: ${n.voidReason ?? ''}`
            : `${PAYMENT_METHOD_LABELS[n.method]}${n.originalNumber ? ` · nomor diganti dari ${n.originalNumber}` : ''}`}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-1">
        {info
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <ul className="border-y border-rule py-2">
        {n.lines.map((b, i) => (
          <li key={i} className="flex justify-between gap-3 py-1">
            <span className="min-w-0">
              <span className="block truncate">{b.brand ? `${b.name} · ${b.brand}` : b.name}</span>
              <span className="block text-sm text-muted-foreground">
                {formatQty(b.qty)} x {formatNumber(b.price)}
                {b.discount ? ` · diskon ${formatNumber(b.discount)}` : ''}
              </span>
            </span>
            <span className="flex-none">{formatNumber(b.amount - b.discount)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatNumber(n.subtotal)}</dd>
        </div>
        {n.saleDiscount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Diskon nota</dt>
            <dd>-{formatNumber(n.saleDiscount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-lg">
          <dt>Total</dt>
          <dd className="font-bold">{formatRupiah(n.total)}</dd>
        </div>
      </dl>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Tutup
        </Button>
        {n.status === 'lunas' && (
          <Button variant="destructive" onClick={() => setVoiding(true)}>
            Void nota
          </Button>
        )}
        <Button onClick={reprint}>Cetak ulang</Button>
      </DialogFooter>
    </div>
  )
}

/** Void seluruh nota: alasan wajib, perlu konfirmasi, wajib online (PRD 4.7). */
function FormVoid({ sale, onDone }: { sale: SaleDetail; onDone: () => void }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => voidSale(sale.id, reason.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sale'] })
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
        <DialogTitle>Void {sale.number}?</DialogTitle>
        <DialogDescription>
          Seluruh nota dibatalkan ({formatRupiah(sale.total)}). Stok part kembali hari ini dengan HPP dari nota asal. Pengembalian uang ke pelanggan tidak dicatat. Perbaikan dilakukan dengan membuat nota baru yang benar.
        </DialogDescription>
      </DialogHeader>
      <Field id="void-reason" label="Alasan void">
        <Input id="void-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {!online && <Notice tone="warning">Void hanya bisa dilakukan saat online.</Notice>}
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" variant="destructive" disabled={!online || !reason.trim() || save.isPending}>
          {save.isPending ? 'Memproses…' : 'Void nota'}
        </Button>
      </DialogFooter>
    </form>
  )
}
