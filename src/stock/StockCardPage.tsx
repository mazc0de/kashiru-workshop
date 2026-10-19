import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatNumber, formatQty, formatRupiah, formatDateTime, parseQty, parseRupiah } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { PRODUCT_LIST_KEY, productDetailKey, useProductDetail, type ProductDetail } from '@/products/data'
import { fullName } from '@/products/product'
import { StockStatusPill } from '@/products/StockStatusPill'
import { adjustStock, useStockCard } from '@/stock/data'
import { REASON_LABELS, MOVEMENT_LABELS, type Reason } from '@/stock/stock'

/** Kartu stok per part (PRD 4.3): tanggal, jenis mutasi, nomor dokumen, masuk/keluar, saldo, HPP, akun. */
export function StockCardPage() {
  const { id } = useParams()
  const product = useProductDetail(id ?? null)
  const cards = useStockCard(id ?? '')
  const online = useOnline()
  const [adjusting, setAdjusting] = useState(false)
  const p = product.data

  return (
    <>
      <Link to="/stock" className="inline-flex h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Stok
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{p ? fullName(p) : 'Kartu stok'}</h1>
          {p && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
              Stok{' '}
              <span className={cn('text-foreground', (p.stock ?? 0) < 0 && 'text-negative')}>
                {formatQty(p.stock ?? 0)} {p.unit}
              </span>
              · harga beli rata-rata {formatRupiah(p.avgCost)}
              <StockStatusPill stock={p.stock ?? 0} minStock={p.minStock} />
            </p>
          )}
        </div>
        {p?.type === 'part' && (
          <div className="flex gap-2">
            <Button variant="outline" render={<Link to={`/products/${p.id}`} />} nativeButton={false}>
              Ubah produk
            </Button>
            <Button disabled={!online} onClick={() => setAdjusting(true)}>
              Penyesuaian stok
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="w-[150px] px-4 font-normal">Tanggal</th>
              <th className="w-[120px] px-4 font-normal">Mutasi</th>
              <th className="px-4 font-normal">Dokumen · keterangan</th>
              <th className="w-[90px] px-4 text-right font-normal">Masuk</th>
              <th className="w-[90px] px-4 text-right font-normal">Keluar</th>
              <th className="w-[90px] px-4 text-right font-normal">Saldo</th>
              <th className="w-[110px] px-4 text-right font-normal">HPP</th>
              <th className="w-[120px] px-4 font-normal">Akun</th>
            </tr>
          </thead>
          <tbody>
            {cards.isPending && (
              <tr className="border-t border-rule">
                <td colSpan={8} className="px-4 py-3 text-muted-foreground">Memuat kartu stok…</td>
              </tr>
            )}
            {cards.isSuccess && cards.data.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={8} className="px-4 py-3 text-muted-foreground">Belum ada mutasi stok.</td>
              </tr>
            )}
            {cards.data?.map((m) => {
              const note = [m.documentNumber, m.reason ? REASON_LABELS[m.reason] : null, m.note].filter(Boolean).join(' · ')
              return (
                <tr key={m.id} className="h-11 border-t border-rule">
                  <td className="px-4 text-muted-foreground">{formatDateTime(m.time)}</td>
                  <td className="px-4">{MOVEMENT_LABELS[m.kind] ?? m.kind}</td>
                  <td className="max-w-0 truncate px-4 text-muted-foreground">{note || '–'}</td>
                  <td className="px-4 text-right">{m.qtyIn === null ? '' : formatQty(m.qtyIn)}</td>
                  <td className="px-4 text-right">{m.qtyOut === null ? '' : formatQty(m.qtyOut)}</td>
                  <td className={cn('px-4 text-right font-medium', m.balance < 0 && 'text-negative')}>{formatQty(m.balance)}</td>
                  <td className="px-4 text-right text-muted-foreground">{formatNumber(m.cogs)}</td>
                  <td className="truncate px-4 text-muted-foreground">{m.account ?? '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {cards.data && cards.data.length >= 500 && <p className="mt-2 text-sm text-muted-foreground">Menampilkan 500 mutasi terbaru.</p>}

      <Dialog open={adjusting} onOpenChange={setAdjusting}>
        <DialogContent>{adjusting && p && <AdjustmentDialog product={p} onDone={() => setAdjusting(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

/** Penyesuaian stok di luar opname: alasan wajib dari daftar tetap, Lainnya wajib keterangan (PRD 4.3, R8). */
function AdjustmentDialog({ product, onDone }: { product: ProductDetail; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<1 | -1>(-1)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<Reason | ''>('')
  const [note, setNote] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')

  const parsed = parseQty(qty)
  const fractional = product.allowsFraction
  const qtyError = !qty.trim() ? null : parsed === null || parsed <= 0 ? 'Isi qty lebih dari 0' : !fractional && !Number.isInteger(parsed) ? 'Qty harus bilangan bulat' : null
  const needsPrice = direction === 1 && product.avgCost === 0
  const price = parseRupiah(purchasePrice)
  const complete =
    parsed !== null && !qtyError && reason !== '' && (reason !== 'lainnya' || note.trim() !== '') && (!needsPrice || (price !== null && price > 0))
  const newStock = parsed !== null && !qtyError ? (product.stock ?? 0) + direction * parsed : null

  const save = useMutation({
    mutationFn: () =>
      adjustStock({ productId: product.id, qty: direction * parsed!, reason: reason as Reason, note: note.trim(), purchasePrice: needsPrice ? price : null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: productDetailKey(product.id) }),
        queryClient.invalidateQueries({ queryKey: PRODUCT_LIST_KEY }),
      ])
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
        <DialogTitle>Penyesuaian stok</DialogTitle>
        <DialogDescription>
          {fullName(product)}. Untuk barang rusak, hilang, ketemu, atau salah input di luar opname. Tercatat di kartu stok dan riwayat perubahan.
        </DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label="Arah penyesuaian" className="inline-flex h-11 w-fit rounded-md border border-input bg-card p-1">
        {([
          [-1, 'Kurangi stok'],
          [1, 'Tambah stok'],
        ] as const).map(([a, label]) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={direction === a}
            onClick={() => setDirection(a)}
            className={cn('rounded-sm px-4 text-[15px] text-muted-foreground', direction === a && 'bg-active text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="adjust-qty" label={`Qty${product.unit ? ` (${product.unit})` : ''}`} error={qtyError ?? undefined}>
          <Input id="adjust-qty" autoFocus inputMode="decimal" className="text-right" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field id="adjust-reason" label="Alasan">
          <select
            id="adjust-reason"
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
      </div>
      <Field id="adjust-note" label={reason === 'lainnya' ? 'Keterangan (wajib)' : 'Keterangan'}>
        <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {needsPrice && (
        <Field id="adjust-price" label="Harga beli per satuan" hint="Wajib, karena part ini belum punya harga beli rata-rata.">
          <Input id="adjust-price" inputMode="numeric" className="text-right" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
        </Field>
      )}
      {newStock !== null && (
        <p className="text-muted-foreground">
          Stok {formatQty(product.stock ?? 0)} menjadi <span className={cn('text-foreground', newStock < 0 && 'text-negative')}>{formatQty(newStock)}</span> {product.unit}.
        </p>
      )}
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={!complete || save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan penyesuaian'}
        </Button>
      </DialogFooter>
    </form>
  )
}
