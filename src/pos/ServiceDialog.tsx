import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber, parseRupiah } from '@/lib/format'
import { MANUAL_SERVICE_NAME_MAX } from '@/pos/cart'
import { CatalogDialog } from '@/pos/CatalogDialog'
import type { LocalProduct } from '@/products/product'

/**
 * Jendela Jasa di layar Kasir: daftar jasa dengan tampilan yang sama seperti Katalog, ditambah isian
 * jasa manual untuk jasa yang belum ada di menu Jasa. Jasa manual hanya tercatat di nota.
 */
export function ServiceDialog({
  open,
  services,
  onPick,
  onDecrease,
  onManual,
  onClose,
  blocked,
  cartQty,
}: {
  open: boolean
  services: LocalProduct[]
  onPick: (p: LocalProduct) => void
  onDecrease: (p: LocalProduct) => void
  /** Tambah jasa manual ke keranjang. */
  onManual: (name: string, price: number) => void
  onClose: () => void
  blocked: boolean
  cartQty: Map<string, number>
}) {
  return (
    <CatalogDialog
      open={open}
      title="Jasa"
      filterPlaceholder="Saring nama jasa"
      emptyText="Belum ada jasa. Tambahkan dari menu Jasa, atau isi jasa manual di atas."
      top={<ManualServiceForm onAdd={onManual} />}
      products={services}
      onPick={onPick}
      onDecrease={onDecrease}
      onClose={onClose}
      blocked={blocked}
      cartQty={cartQty}
    />
  )
}

function ManualServiceForm({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const fail = (message: string) => {
    setError(message)
    setAdded(null)
  }
  const submit = () => {
    const tidy = name.trim().replace(/\s+/g, ' ')
    const value = parseRupiah(price)
    if (!tidy) return fail('Isi nama jasa.')
    if (tidy.length > MANUAL_SERVICE_NAME_MAX) return fail(`Nama jasa paling panjang ${MANUAL_SERVICE_NAME_MAX} huruf.`)
    if (value === null) return fail('Isi tarif dengan angka. Boleh Rp 0.')
    onAdd(tidy, value)
    setName('')
    setPrice('')
    setError(null)
    setAdded(`${tidy} Rp ${formatNumber(value)} masuk keranjang.`)
    nameInput.current?.focus()
  }

  return (
    <form
      noValidate
      className="shrink-0 rounded-md border border-border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Jasa manual</span>
          <Input
            ref={nameInput}
            aria-invalid={Boolean(error) && !name.trim()}
            placeholder="Nama jasa, mis. Las knalpot"
            autoComplete="off"
            maxLength={MANUAL_SERVICE_NAME_MAX}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="flex w-[180px] flex-col gap-1">
          <span className="text-sm font-medium">Tarif</span>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">Rp</span>
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="pl-10 text-right"
              placeholder="0"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value)
                setError(null)
              }}
              onBlur={() => {
                const v = parseRupiah(price)
                if (v !== null) setPrice(formatNumber(v))
              }}
            />
          </div>
        </label>
        <Button type="submit" variant="outline">
          Tambah
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      ) : (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {added ?? 'Untuk jasa yang belum ada di daftar. Hanya tercatat di nota, tidak masuk menu Jasa.'}
        </p>
      )}
    </form>
  )
}
