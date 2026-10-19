import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus, X } from 'lucide-react'
import { cn } from 'cn'

import { useProfile } from '@/auth/session'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatNumber, formatQty, formatRupiah, parseRupiah } from '@/lib/format'
import { listMechanics, db, reloadLocalCopy } from '@/lib/localCopy'
import { useLogo } from '@/lib/logo'
import { useOnline } from '@/lib/online'
import { useBarcodeScanner } from '@/lib/scanner'
import { useSettings } from '@/lib/settings'
import { playSuccess, playError } from '@/lib/sound'
import { calculateSale, type Discount, type SaleCalculation } from '@/pos/calculate'
import {
  setLineDiscount,
  stepQty,
  removeLine,
  lineCogs,
  toCalcLines,
  selectLine,
  qtyInCart,
  refreshPrices,
  addProduct,
  setServicePrice,
  changeQty,
  decreaseProduct,
  type CartLine,
} from '@/pos/cart'
import { openHeldCart, holdCart, useCart } from '@/pos/cartStore'
import { paySale, lastReceipt, type Attempt } from '@/pos/checkout'
import { CatalogDialog } from '@/pos/CatalogDialog'
import { discountText, parseLineDiscount } from '@/pos/discountInput'
import { PaymentDialog } from '@/pos/PaymentDialog'
import { SaleInfoDialog, DiscountDialog, HeldCartsDialog, ClearCartDialog, QtyDialog, StockDialog } from '@/pos/PosDialogs'
import { printReceipt } from '@/pos/printReceipt'
import { findByBarcode, fullName, type LocalProduct } from '@/products/product'
import { SearchBox } from '@/products/ProductSearchBox'
import { NewBarcodeDialog } from '@/products/UnknownBarcodeDialog'

/** Layar Kasir (PRD 4.6). Semua laptop setara: siapa pun yang login bisa membuat nota (R50). */
export function PosPage() {
  return <PosScreen />
}

/**
 * Kasir mencari produk dari salinan di laptop (PRD 4.13), yang dimuat saat aplikasi dibuka atau kembali
 * online. Kalau salinan masih kosong, misalnya produk baru diisi dari perangkat lain atau lewat SQL, produk
 * bisa dimuat ulang dari sini, dan penyebabnya ditampilkan kalau gagal.
 */
function EmptyLocalCopyNotice({ online }: { online: boolean }) {
  const count = useLiveQuery(() => db.products.count())
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  if (count === undefined || count > 0) return null
  const reload = async () => {
    setState({ busy: true, error: null })
    try {
      await reloadLocalCopy()
      setState({ busy: false, error: null })
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <Notice tone={state.error ? 'error' : 'warning'} className="mt-4 flex flex-wrap items-center gap-3">
      <span className="flex-1">
        {state.error ? `Produk gagal dimuat: ${state.error}` : 'Belum ada produk di laptop ini. Muat ulang setelah produk ditambahkan dari perangkat lain.'}
      </span>
      <Button variant="outline" disabled={!online || state.busy} onClick={() => void reload()}>
        {state.busy ? 'Memuat…' : 'Muat ulang produk'}
      </Button>
    </Notice>
  )
}

type Dialog =
  | { kind: 'qty' }
  | { kind: 'saleDiscount' }
  | { kind: 'data' }
  | { kind: 'held' }
  | { kind: 'payment' }
  | { kind: 'clear' }
  | { kind: 'stock'; products: LocalProduct; qty: number; proceed: () => void }
  | { kind: 'barcode'; code: string }

let keyCounter = 0
const newKey = () => `baris-${Date.now()}-${++keyCounter}`

function PosScreen() {
  const profile = useProfile()
  const settings = useSettings()
  const logo = useLogo(settings.data?.logo_url)
  const online = useOnline()
  const cart = useCart()
  const { update } = cart
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const mechanics = useLiveQuery(listMechanics, [], [])
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const cartQty = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of cart.lines) m.set(b.productId, (m.get(b.productId) ?? 0) + b.qty)
    return m
  }, [cart.lines])

  const [dialog, setDialog] = useState<Dialog | null>(null)
  // Katalog (R53) terpisah dari dialog lain, supaya peringatan stok bisa muncul di atasnya.
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const calc = useMemo(() => calculateSale(toCalcLines(cart), cart.saleDiscount), [cart])
  const selected: CartLine | undefined = cart.lines[cart.selected]
  const hasInactive = cart.lines.some((b) => b.inactive)

  const focusSearch = useCallback(() => requestAnimationFrame(() => searchInput.current?.focus()), [])
  /** F8 dan tombol Diskon: kursor ke isian diskon baris itu, tanpa jendela (R55). */
  const focusLineDiscount = (i: number) =>
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-discount-line="${i}"]`)?.focus())
  const closeDialog = useCallback(() => {
    setDialog(null)
    focusSearch()
  }, [focusSearch])

  /** Qty part yang melebihi stok sistem meminta konfirmasi dulu; stok boleh minus (PRD 4.6). */
  const withStockCheck = (p: LocalProduct | undefined, newQty: number, proceed: () => void) => {
    if (p && p.type === 'part' && p.stock !== null && newQty > p.stock) {
      playError()
      setDialog({ kind: 'stock', products: p, qty: newQty, proceed })
      return
    }
    proceed()
  }

  const addToCart = (p: LocalProduct, fromCatalog = false) => {
    withStockCheck(p, qtyInCart(cart, p.id) + 1, () => {
      const key = newKey()
      update((k) => addProduct(k, p, key))
      const onSaved = useCart.getState()
      setFlash({ key: onSaved.lines[onSaved.selected]?.key ?? key, n: Date.now() })
      playSuccess()
      setNotice(null)
      setDialog(null)
      // Dari katalog, jendela katalog tetap terbuka dan fokus tidak dipindah ke kolom cari.
      if (fromCatalog) return
      setQuery('')
      focusSearch()
    })
  }

  // Scan menambah part ke keranjang; barcode yang sama menambah qty (PRD 4.8).
  useBarcodeScanner((code) => {
    const p = findByBarcode(products, code)
    if (p) addToCart(p, catalogOpen)
    else {
      playError()
      setDialog({ kind: 'barcode', code })
    }
  }, dialog === null)

  const reprintLast = useCallback(async () => {
    const receipt = await lastReceipt()
    if (!receipt || !settings.data) {
      setNotice({ tone: 'error', text: 'Belum ada nota di perangkat ini untuk dicetak ulang.' })
      return
    }
    await printReceipt({ ...receipt, isCopy: true }, settings.data.ukuran_kertas === 58 ? 58 : 80, logo, 1)
    focusSearch()
  }, [settings.data, logo, focusSearch])

  const hold = useCallback(async () => {
    const label = await holdCart()
    setNotice({ tone: 'info', text: `Keranjang ditahan: ${label}. Tekan F6 untuk membukanya lagi.` })
    focusSearch()
  }, [focusSearch])

  // Pintasan keyboard (PRD 4.6). Tombol navigasi keranjang hanya berlaku saat kolom cari kosong.
  useEffect(() => {
    const press = (e: KeyboardEvent) => {
      if (dialog !== null || catalogOpen || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const k = useCart.getState()
      const hasLines = k.lines.length > 0
      switch (e.key) {
        case 'F2':
          e.preventDefault()
          searchInput.current?.focus()
          return
        case 'F3':
          e.preventDefault()
          setCatalogOpen(true)
          return
        case 'F4':
          e.preventDefault()
          setDialog({ kind: 'data' })
          return
        case 'F6':
          e.preventDefault()
          if (hasLines) void hold()
          else setDialog({ kind: 'held' })
          return
        case 'F7':
          e.preventDefault()
          if (k.lines[k.selected]) setDialog({ kind: 'qty' })
          return
        case 'F8':
          e.preventDefault()
          if (e.shiftKey) {
            if (hasLines) setDialog({ kind: 'saleDiscount' })
          } else if (k.lines[k.selected]) focusLineDiscount(k.selected)
          return
        case 'F9':
          e.preventDefault()
          if (hasLines) setDialog({ kind: 'payment' })
          return
        case 'F12':
          e.preventDefault()
          void reprintLast()
          return
      }
      const inOtherField = e.target !== searchInput.current && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      if (inOtherField || (searchInput.current?.value ?? '') !== '') return
      const b = k.lines[k.selected]
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault()
          update((x) => selectLine(x, e.key === 'ArrowUp' ? -1 : 1))
          return
        case '+':
        case '-':
          if (!b) return
          e.preventDefault()
          if (e.key === '-') update((x) => stepQty(x, x.selected, -1))
          else withStockCheck(productMap.get(b.productId), qtyInCart(k, b.productId) + 1, () => update((x) => stepQty(x, x.selected, 1)))
          return
        case 'Delete':
          if (!b) return
          e.preventDefault()
          update((x) => removeLine(x, x.selected))
          return
        case 'Escape':
          if (!hasLines) return
          e.preventDefault()
          setDialog({ kind: 'clear' })
          return
      }
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  })

  const pay = async ({ method, cash, attempt }: { method: 'tunai' | 'qris' | 'transfer' | 'edc'; cash: number | null; attempt: Attempt }) => {
    if (!settings.data) throw new Error('Pengaturan bengkel belum termuat.')
    const result = await paySale({
      cart,
      method,
      cashReceived: cash,
      attempt,
      creator: { id: profile.id, name: profile.nama },
      settings: settings.data,
      mechanic: mechanics.find((m) => m.id === cart.data.mechanicId) ?? null,
    })
    cart.clear()
    setDialog(null)
    setNotice({
      tone: 'info',
      text: `Nota ${result.number} ${result.offline ? 'tersimpan di laptop, dikirim otomatis saat online' : 'tersimpan'}${result.originalNumber ? ` (nomor diganti dari ${result.originalNumber})` : ''}.${result.receipt.method === 'tunai' ? ` Kembali ${formatRupiah(result.receipt.change)}.` : ''}`,
    })
    focusSearch()
    // Kalau printer bermasalah, nota tetap tersimpan dan bisa dicetak ulang dengan F12 (PRD 4.10).
    void printReceipt(result.receipt, settings.data.ukuran_kertas === 58 ? 58 : 80, logo, settings.data.jumlah_salinan)
  }

  return (
    <div className="grid h-[calc(100dvh-4.5rem)] grid-cols-[minmax(0,1fr)_360px] gap-6">
      <section className="flex min-h-0 flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Kasir</h1>
          {!online && <span className="text-sm text-muted-foreground">Offline: nota disimpan di laptop dan dikirim otomatis saat online.</span>}
        </div>
        <div className="mt-4 flex gap-2">
          <SearchBox
            ref={searchInput}
            query={query}
            setQuery={setQuery}
            products={products}
            onPick={addToCart}
            disabled={dialog !== null || catalogOpen}
            placeholder="Scan barcode, atau ketik nama, merek, kode part (F2)"
            className="min-w-0 flex-1"
          />
          <Button variant="outline" className="h-12 shrink-0" onClick={() => setCatalogOpen(true)}>
            Katalog <span className="text-muted-foreground">F3</span>
          </Button>
        </div>
        <EmptyLocalCopyNotice online={online} />
        <CartTable
          lines={cart.lines}
          calc={calc}
          selected={cart.selected}
          flash={flash}
          onSelectLine={(i) => update((k) => ({ ...k, selected: i }))}
          openQty={(i) => {
            update((k) => ({ ...k, selected: i }))
            setDialog({ kind: 'qty' })
          }}
          editPrice={(i, price) => update((k) => setServicePrice(k, i, price))}
          remove={(i) => update((k) => removeLine(k, i))}
          finishPriceEdit={focusSearch}
          lineCosts={cart.lines.map((b) => lineCogs(b, productMap.get(b.productId)?.avgCost))}
          setDiscount={(i, d) => update((k) => setLineDiscount({ ...k, selected: i }, i, d))}
          stepUp={(i) => {
            const k = useCart.getState()
            const b = k.lines[i]
            if (!b) return
            update((x) => ({ ...x, selected: i }))
            withStockCheck(productMap.get(b.productId), qtyInCart(k, b.productId) + 1, () => update((x) => stepQty(x, i, 1)))
            focusSearch()
          }}
          stepDown={(i) => {
            update((x) => stepQty({ ...x, selected: i }, i, -1))
            focusSearch()
          }}
        />
      </section>

      <SummaryPanel
        calc={calc}
        lineCount={cart.lines.length}
        data={cart.data}
        mechanicName={mechanics.find((m) => m.id === cart.data.mechanicId)?.name ?? null}
        hasInactive={hasInactive}
        notice={notice}
        open={(kind) => (kind === 'lineDiscount' ? focusLineDiscount(cart.selected) : setDialog({ kind }))}
        hold={() => void hold()}
        reprint={() => void reprintLast()}
        hasSelection={Boolean(selected)}
      />

      <Dialog open={dialog !== null && dialog.kind !== 'barcode'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent finalFocus={searchInput} className={dialog?.kind === 'payment' ? 'sm:max-w-lg' : undefined}>
          {dialog?.kind === 'qty' && selected && (
            <QtyDialog
              lines={selected}
              stock={selected.type === 'part' ? (productMap.get(selected.productId)?.stock ?? null) : null}
              cancel={closeDialog}
              save={(qty) => {
                update((k) => changeQty(k, k.selected, qty) ?? k)
                closeDialog()
              }}
            />
          )}
          {dialog?.kind === 'saleDiscount' && (
            <DiscountDialog
              title="Diskon nota"
              base={calc.subtotal}
              discount={cart.saleDiscount}
              totalCogs={null}
              cancel={closeDialog}
              save={(d) => {
                update((k) => ({ ...k, saleDiscount: d }))
                closeDialog()
              }}
            />
          )}
          {dialog?.kind === 'data' && (
            <SaleInfoDialog
              data={cart.data}
              mechanic={mechanics}
              cancel={closeDialog}
              save={(data) => {
                update((k) => ({ ...k, data }))
                closeDialog()
              }}
            />
          )}
          {dialog?.kind === 'held' && (
            <HeldCartsDialog
              cancel={closeDialog}
              open={async (id) => {
                const held = await openHeldCart(id)
                if (held) {
                  cart.replaceCart(refreshPrices(held.cart, productMap))
                  setNotice({ tone: 'info', text: `Keranjang ${held.label} dibuka lagi.` })
                }
                closeDialog()
              }}
            />
          )}
          {dialog?.kind === 'payment' && settings.data && (
            <PaymentDialog total={calc.total} prefix={settings.data.awalan_nota} cancel={closeDialog} pay={pay} />
          )}
          {dialog?.kind === 'clear' && (
            <ClearCartDialog
              count={cart.lines.length}
              cancel={closeDialog}
              clear={() => {
                cart.clear()
                closeDialog()
              }}
            />
          )}
          {dialog?.kind === 'stock' && (
            <StockDialog
              name={fullName(dialog.products)}
              stock={dialog.products.stock ?? 0}
              unit={dialog.products.unit}
              qty={dialog.qty}
              cancel={closeDialog}
              proceed={() => {
                const proceed = dialog.proceed
                setDialog(null)
                proceed()
                focusSearch()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CatalogDialog
        open={catalogOpen}
        products={products}
        onPick={(p) => addToCart(p, true)}
        onDecrease={(p) => update((k) => decreaseProduct(k, p.id))}
        cartQty={cartQty}
        blocked={dialog !== null}
        onClose={() => {
          setCatalogOpen(false)
          focusSearch()
        }}
      />

      <NewBarcodeDialog code={dialog?.kind === 'barcode' ? dialog.code : null} list={products} onClose={closeDialog} />
    </div>
  )
}

function CartTable({
  lines,
  calc,
  selected,
  flash,
  onSelectLine,
  openQty,
  editPrice,
  remove,
  finishPriceEdit,
  stepUp,
  stepDown,
  lineCosts,
  setDiscount,
}: {
  lines: CartLine[]
  calc: SaleCalculation
  selected: number
  flash: { key: string; n: number } | null
  onSelectLine: (i: number) => void
  openQty: (i: number) => void
  editPrice: (i: number, price: number) => void
  remove: (i: number) => void
  finishPriceEdit: () => void
  /** Tombol + dan − di kolom Qty (R54), sama dengan tombol + dan − di keyboard. */
  stepUp: (i: number) => void
  stepDown: (i: number) => void
  /** HPP x qty tiap baris part (null untuk jasa), untuk peringatan diskon di bawah harga beli. */
  lineCosts: (number | null)[]
  setDiscount: (i: number, d: Discount) => void
}) {
  if (lines.length === 0) {
    return (
      <div className="mt-4 flex flex-1 items-start rounded-md border border-dashed border-input p-6 text-muted-foreground">
        Keranjang kosong. Scan barcode part, atau cari part dan jasa di kolom atas. Keranjang yang ditahan dibuka dengan F6.
      </div>
    )
  }
  return (
    <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-card">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-card">
          <tr className="h-11 text-sm text-muted-foreground">
            <th className="w-8 px-2 text-right font-normal">#</th>
            <th className="px-2 font-normal">Produk</th>
            <th className="w-[136px] px-0 text-center font-normal">Qty</th>
            <th className="w-[100px] px-2 text-right font-normal">Harga</th>
            <th className="w-[108px] px-2 text-right font-normal">Diskon</th>
            <th className="w-[104px] px-2 text-right font-normal">Jumlah</th>
            <th className="w-11" />
          </tr>
        </thead>
        <tbody>
          {lines.map((b, i) => {
            const h = calc.lines[i]
            const active = i === selected
            const cost = lineCosts[i]
            const belowCost = b.discount !== null && cost !== null && h.net < cost
            return (
              <tr
                key={flash?.key === b.key ? `${b.key}-${flash.n}` : b.key}
                data-terpilih={active || undefined}
                onClick={() => onSelectLine(i)}
                className={cn('border-t border-rule', active && 'bg-active', flash?.key === b.key && 'animate-flash')}
              >
                <td className="px-2 py-2 text-right align-top text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2 align-top">
                  <span className={cn('block', b.inactive && 'text-muted-foreground line-through')}>{fullName(b)}</span>
                  <span className="block text-sm text-muted-foreground">{b.type === 'jasa' ? 'Jasa' : b.unit}</span>
                  {b.oldPrice !== null && (
                    <span className="block text-sm text-pill-warning-ink">
                      Harga berubah: {formatRupiah(b.oldPrice)} → {formatRupiah(b.price)}
                    </span>
                  )}
                  {b.inactive && <span className="block text-sm text-negative">Produk sudah nonaktif. Hapus dari keranjang sebelum bayar.</span>}
                  {belowCost && (
                    <span className="mt-1 inline-flex rounded-sm bg-pill-warning px-1.5 text-sm text-pill-warning-ink">Di bawah harga beli ({formatRupiah(cost)})</span>
                  )}
                </td>
                <td className="px-0 py-0.5 align-top">
                  <div className="flex items-center justify-center">
                    <Button variant="ghost" size="icon" aria-label={`Kurangi qty ${b.name}`} title="Kurangi qty (−)" disabled={b.qty - 1 < 1} onClick={() => stepDown(i)}>
                      <Minus className="size-4" strokeWidth={2} />
                    </Button>
                    <button type="button" className="min-w-8 rounded-sm px-0.5 text-center tabular-nums underline-offset-4 hover:underline" onClick={() => openQty(i)} title="Ubah qty (F7)">
                      {formatQty(b.qty)}
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`Tambah qty ${b.name}`} title="Tambah qty (+)" onClick={() => stepUp(i)}>
                      <Plus className="size-4" strokeWidth={2} />
                    </Button>
                  </div>
                </td>
                <td className="px-2 py-2 text-right align-top">
                  {b.type === 'jasa' ? (
                    <ServicePrice price={b.price} update={(v) => editPrice(i, v)} onDone={finishPriceEdit} />
                  ) : (
                    formatNumber(b.price)
                  )}
                </td>
                <td className="px-2 py-1 align-top">
                  <LineDiscountInput index={i} name={b.name} discount={b.discount} base={h.amount} amount={h.discount} save={(d) => setDiscount(i, d)} onDone={finishPriceEdit} />
                </td>
                <td className="px-2 py-2 text-right align-top">{formatNumber(h.net)}</td>
                <td className="px-1 py-1 align-top">
                  <Button variant="ghost" size="icon" aria-label={`Hapus ${b.name}`} title="Hapus baris (Delete)" onClick={() => remove(i)}>
                    <X className="size-4" strokeWidth={1.75} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Diskon per baris diisi langsung di tabel (R55): angka = rupiah untuk total baris, akhiran % = persen.
 * Diterapkan saat Enter, Tab, atau pindah fokus; Esc membatalkan. Isian yang salah tidak diterapkan dan
 * pesannya tampil di bawah isian; diskon lama tetap berlaku.
 */
function LineDiscountInput({
  index,
  name,
  discount,
  base,
  amount,
  save,
  onDone,
}: {
  index: number
  name: string
  discount: Discount
  base: number
  /** Rupiah diskon hasil hitungan, ditampilkan untuk diskon persen. */
  amount: number
  save: (d: Discount) => void
  onDone: () => void
}) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return true
    const result = parseLineDiscount(text, base)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    save(result.discount)
    setText(null)
    setError(null)
    return true
  }
  return (
    <div className="flex flex-col items-end">
      <Input
        data-discount-line={index}
        aria-label={`Diskon ${name}`}
        aria-invalid={Boolean(error)}
        placeholder="–"
        className={cn('h-9 w-full text-right', error && 'border-destructive')}
        value={text ?? discountText(discount)}
        onFocus={(e) => {
          if (text === null) setText(discountText(discount))
          e.target.select()
        }}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (commit()) onDone()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setText(null)
            setError(null)
            onDone()
          }
        }}
      />
      {error ? (
        <span role="alert" className="mt-0.5 text-right text-sm leading-4 text-destructive">
          {error}
        </span>
      ) : (
        discount?.kind === 'persen' && amount > 0 && <span className="mt-0.5 text-sm text-muted-foreground tabular-nums">-{formatNumber(amount)}</span>
      )}
    </div>
  )
}

/** Harga jasa bisa diubah langsung di keranjang tanpa konfirmasi, termasuk Rp 0 (PRD 4.6, R5). */
function ServicePrice({ price, update, onDone }: { price: number; update: (v: number) => void; onDone: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const save = () => {
    const v = parseRupiah(text ?? '')
    if (v !== null && v !== price) update(v)
    setText(null)
  }
  return (
    <Input
      aria-label="Harga jasa"
      inputMode="numeric"
      className="h-9 w-[110px] text-right"
      value={text ?? formatNumber(price)}
      onFocus={(e) => {
        setText(formatNumber(price))
        e.target.select()
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
          onDone()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setText(null)
          onDone()
        }
      }}
    />
  )
}

function SummaryPanel({
  calc,
  lineCount,
  data,
  mechanicName,
  hasInactive,
  notice,
  open,
  hold,
  reprint,
  hasSelection,
}: {
  calc: SaleCalculation
  lineCount: number
  data: { plate: string; customer: string; serviceNote: string }
  mechanicName: string | null
  hasInactive: boolean
  notice: { tone: 'info' | 'error'; text: string } | null
  open: (kind: 'data' | 'qty' | 'lineDiscount' | 'saleDiscount' | 'payment' | 'clear') => void
  hold: () => void
  reprint: () => void
  hasSelection: boolean
}) {
  const empty = lineCount === 0
  const info: [string, string | null][] = [
    ['Nopol', data.plate || null],
    ['Pelanggan', data.customer || null],
    ['Mekanik', mechanicName],
    ['Catatan', data.serviceNote || null],
  ]
  const lineDiscountTotal = calc.lines.reduce((s, b) => s + b.discount, 0)
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-2">
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Data nota</h2>
          <Button variant="ghost" onClick={() => open('data')}>
            Ubah <span className="text-muted-foreground">F4</span>
          </Button>
        </div>
        <dl className="mt-1 grid grid-cols-[88px_minmax(0,1fr)] gap-y-1">
          {info.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn('truncate', !value && 'text-muted-foreground')}>{value ?? '–'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal ({lineCount} baris)</dt>
            <dd>{formatNumber(calc.subtotal)}</dd>
          </div>
          {lineDiscountTotal > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <dt>termasuk diskon baris</dt>
              <dd>-{formatNumber(lineDiscountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Diskon nota</dt>
            <dd>{calc.saleDiscount ? `-${formatNumber(calc.saleDiscount)}` : '–'}</dd>
          </div>
        </dl>
        <div className="mt-3 border-t border-rule pt-3">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-[30px] leading-9 font-bold tracking-tight">{formatRupiah(calc.total)}</p>
        </div>
        {calc.errorText && <Notice tone="error" className="mt-3">{calc.errorText}</Notice>}
        {hasInactive && <Notice tone="error" className="mt-3">Hapus produk nonaktif dari keranjang sebelum bayar.</Notice>}
        <Button size="lg" className="mt-4 h-14 w-full text-lg" disabled={empty || hasInactive || Boolean(calc.errorText)} onClick={() => open('payment')}>
          Bayar <span className="opacity-60">F9</span>
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!hasSelection} onClick={() => open('qty')}>
            Ubah qty <span className="text-muted-foreground">F7</span>
          </Button>
          <Button variant="outline" disabled={!hasSelection} onClick={() => open('lineDiscount')}>
            Diskon <span className="text-muted-foreground">F8</span>
          </Button>
          <Button variant="outline" disabled={empty} onClick={() => open('saleDiscount')}>
            Diskon nota <span className="text-muted-foreground">⇧F8</span>
          </Button>
          <Button variant="outline" onClick={hold} disabled={empty}>
            Tahan <span className="text-muted-foreground">F6</span>
          </Button>
          <Button variant="outline" onClick={reprint}>
            Cetak ulang <span className="text-muted-foreground">F12</span>
          </Button>
          <Button variant="outline" disabled={empty} onClick={() => open('clear')}>
            Kosongkan <span className="text-muted-foreground">Esc</span>
          </Button>
        </div>
      </div>

      {notice && (
        <Notice tone={notice.tone} className="text-[15px]">
          {notice.text}
        </Notice>
      )}
    </aside>
  )
}
