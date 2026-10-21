import { useMemo, useState } from 'react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateTime, formatNumber, formatQty, formatRupiah } from '@/lib/format'
import type { LocalMechanic } from '@/lib/localCopy'
import { calculateSale } from '@/pos/calculate'
import { toCalcLines } from '@/pos/cart'
import type { SavedCart } from '@/pos/openCarts'
import { fullName } from '@/products/product'

/**
 * Daftar keranjang yang ditunda (R61, R63): kiri daftar keranjang, kanan isi keranjang yang dipilih, hanya
 * untuk dilihat. Buka keranjang memindahkan isinya ke layar Kasir untuk ditambah barang atau dibayar.
 */
export function CartsDialog({
  carts,
  mechanics,
  open,
  close,
}: {
  /** Urut waktu dibuat. */
  carts: SavedCart[]
  mechanics: LocalMechanic[]
  open: (id: string) => void
  close: () => void
}) {
  const [pickedId, setPickedId] = useState(() => carts[0]?.id)
  const summaries = useMemo(() => carts.map((k) => ({ cart: k, calc: calculateSale(toCalcLines(k), k.saleDiscount) })), [carts])
  const picked = summaries.find((s) => s.cart.id === pickedId)

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Keranjang{carts.length > 0 && ` (${carts.length})`}</DialogTitle>
        <DialogDescription>Pilih keranjang untuk melihat isinya, lalu buka untuk menambah barang atau membayar.</DialogDescription>
      </DialogHeader>

      {carts.length === 0 ? (
        <p className="py-6 text-muted-foreground">Belum ada keranjang. Isi barang di layar Kasir, lalu tekan Tambah ke keranjang.</p>
      ) : (
        <div className="grid h-[min(440px,calc(100dvh-16rem))] grid-cols-[240px_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
          <ul role="listbox" aria-label="Daftar keranjang" className="overflow-y-auto border-r border-border">
            {summaries.map(({ cart: k, calc }) => (
              <li key={k.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={k.id === pickedId}
                  onClick={() => setPickedId(k.id)}
                  className={cn('flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/40', k.id === pickedId && 'bg-active hover:bg-active')}
                >
                  <span className="w-full truncate font-medium">{k.data.description}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {k.lines.length} baris · {formatNumber(calc.total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {picked ? <CartDetail cart={picked.cart} calc={picked.calc} mechanic={mechanics.find((m) => m.id === picked.cart.data.mechanicId)?.name ?? null} /> : <div />}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Tutup
        </Button>
        {picked && (
          <Button type="button" autoFocus onClick={() => open(picked.cart.id)}>
            Buka keranjang
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

function CartDetail({ cart: k, calc, mechanic }: { cart: SavedCart; calc: ReturnType<typeof calculateSale>; mechanic: string | null }) {
  const identity = [k.data.description, k.data.plate, k.data.customer].map((x) => x.trim()).filter(Boolean)
  const info = [mechanic && `Mekanik ${mechanic}`, `dibuat ${formatDateTime(k.createdAt).slice(-5)}`].filter(Boolean).join(' · ')
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="font-medium">{identity.join(' · ')}</p>
        <p className="text-sm text-muted-foreground">{info}</p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-4">
        {k.lines.map((b, i) => (
          <li key={b.key} className="flex items-start justify-between gap-4 border-b border-rule py-2 last:border-b-0">
            <span className="min-w-0">
              <span className="block truncate">{fullName(b)}</span>
              <span className="block text-sm text-muted-foreground tabular-nums">
                {formatQty(b.qty)} × {formatNumber(b.price)}
                {calc.lines[i].discount > 0 && ` · diskon ${formatNumber(calc.lines[i].discount)}`}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatNumber(calc.lines[i].net)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-3">
        {calc.saleDiscount > 0 && (
          <p className="flex justify-between text-sm text-muted-foreground">
            <span>Diskon nota</span>
            <span className="tabular-nums">-{formatNumber(calc.saleDiscount)}</span>
          </p>
        )}
        <p className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatRupiah(calc.total)}</span>
        </p>
      </div>
    </div>
  )
}
