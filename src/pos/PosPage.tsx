import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
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
  toCalcLines,
  qtyInCart,
  refreshPrices,
  pricesChanged,
  addProduct,
  setServicePrice,
  changeQty,
  decreaseProduct,
  addManualService,
  type Cart,
  type CartLine,
} from '@/pos/cart'
import { currentDraft, importHeldCarts, useCart } from '@/pos/cartStore'
import { paySale, lastReceipt, type Attempt } from '@/pos/checkout'
import { CartsDialog } from '@/pos/CartsDialog'
import { CatalogDialog } from '@/pos/CatalogDialog'
import { discountText, parseLineDiscount } from '@/pos/discountInput'
import { descriptionError, listedCarts, qtyInSavedCarts, savedCartsQty, suggestedDescription, tidyDescription } from '@/pos/openCarts'
import { PaymentDialog } from '@/pos/PaymentDialog'
import { ServiceDialog } from '@/pos/ServiceDialog'
import { SaleInfoDialog, DiscountDialog, ClearCartDialog, QtyDialog, StockDialog, SaveCartDialog } from '@/pos/PosDialogs'
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
  | { kind: 'payment' }
  | { kind: 'clear' }
  | { kind: 'stock'; products: LocalProduct; qty: number; others: { label: string; qty: number }[]; proceed: () => void }
  | { kind: 'barcode'; code: string }
  | { kind: 'carts' }
  /** Tambah ke keranjang; `thenOpen` = keranjang yang dibuka setelah isian layar ditambahkan. */
  | { kind: 'save'; thenOpen: string | null }

let keyCounter = 0
const newKey = () => `baris-${Date.now()}-${++keyCounter}`

function PosScreen() {
  const profile = useProfile()
  const settings = useSettings()
  const logo = useLogo(settings.data?.logo_url)
  const online = useOnline()
  // `cart` adalah isian layar; keranjang yang ditunda ada di `saved` (R63).
  const cart = useCart((s) => s.draft)
  const saved = useCart((s) => s.saved)
  const { update, save, open, clear } = useCart.getState()
  const listed = useMemo(() => listedCarts({ draft: cart, saved }), [cart, saved])
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const mechanics = useLiveQuery(listMechanics, [], [])
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  // Katalog hanya part; jasa dipilih dari jendela Jasa.
  const parts = useMemo(() => products.filter((p) => p.type === 'part'), [products])
  const services = useMemo(() => products.filter((p) => p.type === 'jasa'), [products])
  const productOf = (b: CartLine) => (b.productId === null ? undefined : productMap.get(b.productId))
  const cartQty = useMemo(() => {
    const m = new Map<string, number>()
    // Jasa manual tidak punya produk; kuncinya baris itu sendiri, supaya tetap terhitung di ringkasan layar.
    for (const b of cart.lines) m.set(b.productId ?? b.key, (m.get(b.productId ?? b.key) ?? 0) + b.qty)
    return m
  }, [cart.lines])
  const otherQty = useMemo(() => savedCartsQty({ draft: cart, saved }), [cart, saved])

  const [dialog, setDialog] = useState<Dialog | null>(null)
  // Katalog (R53) terpisah dari dialog lain, supaya peringatan stok bisa muncul di atasnya.
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)
  const pickerOpen = catalogOpen || serviceOpen
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const calc = useMemo(() => calculateSale(toCalcLines(cart), cart.saleDiscount), [cart])
  const selected: CartLine | undefined = cart.lines[cart.selected]
  const hasInactive = cart.lines.some((b) => b.inactive)

  // Keranjang ditahan dari versi sebelumnya masuk ke daftar keranjang.
  useEffect(() => {
    void importHeldCarts()
  }, [])

  const focusSearch = useCallback(() => requestAnimationFrame(() => searchInput.current?.focus()), [])
  /** Tombol Diskon: kursor ke isian diskon baris itu, tanpa jendela (R55). */
  const focusLineDiscount = (i: number) =>
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-discount-line="${i}"]`)?.focus())
  const closeDialog = useCallback(() => {
    setDialog(null)
    focusSearch()
  }, [focusSearch])

  /**
   * Qty part yang melebihi stok sistem meminta konfirmasi dulu; stok boleh minus (PRD 4.6). Qty part yang
   * sama di keranjang yang ditunda ikut dihitung, tetapi stok tidak ditahan (ADR 0003).
   */
  const withStockCheck = (p: LocalProduct | undefined, newQty: number, proceed: () => void) => {
    if (p && p.type === 'part' && p.stock !== null) {
      const others = qtyInSavedCarts(useCart.getState(), p.id)
      if (newQty + others.reduce((t, o) => t + o.qty, 0) > p.stock) {
        playError()
        setDialog({ kind: 'stock', products: p, qty: newQty, others, proceed })
        return
      }
    }
    proceed()
  }

  const addToCart = (p: LocalProduct, fromPicker = false) => {
    withStockCheck(p, qtyInCart(currentDraft(), p.id) + 1, () => {
      const key = newKey()
      update((k) => addProduct(k, p, key))
      const onSaved = currentDraft()
      setFlash({ key: onSaved.lines[onSaved.selected]?.key ?? key, n: Date.now() })
      playSuccess()
      setNotice(null)
      setDialog(null)
      // Dari Katalog atau Jasa, jendelanya tetap terbuka dan fokus tidak dipindah ke kolom cari.
      if (fromPicker) return
      setQuery('')
      focusSearch()
    })
  }

  // Scan menambah part ke layar; barcode yang sama menambah qty (PRD 4.8).
  useBarcodeScanner((code) => {
    const p = findByBarcode(products, code)
    if (p) addToCart(p, pickerOpen)
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

  /** Harga part diperbarui ke harga terbaru di master; dilewati selama salinan produk belum termuat. */
  const refresh = (k: Cart) => (products.length ? refreshPrices(k, productMap) : k)

  /** Buka keranjang: layar yang masih berisi barang ditambahkan ke keranjang dulu (R63). */
  const openSaved = (id: string) => {
    if (currentDraft().lines.length > 0) {
      setDialog({ kind: 'save', thenOpen: id })
      return
    }
    const label = useCart.getState().saved.find((k) => k.id === id)?.data.description
    open(id, refresh)
    setNotice({ tone: 'info', text: `Keranjang ${label} dibuka. Tambah barang lalu Bayar, atau Tambah ke keranjang lagi.` })
    setQuery('')
    closeDialog()
  }

  /** Tambah ke keranjang dengan keterangan yang sudah diperiksa, lalu buka keranjang lain kalau diminta. */
  const saveToCart = (description: string, thenOpen: string | null) => {
    save(description)
    setNotice({ tone: 'info', text: `Ditambahkan ke keranjang ${tidyDescription(description)}. Layar siap untuk pelanggan berikutnya.` })
    setQuery('')
    if (thenOpen) openSaved(thenOpen)
    else closeDialog()
  }

  /** Bayar: harga diperiksa sekali lagi. Kalau ada yang berubah, keranjang diperbarui dan kasir memeriksanya dulu. */
  const openPayment = () => {
    if (products.length && pricesChanged(cart, productMap)) {
      update((k) => refreshPrices(k, productMap))
      setNotice({ tone: 'error', text: 'Harga atau status sebagian produk berubah. Periksa barang di layar, lalu tekan Bayar lagi.' })
      return
    }
    setDialog({ kind: 'payment' })
  }

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
    clear()
    setDialog(null)
    setNotice({
      tone: 'info',
      text: `Nota ${result.number} ${result.offline ? 'tersimpan di laptop, dikirim otomatis saat online' : 'tersimpan'}${result.originalNumber ? ` (nomor diganti dari ${result.originalNumber})` : ''}.${result.receipt.method === 'tunai' ? ` Kembali ${formatRupiah(result.receipt.change)}.` : ''}`,
    })
    focusSearch()
    // Kalau printer bermasalah, nota tetap tersimpan dan bisa dicetak ulang lewat tombol Cetak ulang (PRD 4.10).
    void printReceipt(result.receipt, settings.data.ukuran_kertas === 58 ? 58 : 80, logo, settings.data.jumlah_salinan)
  }

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] flex-col gap-4">
      <header className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Kasir</h1>
        {!online && <span className="text-sm text-muted-foreground">Offline: nota disimpan di laptop dan dikirim otomatis saat online.</span>}
        <CartsButton count={listed.length} open={() => setDialog({ kind: 'carts' })} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="flex min-h-0 flex-col">
          <div className="flex gap-2">
            <SearchBox
              ref={searchInput}
              query={query}
              setQuery={setQuery}
              products={products}
              onPick={addToCart}
              disabled={dialog !== null || pickerOpen}
              placeholder="Scan barcode, atau ketik nama, merek, kode part"
              className="min-w-0 flex-1"
            />
            <Button variant="outline" className="h-12 shrink-0" onClick={() => setCatalogOpen(true)}>
              Katalog
            </Button>
            <Button variant="outline" className="h-12 shrink-0" onClick={() => setServiceOpen(true)}>
              Jasa
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
            setDiscount={(i, d) => update((k) => setLineDiscount({ ...k, selected: i }, i, d))}
            stepUp={(i) => {
              const k = currentDraft()
              const b = k.lines[i]
              if (!b) return
              update((x) => ({ ...x, selected: i }))
              withStockCheck(productOf(b), qtyInCart(k, b.productId) + 1, () => update((x) => stepQty(x, i, 1)))
              focusSearch()
            }}
            stepDown={(i) => {
              update((x) => stepQty({ ...x, selected: i }, i, -1))
              focusSearch()
            }}
          />
          {cart.lines.length > 0 && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" className="text-muted-foreground" onClick={() => setDialog({ kind: 'clear' })}>
                Kosongkan
              </Button>
            </div>
          )}
        </section>

        <SummaryPanel
          calc={calc}
          lineCount={cart.lines.length}
          data={cart.data}
          mechanicName={mechanics.find((m) => m.id === cart.data.mechanicId)?.name ?? null}
          hasInactive={hasInactive}
          notice={notice}
          open={(kind) =>
            kind === 'lineDiscount'
              ? focusLineDiscount(cart.selected)
              : kind === 'payment'
                ? openPayment()
                : kind === 'save'
                  ? setDialog({ kind: 'save', thenOpen: null })
                  : setDialog({ kind })
          }
          reprint={() => void reprintLast()}
          hasSelection={Boolean(selected)}
        />

      </div>

      <Dialog open={dialog !== null && dialog.kind !== 'barcode'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          finalFocus={searchInput}
          className={dialog?.kind === 'payment' ? 'sm:max-w-lg' : dialog?.kind === 'carts' ? 'sm:max-w-3xl' : undefined}
        >
          {dialog?.kind === 'carts' && (
            <CartsDialog carts={listed} mechanics={mechanics} open={openSaved} close={closeDialog} />
          )}
          {dialog?.kind === 'qty' && selected && (
            <QtyDialog
              lines={selected}
              stock={selected.type === 'part' ? (productOf(selected)?.stock ?? null) : null}
              otherQty={selected.productId ? (otherQty.get(selected.productId) ?? 0) : 0}
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
          {dialog?.kind === 'save' && (
            <SaveCartDialog
              lineCount={cart.lines.length}
              suggestion={suggestedDescription(cart)}
              beforeOpening={dialog.thenOpen ? (saved.find((k) => k.id === dialog.thenOpen)?.data.description ?? null) : null}
              check={(text) => descriptionError(useCart.getState(), text)}
              cancel={closeDialog}
              save={(description) => saveToCart(description, dialog.thenOpen)}
            />
          )}
          {dialog?.kind === 'payment' && settings.data && (
            <PaymentDialog total={calc.total} prefix={settings.data.awalan_nota} cancel={closeDialog} pay={pay} />
          )}
          {dialog?.kind === 'clear' && (
            <ClearCartDialog
              count={cart.lines.length}
              fromCart={cart.fromCart ? tidyDescription(cart.data.description) || null : null}
              cancel={closeDialog}
              clear={() => {
                clear()
                setNotice(null)
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
              others={dialog.others}
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
        products={parts}
        onPick={(p) => addToCart(p, true)}
        onDecrease={(p) => update((k) => decreaseProduct(k, p.id))}
        cartQty={cartQty}
        otherQty={otherQty}
        blocked={dialog !== null}
        onClose={() => {
          setCatalogOpen(false)
          focusSearch()
        }}
      />

      <ServiceDialog
        open={serviceOpen}
        services={services}
        onPick={(p) => addToCart(p, true)}
        onDecrease={(p) => update((k) => decreaseProduct(k, p.id))}
        onManual={(name, price) => {
          const key = newKey()
          update((k) => addManualService(k, name, price, key) ?? k)
          const onSaved = currentDraft()
          setFlash({ key: onSaved.lines[onSaved.selected]?.key ?? key, n: Date.now() })
          playSuccess()
          setNotice(null)
        }}
        cartQty={cartQty}
        blocked={dialog !== null}
        onClose={() => {
          setServiceOpen(false)
          focusSearch()
        }}
      />

      <NewBarcodeDialog code={dialog?.kind === 'barcode' ? dialog.code : null} list={products} onClose={closeDialog} />
    </div>
  )
}

/** Ikon keranjang di kanan atas (R61), dengan angka jumlah keranjang yang ditunda seperti di marketplace. */
function CartsButton({ count, open }: { count: number; open: () => void }) {
  return (
    <Button variant="outline" size="icon" className="relative ml-auto size-11" aria-label={`Keranjang, ${count} motor menunggu`} title="Keranjang" onClick={open}>
      <ShoppingCart className="size-5" strokeWidth={1.75} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1 text-xs font-semibold text-white tabular-nums">
          {count}
        </span>
      )}
    </Button>
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
  /** Tombol + dan − di kolom Qty (R54). */
  stepUp: (i: number) => void
  stepDown: (i: number) => void
  setDiscount: (i: number, d: Discount) => void
}) {
  if (lines.length === 0) {
    return (
      <div className="mt-4 flex flex-1 items-start rounded-md border border-dashed border-input p-6 text-muted-foreground">
        Belum ada barang. Scan barcode part, cari part dan jasa di kolom atas, atau buka Katalog dan Jasa.
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
                  <span className="block text-sm text-muted-foreground">{b.type === 'part' ? b.unit : b.productId === null ? 'Jasa manual' : 'Jasa'}</span>
                  {b.oldPrice !== null && (
                    <span className="block text-sm text-pill-warning-ink">
                      Harga berubah: {formatRupiah(b.oldPrice)} → {formatRupiah(b.price)}
                    </span>
                  )}
                  {b.inactive && <span className="block text-sm text-negative">Produk sudah nonaktif. Hapus barisnya sebelum bayar.</span>}
                </td>
                <td className="px-0 py-0.5 align-top">
                  <div className="flex items-center justify-center">
                    <Button variant="ghost" size="icon" aria-label={`Kurangi qty ${b.name}`} title="Kurangi qty" disabled={b.qty - 1 < 1} onClick={() => stepDown(i)}>
                      <Minus className="size-4" strokeWidth={2} />
                    </Button>
                    <button type="button" className="min-w-8 rounded-sm px-0.5 text-center tabular-nums underline-offset-4 hover:underline" onClick={() => openQty(i)} title="Ubah qty">
                      {formatQty(b.qty)}
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`Tambah qty ${b.name}`} title="Tambah qty" onClick={() => stepUp(i)}>
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
                  <Button variant="ghost" size="icon" aria-label={`Hapus ${b.name}`} title="Hapus baris" onClick={() => remove(i)}>
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
  reprint,
  hasSelection,
}: {
  calc: SaleCalculation
  lineCount: number
  data: { plate: string; customer: string; description: string; serviceNote: string }
  mechanicName: string | null
  hasInactive: boolean
  notice: { tone: 'info' | 'error'; text: string } | null
  open: (kind: 'data' | 'qty' | 'lineDiscount' | 'saleDiscount' | 'payment' | 'save') => void
  reprint: () => void
  hasSelection: boolean
}) {
  const empty = lineCount === 0
  const info: [string, string | null][] = [
    ['Nopol', data.plate || null],
    ['Pelanggan', data.customer || null],
    ['Keterangan', data.description || null],
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
            Ubah
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
        {hasInactive && <Notice tone="error" className="mt-3">Hapus produk nonaktif dari layar sebelum bayar.</Notice>}
        <Button size="lg" className="mt-4 h-14 w-full text-lg" disabled={empty || hasInactive || Boolean(calc.errorText)} onClick={() => open('payment')}>
          Bayar
        </Button>
        {/* Tambah ke keranjang (R63): isian layar ditunda dengan keterangan, lalu layar bersih. */}
        <Button variant="outline" size="lg" className="mt-2 h-12 w-full" disabled={empty} onClick={() => open('save')}>
          Tambah ke keranjang
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!hasSelection} onClick={() => open('qty')}>
            Ubah qty
          </Button>
          <Button variant="outline" disabled={!hasSelection} onClick={() => open('lineDiscount')}>
            Diskon
          </Button>
          <Button variant="outline" disabled={empty} onClick={() => open('saleDiscount')}>
            Diskon nota
          </Button>
          <Button variant="outline" onClick={reprint}>
            Cetak ulang
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
