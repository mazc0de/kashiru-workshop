import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatQty, formatRupiah } from '@/lib/format'
import { catalogCategories, catalogItems } from '@/pos/catalog'
import { stockStatus, type LocalProduct } from '@/products/product'
import { StockStatusPill } from '@/products/StockStatusPill'

/**
 * Katalog di layar Kasir (R53): tab kategori, kotak produk urut nama, klik kotak menambah 1 ke keranjang
 * (sama seperti scan). Jendela tetap terbuka supaya beberapa barang bisa dipilih; Selesai atau × menutupnya.
 * Jendela Jasa memakai tampilan yang sama untuk daftar jasa, ditambah isian jasa manual di atasnya.
 */
const NO_QTY = new Map<string, number>()

export function CatalogDialog({
  open,
  title = 'Katalog',
  filterPlaceholder = 'Saring nama, merek, kode part',
  emptyText = 'Belum ada produk di laptop ini.',
  top,
  products,
  onPick,
  onDecrease,
  onClose,
  blocked,
  cartQty,
  otherQty,
}: {
  open: boolean
  title?: string
  filterPlaceholder?: string
  /** Teks saat belum ada produk sama sekali. */
  emptyText?: string
  /** Isi tambahan di bawah judul, mis. isian jasa manual. */
  top?: ReactNode
  /** Kurangi 1 dari keranjang; di qty 1 barang keluar dari keranjang. */
  onDecrease: (p: LocalProduct) => void
  products: LocalProduct[]
  /** Qty tiap produk yang sudah ada di keranjang, untuk penanda di kotaknya. */
  cartQty: Map<string, number>
  /** Qty tiap produk di keranjang yang ditunda, ditampilkan di samping stok (stok tidak ditahan, ADR 0003). */
  otherQty?: Map<string, number>
  onPick: (p: LocalProduct) => void
  onClose: () => void
  /** Ada dialog lain di atas katalog (mis. peringatan stok); katalog tidak ikut tertutup. */
  blocked: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !blocked && onClose()}>
      <DialogContent showCloseButton={false} className="flex h-[min(760px,calc(100dvh-4rem))] max-w-[calc(100%-4rem)] flex-col gap-4 sm:max-w-[1100px]">
        {open && (
          <CatalogBody
            title={title}
            filterPlaceholder={filterPlaceholder}
            emptyText={emptyText}
            top={top}
            products={products}
            onPick={onPick}
            onDecrease={onDecrease}
            onClose={onClose}
            cartQty={cartQty}
            otherQty={otherQty ?? NO_QTY}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CatalogBody({
  title,
  filterPlaceholder,
  emptyText,
  top,
  products,
  onPick,
  onDecrease,
  onClose,
  cartQty,
  otherQty,
}: {
  title: string
  filterPlaceholder: string
  emptyText: string
  top: ReactNode
  products: LocalProduct[]
  onPick: (p: LocalProduct) => void
  onDecrease: (p: LocalProduct) => void
  onClose: () => void
  cartQty: Map<string, number>
  otherQty: Map<string, number>
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; n: number } | null>(null)
  const categories = useMemo(() => catalogCategories(products), [products])
  const items = useMemo(() => catalogItems(products, categoryId, query), [products, categoryId, query])
  const total = categories.reduce((s, c) => s + c.count, 0)
  // Kotak yang baru diklik ditandai sebentar sebagai tanda barang masuk keranjang.
  useEffect(() => {
    if (!picked) return
    const t = window.setTimeout(() => setPicked(null), 700)
    return () => window.clearTimeout(t)
  }, [picked])

  const add = (p: LocalProduct) => {
    setPicked((x) => ({ id: p.id, n: (x?.n ?? 0) + 1 }))
    onPick(p)
  }

  const tabs: { id: string | null; name: string; count: number }[] = [{ id: null, name: 'Semua', count: total }, ...categories]

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        <div className="relative ml-auto w-[320px] max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label={`Saring ${title.toLowerCase()}`} placeholder={filterPlaceholder} className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {/* Tombol tutup sejajar dengan kolom saring (revisi UI). */}
        <Button variant="ghost" size="icon" aria-label={`Tutup ${title.toLowerCase()}`} title="Tutup" onClick={onClose}>
          <X className="size-5" strokeWidth={1.75} />
        </Button>
      </div>

      {top}

      <div role="tablist" aria-label="Kategori" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id ?? 'semua'}
            type="button"
            role="tab"
            aria-selected={categoryId === t.id}
            onClick={() => setCategoryId(t.id)}
            className={cn(
              '-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[15px] whitespace-nowrap',
              categoryId === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.name}
            <span className="text-sm text-muted-foreground tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-6 text-muted-foreground">{products.length === 0 ? emptyText : 'Tidak ada yang cocok dengan saringan ini.'}</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {items.map((p) => {
              const status = p.type === 'part' && p.stock !== null ? stockStatus(p.stock, p.minStock) : null
              const inCart = cartQty.get(p.id) ?? 0
              return (
                <li
                  key={p.id}
                  className={cn(
                    'flex h-full flex-col overflow-hidden rounded-md border bg-card',
                    picked?.id === p.id ? 'border-foreground' : inCart > 0 ? 'border-foreground/40' : 'border-border',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => add(p)}
                    title="Tambah 1 ke layar"
                    className={cn(
                      'flex min-h-[104px] flex-1 flex-col p-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                      picked?.id === p.id && 'bg-active',
                    )}
                  >
                    <span className="line-clamp-2 font-medium">{p.name}</span>
                    {p.brand && <span className="truncate text-sm text-muted-foreground">{p.brand}</span>}
                    <span className="mt-auto pt-2 font-semibold tabular-nums">{formatRupiah(p.sellingPrice)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      {p.type === 'jasa' ? (
                        'Jasa'
                      ) : (
                        <>
                          <span className={cn('tabular-nums', (p.stock ?? 0) < 0 && 'text-negative')}>
                            Stok {formatQty(p.stock ?? 0)} {p.unit}
                          </span>
                          {(otherQty.get(p.id) ?? 0) > 0 && <span className="tabular-nums">{formatQty(otherQty.get(p.id)!)} di keranjang</span>}
                          {status && status !== 'safe' && <StockStatusPill stock={p.stock ?? 0} minStock={p.minStock} />}
                        </>
                      )}
                    </span>
                  </button>
                  {/* Penanda qty di layar dengan tombol kurang dan tambah (R54). */}
                  <div className="flex items-center justify-between border-t border-rule">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Kurangi ${p.name}`}
                      disabled={inCart === 0}
                      onClick={() => onDecrease(p)}
                    >
                      <Minus className="size-4" strokeWidth={2} />
                    </Button>
                    <span
                      aria-live="polite"
                      aria-label={`${formatQty(inCart)} di layar`}
                      className={cn('min-w-10 text-center text-lg font-semibold tabular-nums', inCart === 0 && 'font-normal text-muted-foreground')}
                    >
                      {formatQty(inCart)}
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Tambah ${p.name}`} onClick={() => add(p)}>
                      <Plus className="size-4" strokeWidth={2} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">
          {cartQty.size > 0
            ? `Di layar: ${cartQty.size} produk, ${formatQty([...cartQty.values()].reduce((s, q) => s + q, 0))} qty. `
            : 'Layar masih kosong. '}
          Klik kotak atau + untuk menambah 1, − untuk mengurangi.
        </span>
        <Button onClick={onClose}>Selesai</Button>
      </div>
    </>
  )
}
