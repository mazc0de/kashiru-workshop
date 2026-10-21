import { useState } from 'react'
import { cn } from 'cn'

import { CreatableSelect } from '@/components/CreatableSelect'
import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { unwrap } from '@/lib/errors'
import { formatQty, formatRupiah, parseQty, parseRupiah } from '@/lib/format'
import { db, type LocalMechanic } from '@/lib/localCopy'
import { useOnline } from '@/lib/online'
import { supabase } from '@/lib/supabase'
import { calculateDiscount, type Discount, type DiscountKind } from '@/pos/calculate'
import type { CartLine, SaleInfo } from '@/pos/cart'
import { formatPlate, plateKey } from '@/pos/plate'
import { fullName } from '@/products/product'

// Dialog di layar Kasir. Enter menyimpan dan Esc menutup, sebagai perilaku bawaan jendela, bukan pintasan.

/** Ubah qty baris terpilih (R21). Pecahan hanya untuk part bisa pecahan. */
export function QtyDialog({
  lines,
  stock,
  otherQty,
  save,
  cancel,
}: {
  lines: CartLine
  /** Stok di sistem untuk part, null untuk jasa. */
  stock: number | null
  /** Qty produk yang sama di keranjang yang ditunda, ikut dihitung untuk peringatan stok. */
  otherQty: number
  save: (qty: number) => void
  cancel: () => void
}) {
  const [text, setText] = useState(formatQty(lines.qty))
  const [acceptNegative, setAcceptNegative] = useState(false)
  const fractional = lines.type === 'part' && lines.allowsFraction
  const qty = parseQty(text)
  const errorText =
    qty === null || qty <= 0
      ? 'Isi qty lebih dari 0, paling banyak 2 angka di belakang koma'
      : !fractional && !Number.isInteger(qty)
        ? 'Qty harus bilangan bulat'
        : null
  const exceedsStock = !errorText && stock !== null && qty! + otherQty > stock
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (errorText) return
        if (exceedsStock && !acceptNegative) {
          setAcceptNegative(true)
          return
        }
        save(qty!)
      }}
    >
      <DialogHeader>
        <DialogTitle>Ubah qty</DialogTitle>
        <DialogDescription>{fullName(lines)}</DialogDescription>
      </DialogHeader>
      <Field id="new-qty" label={`Qty${lines.unit ? ` (${lines.unit})` : ''}`} error={text ? (errorText ?? undefined) : undefined}>
        <Input
          id="new-qty"
          autoFocus
          inputMode="decimal"
          className="w-36 text-right text-lg"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value)
            setAcceptNegative(false)
          }}
        />
      </Field>
      {exceedsStock && (
        <Notice tone="warning">
          Stok di sistem tinggal {formatQty(stock!)} {lines.unit}
          {otherQty > 0 && `, dan ${formatQty(otherQty)} sudah ada di keranjang`}. Stok boleh minus; tekan Simpan sekali lagi untuk tetap menyimpan.
        </Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button type="submit" disabled={Boolean(errorText)}>
          {exceedsStock && acceptNegative ? 'Tetap simpan' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Diskon nota (PRD 4.6). Nominal untuk total baris (R3), persen dibulatkan (R2). */
export function DiscountDialog({
  title,
  base,
  discount,
  totalCogs,
  save,
  cancel,
}: {
  title: string
  /** Nilai yang didiskon: jumlah baris atau subtotal nota. */
  base: number
  discount: Discount
  /** HPP x qty untuk baris part; null untuk jasa dan diskon nota. */
  totalCogs: number | null
  save: (d: Discount) => void
  cancel: () => void
}) {
  const [kind, setKind] = useState<DiscountKind>(discount?.kind ?? 'nominal')
  const [text, setText] = useState(discount ? (discount.kind === 'persen' ? String(discount.input).replace('.', ',') : formatRupiah(discount.input).slice(3)) : '')
  const [acceptLoss, setAcceptLoss] = useState(false)

  const input = kind === 'nominal' ? parseRupiah(text) : parseQty(text)
  const result = input === null ? null : calculateDiscount({ kind, input }, base)
  const value = result && 'value' in result ? result.value : null
  const errorText = !text.trim() ? null : input === null ? 'Isi angka yang benar' : result && 'errorText' in result ? result.errorText : null
  const belowCost = value !== null && totalCogs !== null && base - value < totalCogs

  const apply = () => {
    if (!text.trim()) return save(null)
    if (value === null || input === null) return
    if (belowCost && !acceptLoss) return setAcceptLoss(true)
    save(value === 0 ? null : { kind, input })
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Dari {formatRupiah(base)}. Kosongkan isian untuk menghapus diskon.</DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label="Jenis diskon" className="inline-flex h-11 w-fit rounded-md border border-input bg-card p-1">
        {(['nominal', 'persen'] as const).map((j) => (
          <button
            key={j}
            type="button"
            role="radio"
            aria-checked={kind === j}
            onClick={() => {
              setKind(j)
              setAcceptLoss(false)
            }}
            className={cn('rounded-sm px-4 text-[15px] text-muted-foreground', kind === j && 'bg-active text-foreground')}
          >
            {j === 'nominal' ? 'Rupiah' : 'Persen'}
          </button>
        ))}
      </div>
      <Field id="discount-value" label={kind === 'nominal' ? 'Diskon (Rp)' : 'Diskon (%)'} error={errorText ?? undefined}>
        <Input
          id="discount-value"
          autoFocus
          inputMode={kind === 'nominal' ? 'numeric' : 'decimal'}
          className="w-40 text-right text-lg"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value)
            setAcceptLoss(false)
          }}
        />
      </Field>
      {value !== null && value > 0 && (
        <p className="text-muted-foreground">
          Diskon {formatRupiah(value)}, menjadi <span className="text-foreground">{formatRupiah(base - value)}</span>.
        </p>
      )}
      {belowCost && (
        <Notice tone="warning">Di bawah harga beli ({formatRupiah(totalCogs!)}). Tekan Terapkan sekali lagi kalau tetap ingin memberi diskon ini.</Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button type="submit" disabled={Boolean(errorText)}>
          {belowCost && acceptLoss ? 'Tetap terapkan' : text.trim() ? 'Terapkan' : 'Hapus diskon'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Data nota: nopol, pelanggan, keterangan, mekanik, dan catatan servis. Semuanya boleh kosong (PRD 4.6). */
export function SaleInfoDialog({
  data,
  mechanic,
  save,
  cancel,
}: {
  data: SaleInfo
  mechanic: LocalMechanic[]
  save: (d: SaleInfo) => void
  cancel: () => void
}) {
  const online = useOnline()
  const [values, setValues] = useState(data)
  const [autoCustomer, setAutoCustomer] = useState(false)

  const fillCustomerFromPlate = async (plate: string) => {
    const key = plateKey(plate)
    if (!key) return
    const has = await db.plates.get(key)
    if (has?.customer) {
      setValues((v) => (v.customer.trim() && !autoCustomer ? v : { ...v, customer: has.customer! }))
      setAutoCustomer(true)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save({ ...values, plate: values.plate.trim() ? formatPlate(values.plate) : '' })
      }}
    >
      <DialogHeader>
        <DialogTitle>Data nota</DialogTitle>
        <DialogDescription>Semua boleh dikosongkan.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sale-plate" label="Nopol">
          <Input
            id="sale-plate"
            autoFocus
            autoComplete="off"
            className="uppercase"
            value={values.plate}
            onChange={(e) => {
              setValues({ ...values, plate: e.target.value })
              void fillCustomerFromPlate(e.target.value)
            }}
            onBlur={() => values.plate.trim() && setValues((v) => ({ ...v, plate: formatPlate(v.plate) }))}
          />
        </Field>
        <Field id="sale-customer" label="Nama pelanggan" hint={autoCustomer ? 'Terisi dari nota terakhir nopol ini.' : undefined}>
          <Input
            id="sale-customer"
            autoComplete="off"
            value={values.customer}
            onChange={(e) => {
              setValues({ ...values, customer: e.target.value })
              setAutoCustomer(false)
            }}
          />
        </Field>
      </div>
      <Field id="sale-description" label="Keterangan" hint="Penanda keranjang, mis. Vario hitam. Dicetak di struk, tidak tersimpan di riwayat nota.">
        <Input id="sale-description" autoComplete="off" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      </Field>
      <Field id="sale-mechanic" label="Mekanik">
        <CreatableSelect
          id="sale-mechanic"
          kind="mechanic"
          options={mechanic.map((m) => ({ ...m, active: true }))}
          value={values.mechanicId}
          onSelect={(id) => setValues({ ...values, mechanicId: id })}
          canCreate={online}
          onCreate={async (name) => {
            const created = unwrap(await supabase().from('mechanics').insert({ nama: name }).select('id, nama').single())
            await db.mechanics.put({ id: created.id, name: created.nama })
            return created.id
          }}
        />
      </Field>
      {values.mechanicId && (
        <button type="button" className="-mt-2 w-fit text-sm text-muted-foreground underline underline-offset-4" onClick={() => setValues({ ...values, mechanicId: null })}>
          Kosongkan mekanik
        </button>
      )}
      <Field id="sale-note" label="Catatan servis berikutnya" hint="Dicetak di struk, mis. Ganti oli berikutnya: 21.000 km.">
        <Input id="sale-note" autoComplete="off" value={values.serviceNote} onChange={(e) => setValues({ ...values, serviceNote: e.target.value })} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Tambah ke keranjang (R63): keterangan wajib dan unik sebagai penanda keranjang, diusulkan dari keterangan,
 * nopol, atau nama pelanggan. Dipakai juga sebelum membuka keranjang lain saat layar masih berisi barang.
 */
export function SaveCartDialog({
  lineCount,
  suggestion,
  beforeOpening,
  check,
  save,
  cancel,
}: {
  lineCount: number
  suggestion: string
  /** Nama keranjang yang akan dibuka setelah isian layar ditambahkan, atau null. */
  beforeOpening: string | null
  /** Pesan salah untuk keterangan, atau null kalau boleh dipakai. */
  check: (text: string) => string | null
  save: (description: string) => void
  cancel: () => void
}) {
  const [text, setText] = useState(suggestion)
  const [touched, setTouched] = useState(false)
  const error = check(text)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (!error) save(text)
      }}
    >
      <DialogHeader>
        <DialogTitle>Tambah ke keranjang</DialogTitle>
        <DialogDescription>
          {beforeOpening
            ? `Layar masih berisi ${lineCount} baris. Tambahkan dulu ke keranjang sebelum membuka keranjang ${beforeOpening}.`
            : `${lineCount} baris di layar disimpan ke keranjang, lalu layar bersih untuk pelanggan berikutnya.`}
        </DialogDescription>
      </DialogHeader>
      <Field
        id="cart-description"
        label="Keterangan"
        hint="Penanda keranjang, mis. nopol, nama pemilik, atau jenis dan warna motor. Dicetak di struk."
        error={touched || text !== suggestion ? (error ?? undefined) : undefined}
      >
        <Input
          id="cart-description"
          autoFocus
          autoComplete="off"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button type="submit">{beforeOpening ? 'Tambahkan dan buka' : 'Tambahkan'}</Button>
      </DialogFooter>
    </form>
  )
}

/** Tombol Kosongkan: isian layar dihapus setelah konfirmasi (PRD 4.6). */
export function ClearCartDialog({ count, fromCart, clear, cancel }: { count: number; fromCart: string | null; clear: () => void; cancel: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Hapus {count} baris di layar?</DialogTitle>
        <DialogDescription>
          {fromCart ? `Isian ini berasal dari keranjang ${fromCart}, jadi keranjang itu ikut terbuang.` : 'Isian dibuang tanpa dibayar.'}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button variant="destructive" autoFocus onClick={clear}>
          Kosongkan
        </Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Qty melebihi stok sistem: tetap bisa lanjut setelah konfirmasi, karena stok boleh minus (PRD 4.3, 4.6).
 * Qty di keranjang yang ditunda ikut dihitung, tetapi stok tidak ditahan (ADR 0003).
 */
export function StockDialog({
  name,
  stock,
  unit,
  qty,
  others,
  proceed,
  cancel,
}: {
  name: string
  stock: number
  unit: string | null
  qty: number
  others: { label: string; qty: number }[]
  proceed: () => void
  cancel: () => void
}) {
  const inOthers = others.map((o) => `${o.label} (${formatQty(o.qty)})`).join(', ')
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Stok di sistem kurang</DialogTitle>
        <DialogDescription>
          {name}: stok tercatat {formatQty(stock)} {unit}, di layar ini menjadi {formatQty(qty)}.
          {others.length > 0 && ` Sudah ada juga di keranjang ${inOthers}.`}
          {qty > stock ? ' Biasanya karena penerimaan belum diinput.' : ''} Nota tetap bisa dibuat, dan stok boleh minus.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={cancel}>
          Batal
        </Button>
        <Button autoFocus onClick={proceed}>
          Tetap tambahkan
        </Button>
      </DialogFooter>
    </div>
  )
}
