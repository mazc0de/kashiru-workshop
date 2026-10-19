import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from 'cn'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber, formatRupiah } from '@/lib/format'
import { db } from '@/lib/localCopy'
import { useOnline } from '@/lib/online'
import { useBarcodeScanner } from '@/lib/scanner'
import { playSuccess, playError } from '@/lib/sound'
import { wibDate } from '@/pos/saleNumber'
import { findByBarcode, fullName, type LocalProduct } from '@/products/product'
import { SearchBox } from '@/products/ProductSearchBox'
import { NewBarcodeDialog } from '@/products/UnknownBarcodeDialog'
import { saveReceiving } from '@/receiving/data'
import { lineValue, validateReceiving, addBonusLine, addPartLine, type ReceivingLine } from '@/receiving/receiving'
import { useLastPurchases } from '@/stock/data'

let counter = 0
const newKey = () => `terima-${Date.now()}-${++counter}`

/**
 * Penerimaan baru (PRD 4.4, R52): tanggal masuk, lalu cari atau scan barang. Scan menambah qty 1, harga beli
 * otomatis dari harga beli terakhir dan bisa diubah, barang bonus sebagai baris Rp 0 (R6). Tanpa supplier.
 * Mutasi dibukukan saat disimpan, bukan pada tanggal masuk.
 */
export function ReceivingFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
  const last = useLastPurchases()
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const part = useMemo(() => products.filter((p) => p.type === 'part' && p.active), [products])

  const [today] = useState(() => wibDate(new Date()))
  const [receivedDate, setReceivedDate] = useState(today)
  const [lines, setLines] = useState<ReceivingLine[]>([])
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [newBarcode, setNewBarcode] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const defaultPrice = (p: LocalProduct) => last.data?.get(p.id)?.purchasePrice ?? (p.avgCost ? Math.round(p.avgCost) : null)
  const addToCart = (p: LocalProduct) => {
    setLines((b) => addPartLine(b, p, defaultPrice(p), newKey()).lines)
    setQuery('')
    setMessage(null)
    playSuccess()
    searchInput.current?.focus()
  }

  useBarcodeScanner((code) => {
    const p = findByBarcode(part, code)
    if (p) addToCart(p)
    else {
      playError()
      setNewBarcode(code)
    }
  }, newBarcode === null)

  const updateLine = (key: string, changes: Partial<ReceivingLine>) => {
    setLines((lines) => lines.map((b) => (b.key === key ? { ...b, ...changes } : b)))
    setLineErrors((s) => {
      const remaining = { ...s }
      delete remaining[key]
      return remaining
    })
  }

  const save = useMutation({
    mutationFn: saveReceiving,
    onSuccess: async (result) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['receiving'] }), queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['stock'] })])
      navigate('/receiving', { replace: true, state: { message: `Penerimaan ${result.number} tersimpan. Stok dan harga beli rata-rata sudah diperbarui.` } })
    },
  })

  const total = lines.reduce((s, b) => s + (lineValue(b) ?? 0), 0)

  return (
    <>
      <Link to="/receiving" className="inline-flex h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Penerimaan
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Penerimaan baru</h1>
      {!online && (
        <Notice tone="warning" className="mt-4">
          Penerimaan wajib online. Simpan setelah koneksi kembali.
        </Notice>
      )}

      <div className="mt-6 w-[220px]">
        <Field id="receiving-date" label="Tanggal masuk" hint="Boleh tanggal mundur.">
          <Input id="receiving-date" type="date" max={today} value={receivedDate} onChange={(e) => e.target.value && setReceivedDate(e.target.value)} />
        </Field>
      </div>

      <SearchBox
        ref={searchInput}
        query={query}
        setQuery={setQuery}
        products={part}
        onPick={addToCart}
        autoFocus={false}
        disabled={newBarcode !== null}
        placeholder="Scan barcode part, atau ketik nama, merek, kode part"
        className="mt-6"
      />

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">{lines.length ? `${lines.length} baris` : 'Part'}</th>
              <th className="w-[120px] px-3 text-right font-normal">Qty</th>
              <th className="w-[160px] px-3 text-right font-normal">Harga beli</th>
              <th className="w-[140px] px-3 text-right font-normal">Jumlah</th>
              <th className="w-[150px]" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={5} className="px-4 py-3 text-muted-foreground">Scan barcode part yang datang. Setiap scan menambah qty 1.</td>
              </tr>
            )}
            {lines.map((b, i) => {
              const value = lineValue(b)
              return (
                <tr key={b.key} className={cn('border-t border-rule', lineErrors[b.key] && 'bg-pill-negative/40')}>
                  <td className="px-4 py-2 align-top">
                    <span className="block">{fullName(b)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {b.bonus ? 'Barang bonus' : b.unit}
                      {lineErrors[b.key] && <span className="text-negative"> · {lineErrors[b.key]}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input aria-label={`Qty ${b.name}`} inputMode="decimal" className="h-10 text-right" value={b.qty} onChange={(e) => updateLine(b.key, { qty: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      aria-label={`Harga beli ${b.name}`}
                      inputMode="numeric"
                      className="h-10 text-right"
                      value={b.price}
                      onChange={(e) => updateLine(b.key, { price: e.target.value })}
                      onBlur={() => {
                        const v = b.price.replace(/[.\s]/g, '')
                        if (/^\d+$/.test(v)) updateLine(b.key, { price: formatNumber(Number(v)) })
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top leading-10">{value === null ? '–' : formatNumber(value)}</td>
                  <td className="px-2 py-2 text-right align-top whitespace-nowrap">
                    {!b.bonus && (
                      <Button variant="ghost" title="Tambah baris barang bonus Rp 0" onClick={() => setLines((lines) => addBonusLine(lines, i, newKey()))}>
                        + Bonus
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Hapus ${b.name}`} onClick={() => setLines((lines) => lines.filter((x) => x.key !== b.key))}>
                      <X className="size-4" strokeWidth={1.75} />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 -mx-8 mt-4 flex flex-wrap items-center justify-end gap-4 border-t border-border bg-background px-8 py-4">
        {(message || save.isError) && (
          <span className="mr-auto text-sm text-negative" role="alert">
            {save.error?.message ?? message}
          </span>
        )}
        <span className="text-muted-foreground">
          Total <span className="text-lg font-bold text-foreground">{formatRupiah(total)}</span>
        </span>
        <Button variant="outline" render={<Link to="/receiving" />} nativeButton={false}>
          Batal
        </Button>
        <Button
          disabled={!online || save.isPending}
          onClick={() => {
            const result = validateReceiving(lines)
            if (!result.ok) {
              setLineErrors(result.errors)
              setMessage(result.message)
              return
            }
            save.mutate({ items: result.items, receivedDate })
          }}
        >
          {save.isPending ? 'Menyimpan…' : 'Simpan penerimaan'}
        </Button>
      </div>

      <NewBarcodeDialog code={newBarcode} list={part} onClose={() => setNewBarcode(null)} />
    </>
  )
}
