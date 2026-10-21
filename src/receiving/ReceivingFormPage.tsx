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
import { db } from '@/lib/localCopy'
import { useOnline } from '@/lib/online'
import { useBarcodeScanner } from '@/lib/scanner'
import { playSuccess, playError } from '@/lib/sound'
import { wibDate } from '@/pos/saleNumber'
import { findByBarcode, fullName, type LocalProduct } from '@/products/product'
import { SearchBox } from '@/products/ProductSearchBox'
import { NewBarcodeDialog } from '@/products/UnknownBarcodeDialog'
import { saveReceiving } from '@/receiving/data'
import { purchaseCodeError } from '@/products/productForm'
import { validateReceiving, addPartLine, type ReceivingLine } from '@/receiving/receiving'

let counter = 0
const newKey = () => `terima-${Date.now()}-${++counter}`

/**
 * Penerimaan baru (PRD 4.4, R52, R64): tanggal masuk, lalu cari atau scan barang. Scan menambah qty 1. Tanpa
 * supplier dan tanpa harga beli angka: setiap baris punya Kode harga part itu, yang kalau diubah memperbarui
 * kode part. Mutasi dibukukan saat disimpan, bukan pada tanggal masuk.
 */
export function ReceivingFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
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

  const addToCart = (p: LocalProduct) => {
    setLines((b) => addPartLine(b, p, newKey()).lines)
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
      navigate('/receiving', { replace: true, state: { message: `Penerimaan ${result.number} tersimpan. Stok dan kode harga sudah diperbarui.` } })
    },
  })

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
              <th className="w-[220px] px-3 font-normal">Kode harga</th>
              <th className="w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">Scan barcode part yang datang. Setiap scan menambah qty 1.</td>
              </tr>
            )}
            {lines.map((b) => {
              const codeError = purchaseCodeError(b.code)
              return (
                <tr key={b.key} className={cn('border-t border-rule', lineErrors[b.key] && 'bg-pill-negative/40')}>
                  <td className="px-4 py-2 align-top">
                    <span className="block">{fullName(b)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {b.unit}
                      {lineErrors[b.key] && lineErrors[b.key] !== codeError && <span className="text-negative"> · {lineErrors[b.key]}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input aria-label={`Qty ${b.name}`} inputMode="decimal" className="h-10 text-right" value={b.qty} onChange={(e) => updateLine(b.key, { qty: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      aria-label={`Kode harga ${b.name}`}
                      aria-invalid={Boolean(codeError)}
                      placeholder="Belum ada"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="h-10 font-mono uppercase"
                      value={b.code}
                      onChange={(e) => updateLine(b.key, { code: e.target.value.toUpperCase() })}
                    />
                    {codeError && <span className="mt-1 block text-sm text-negative">{codeError}</span>}
                  </td>
                  <td className="px-2 py-2 text-right align-top whitespace-nowrap">
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
        <span className="text-sm text-muted-foreground">Kode harga yang diubah ikut memperbarui kode part.</span>
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
