import { useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { CreatableSelect } from '@/components/CreatableSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { playSuccess, playError } from '@/lib/sound'
import { print } from '@/lib/print'
import { formatQty, formatRupiah } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { useBarcodeScanner } from '@/lib/scanner'
import { masterDataKey, useMasterData } from '@/settings/masterData'
import {
  createCategory,
  PRODUCT_LIST_KEY,
  productDetailKey,
  saveProductChanges,
  createProduct,
  setProductActive,
  useProductList,
  useProductDetail,
  type ProductBarcode,
  type ProductDetail,
  type ProductPartNumber,
} from '@/products/data'
import {
  EMPTY_FIELDS,
  fieldsFromProduct,
  validateProduct,
  priceWarning,
  COMMON_UNITS,
  type FormFields,
  type ProductValues,
  type FormErrors,
} from '@/products/productForm'
import { LabelSheet } from '@/products/BarcodeLabel'
import { fullName, type ProductType } from '@/products/product'

/** Menu Produk berisi part, menu Jasa berisi jasa. Keduanya memakai form yang sama. */
const PAGES: Record<ProductType, { path: string; menu: string; noun: string }> = {
  part: { path: '/products', menu: 'Produk', noun: 'produk' },
  jasa: { path: '/services', menu: 'Jasa', noun: 'jasa' },
}

/** /products/new dan /products/:id untuk part; /services/new dan /services/:id untuk jasa. */
export function ProductFormPage({ type }: { type: ProductType }) {
  const { id } = useParams()
  const detail = useProductDetail(id ?? null)
  const page = PAGES[type]
  if (!id) return <ProductForm key={`baru-${type}`} existing={null} type={type} />
  if (detail.isPending) return <FormTitle type={type} title={`Memuat ${page.noun}…`} />
  if (detail.isError) {
    return (
      <>
        <FormTitle type={type} title={`Data ${page.noun} tidak bisa dimuat`} />
        <Notice tone="error" className="mt-6 max-w-[880px]">
          {detail.error.message}{' '}
          <button type="button" className="underline underline-offset-4" onClick={() => void detail.refetch()}>
            Coba lagi
          </button>
        </Notice>
      </>
    )
  }
  // Tautan lama ke jasa lewat /products/:id (atau sebaliknya) diarahkan ke menunya.
  if (detail.data.type !== type) return <Navigate to={`${PAGES[detail.data.type].path}/${id}`} replace />
  return <ProductForm key={`${id}-${detail.dataUpdatedAt}`} existing={detail.data} type={type} />
}

function FormTitle({ type, title, sublabel, action }: { type: ProductType; title: string; sublabel?: ReactNode; action?: ReactNode }) {
  const page = PAGES[type]
  return (
    <div className="max-w-[880px]">
      <Link to={page.path} className="inline-flex h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {page.menu}
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sublabel && <p className="mt-1 text-muted-foreground">{sublabel}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-rule py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function ProductForm({ existing, type }: { existing: ProductDetail | null; type: ProductType }) {
  const isNew = existing === null
  const page = PAGES[type]
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [searchInput] = useSearchParams()
  const category = useMasterData('category')
  const list = useProductList()
  const settings = useSettings()
  const name = useRef<HTMLInputElement>(null)

  const initialBarcode = searchInput.get('barcode')
  const [values, setValues] = useState<FormFields>(existing ? fieldsFromProduct(existing) : { ...EMPTY_FIELDS, type })
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>(existing?.barcodes ?? (initialBarcode ? [{ barcode: initialBarcode, kind: 'pabrik' }] : []))
  const [partNumbers, setPartNumber] = useState<ProductPartNumber[]>(existing?.partNumbers ?? [])
  const [createInternal, setCreateInternal] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [barcodeMessage, setBarcodeMessage] = useState<string | null>(null)
  // Pesan dari simpan sebelumnya dibawa lewat state navigasi, karena form dimuat ulang setelah data disegarkan.
  const [saved, setSaved] = useState<string | null>((location.state as { message?: string } | null)?.message ?? null)
  const [priceConfirm, setPriceConfirm] = useState<ProductValues | null>(null)
  const [dialog, setDialog] = useState<'label' | 'status' | null>(null)

  const part = values.type === 'part'
  const update = <K extends keyof FormFields>(key: K, value: FormFields[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setFieldErrors((s) => ({ ...s, [key]: undefined }))
    setSaved(null)
  }

  const addBarcode = (code: string): boolean => {
    const k = code.trim()
    if (!k) return false
    if (barcodes.some((b) => b.barcode === k)) {
      setBarcodeMessage(`Barcode ${k} sudah ada di produk ini.`)
      return false
    }
    const owner = (list.data ?? []).find((p) => p.id !== existing?.id && p.barcodes.includes(k))
    if (owner) {
      setBarcodeMessage(`Barcode ${k} sudah dipakai ${fullName(owner)}.`)
      return false
    }
    setBarcodes((b) => [...b, { barcode: k, kind: 'pabrik' }])
    setBarcodeMessage(null)
    setSaved(null)
    return true
  }

  // Di form produk, hasil scan mengisi kolom barcode (PRD 4.8).
  useBarcodeScanner((code) => {
    if (!part) return
    if (addBarcode(code)) playSuccess()
    else playError()
  }, dialog === null && priceConfirm === null)

  const refresh = async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PRODUCT_LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: productDetailKey(id) }),
    ])
  }

  const create = useMutation({
    mutationFn: ({ value }: { value: ProductValues; next: boolean }) =>
      createProduct(value, barcodes.map((b) => b.barcode), partNumbers, part && createInternal),
    onSuccess: async (id, { value, next }) => {
      await refresh(id)
      if (!next) {
        navigate(`${page.path}/${id}`, { replace: true, state: { message: `${fullName(value)} tersimpan.` } })
        return
      }
      // "Simpan & berikutnya": kategori dipertahankan untuk input data awal beruntun (PRD 4.2).
      setValues({ ...EMPTY_FIELDS, type, categoryId: values.categoryId, unit: part ? values.unit : EMPTY_FIELDS.unit })
      setBarcodes([])
      setPartNumber([])
      setCreateInternal(false)
      setSaved(`${fullName(value)} tersimpan. ${part ? 'Scan barcode part berikutnya.' : 'Isi jasa berikutnya.'}`)
      if (initialBarcode) navigate(`${page.path}/new`, { replace: true })
      name.current?.focus()
    },
  })

  const saveEdit = useMutation({
    mutationFn: (value: ProductValues) => saveProductChanges(existing!, value, barcodes, partNumbers, part && createInternal),
    onSuccess: async () => {
      navigate(location.pathname, { replace: true, state: { message: 'Perubahan tersimpan.' } })
      await refresh(existing!.id)
    },
  })

  const save = (next: boolean) => {
    const result = validateProduct(values, isNew)
    if (!result.ok) {
      setFieldErrors(result.errors)
      return
    }
    if (isNew) create.mutate({ value: result.value, next })
    else if (result.value.sellingPrice !== existing!.sellingPrice) setPriceConfirm(result.value)
    else saveEdit.mutate(result.value)
  }

  const errorMessage = create.error ?? saveEdit.error
  const saving = create.isPending || saveEdit.isPending
  const warning = isNew ? priceWarning(values) : null

  return (
    <>
      <FormTitle
        type={type}
        title={existing ? fullName(existing) : part ? 'Produk baru' : 'Jasa baru'}
        sublabel={
          existing &&
          (existing.type === 'part'
            ? `Stok ${formatQty(existing.stock ?? 0)} ${existing.unit ?? ''} · harga beli rata-rata ${formatRupiah(existing.avgCost)}${existing.active ? '' : ' · nonaktif'}`
            : `Jasa${existing.active ? '' : ' · nonaktif'}`)
        }
        action={
          existing?.type === 'part' && (
            <div className="flex gap-2">
              <Button variant="outline" render={<Link to={`/stock/${existing.id}`} />} nativeButton={false}>
                Kartu stok
              </Button>
              {existing.barcodes.length > 0 && (
                <Button variant="outline" onClick={() => setDialog('label')}>
                  Cetak label
                </Button>
              )}
            </div>
          )
        }
      />

      <form
        noValidate
        className="mt-4 max-w-[880px]"
        onSubmit={(e) => {
          e.preventDefault()
          save(isNew)
        }}
      >
        {!online && (
          <Notice tone="warning" className="mb-4">
            Tidak ada koneksi internet. {part ? 'Produk' : 'Jasa'} hanya bisa disimpan saat online.
          </Notice>
        )}

        <Section title={part ? 'Part' : 'Jasa'} note={part ? undefined : 'Jasa tidak punya stok. Jasa yang belum terdaftar bisa diketik manual di kasir.'}>
          <Field id="product-name" label="Nama" error={fieldErrors.name} className={part ? undefined : 'sm:col-span-2'}>
            <Input
              ref={name}
              id="product-name"
              autoFocus={isNew}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.name)}
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </Field>
          {part && (
            <Field id="product-brand" label="Merek" hint="Opsional. Nama dan merek tidak boleh sama dengan produk lain.">
              <Input id="product-brand" autoComplete="off" value={values.brand} onChange={(e) => update('brand', e.target.value)} />
            </Field>
          )}
          <Field id="product-category" label="Kategori" error={fieldErrors.categoryId}>
            <CreatableSelect
              id="product-category"
              kind="category"
              options={category.data ?? []}
              value={values.categoryId || null}
              onSelect={(id) => update('categoryId', id)}
              onCreate={async (n) => {
                const id = await createCategory(n)
                await queryClient.invalidateQueries({ queryKey: masterDataKey('category') })
                return id
              }}
              canCreate={online}
              invalid={Boolean(fieldErrors.categoryId)}
            />
          </Field>
          <Field id="product-price" label={part ? 'Harga jual' : 'Tarif'} hint={part ? undefined : 'Tarif default, bisa diubah di kasir. Boleh Rp 0.'} error={fieldErrors.sellingPrice}>
            <InputRupiah id="product-price" value={values.sellingPrice} onEdit={(v) => update('sellingPrice', v)} invalid={Boolean(fieldErrors.sellingPrice)} />
          </Field>
        </Section>

        {part && (
          <Section title="Stok" note={isNew ? 'Setelah part dibuat, stok hanya berubah lewat nota, penerimaan, opname, atau penyesuaian stok.' : undefined}>
            <Field id="product-unit" label="Satuan">
              <Input id="product-unit" list="unit-list" autoComplete="off" value={values.unit} onChange={(e) => update('unit', e.target.value)} />
              <datalist id="unit-list">
                {COMMON_UNITS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field id="product-min-stock" label="Stok minimum" hint="0 atau kosong berarti tidak dipantau." error={fieldErrors.minStock}>
              <Input
                id="product-min-stock"
                inputMode="decimal"
                className="text-right"
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.minStock)}
                value={values.minStock}
                onChange={(e) => update('minStock', e.target.value)}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={values.allowsFraction}
                onChange={(e) => update('allowsFraction', e.target.checked)}
              />
              <span>
                Bisa pecahan <span className="text-muted-foreground">(mis. 1,5 liter atau 2,3 meter)</span>
              </span>
            </label>
            {isNew && (
              <>
                <Field id="product-initial-stock" label="Stok awal" hint="Opsional." error={fieldErrors.initialStock}>
                  <Input
                    id="product-initial-stock"
                    inputMode="decimal"
                    className="text-right"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.initialStock)}
                    value={values.initialStock}
                    onChange={(e) => update('initialStock', e.target.value)}
                  />
                </Field>
                <Field id="product-cost" label="Harga beli per satuan" hint="Wajib kalau stok awal diisi." error={fieldErrors.purchasePrice}>
                  <InputRupiah id="product-cost" value={values.purchasePrice} onEdit={(v) => update('purchasePrice', v)} invalid={Boolean(fieldErrors.purchasePrice)} />
                </Field>
                {warning && (
                  <Notice tone="warning" className="sm:col-span-2">
                    {warning}. Part tetap bisa disimpan.
                  </Notice>
                )}
              </>
            )}
          </Section>
        )}

        {part && (
          <Section title="Barcode dan kode part" note="Scan barcode untuk menambahkannya. Part tanpa barcode pabrik bisa diberi barcode internal.">
            <div className="sm:col-span-2">
              <BarcodeList
                barcodes={barcodes}
                createInternal={createInternal}
                onRemove={(b) => {
                  setBarcodes((x) => x.filter((y) => y.barcode !== b))
                  setSaved(null)
                }}
                onAdd={addBarcode}
                onCreateInternal={() => {
                  setCreateInternal((v) => !v)
                  setSaved(null)
                }}
              />
              {barcodeMessage && <p className="mt-2 text-sm text-negative" role="alert">{barcodeMessage}</p>}
            </div>
            <div className="sm:col-span-2">
              <PartNumberList
                partNumbers={partNumbers}
                onEdit={(k) => {
                  setPartNumber(k)
                  setSaved(null)
                }}
              />
            </div>
          </Section>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background px-4 py-4 lg:-mx-8 lg:px-8">
          {errorMessage && <span className="mr-auto text-sm text-negative" role="alert">{errorMessage.message}</span>}
          {!errorMessage && saved && <span className="mr-auto text-sm text-muted-foreground" role="status">{saved}</span>}
          <Button type="button" variant="outline" render={<Link to={page.path} />} nativeButton={false}>
            {isNew ? 'Batal' : 'Kembali'}
          </Button>
          {isNew ? (
            <>
              <Button type="button" variant="outline" disabled={!online || saving} onClick={() => save(false)}>
                Simpan
              </Button>
              <Button type="submit" disabled={!online || saving}>
                {saving ? 'Menyimpan…' : 'Simpan & berikutnya'}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={!online || saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          )}
        </div>
      </form>

      {existing && (
        <section className="mt-10 max-w-[880px] border-t border-rule pt-6">
          <h2 className="text-base font-medium">{existing.active ? `Nonaktifkan ${page.noun}` : `${page.menu} nonaktif`}</h2>
          <p className="mt-1 text-muted-foreground">
            {existing.active
              ? `${page.menu} tidak bisa dihapus karena nota lama masih merujuk ke ${page.noun} ini. ${page.menu} nonaktif tidak muncul di kasir, pencarian, dan opname.`
              : `${page.menu} ini tidak muncul di kasir, pencarian, dan opname.`}
          </p>
          <Button variant={existing.active ? 'destructive' : 'outline'} className="mt-4" disabled={!online} onClick={() => setDialog('status')}>
            {existing.active ? `Nonaktifkan ${page.noun}` : 'Aktifkan lagi'}
          </Button>
        </section>
      )}

      <Dialog open={priceConfirm !== null} onOpenChange={(open) => !open && setPriceConfirm(null)}>
        <DialogContent>
          {priceConfirm && existing && (
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle>Ubah harga jual?</DialogTitle>
                <DialogDescription>
                  {formatRupiah(existing.sellingPrice)} menjadi {formatRupiah(priceConfirm.sellingPrice)}. Perubahan tercatat di riwayat. Nota yang sudah dibuat tidak berubah.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPriceConfirm(null)}>
                  Batal
                </Button>
                <Button
                  autoFocus
                  onClick={() => {
                    saveEdit.mutate(priceConfirm)
                    setPriceConfirm(null)
                  }}
                >
                  Ubah harga
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === 'label' && existing && (
            <PrintLabelDialog product={existing} width={settings.data?.ukuran_kertas === 58 ? 58 : 80} onDone={() => setDialog(null)} />
          )}
          {dialog === 'status' && existing && <StatusDialog product={existing} onDone={() => setDialog(null)} refresh={() => refresh(existing.id)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Isian rupiah: diketik bebas, dirapikan menjadi "45.000" saat keluar dari kolom. */
function InputRupiah({ id, value, onEdit, invalid }: { id: string; value: string; onEdit: (v: string) => void; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">Rp</span>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className="pl-10 text-right"
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={() => {
          const parsed = value.replace(/[.\s]/g, '')
          if (/^\d+$/.test(parsed)) onEdit(new Intl.NumberFormat('id-ID').format(Number(parsed)))
        }}
      />
    </div>
  )
}

function BarcodeList({
  barcodes,
  createInternal,
  onRemove,
  onAdd,
  onCreateInternal,
}: {
  barcodes: ProductBarcode[]
  createInternal: boolean
  onRemove: (barcode: string) => void
  onAdd: (barcode: string) => boolean
  onCreateInternal: () => void
}) {
  const [typed, setTyped] = useState('')
  const add = () => {
    if (onAdd(typed)) setTyped('')
  }
  return (
    <div>
      <span className="text-sm font-medium">Barcode</span>
      <ul className="mt-2 flex flex-wrap gap-2">
        {barcodes.map((b) => (
          <li key={b.barcode} className="flex h-9 items-center gap-1 rounded-sm border border-border bg-card pr-1 pl-3">
            <span className="font-mono text-sm">{b.barcode}</span>
            {b.kind === 'internal' && <span className="text-sm text-muted-foreground">internal</span>}
            <button type="button" aria-label={`Hapus barcode ${b.barcode}`} onClick={() => onRemove(b.barcode)} className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:text-foreground">
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </li>
        ))}
        {createInternal && (
          <li className="flex h-9 items-center gap-1 rounded-sm border border-dashed border-input pr-1 pl-3 text-sm text-muted-foreground">
            Barcode internal, dibuat saat disimpan
            <button type="button" aria-label="Batal buat barcode internal" onClick={onCreateInternal} className="grid size-7 place-items-center rounded-sm hover:text-foreground">
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </li>
        )}
        {barcodes.length === 0 && !createInternal && <li className="flex h-9 items-center text-muted-foreground">Belum ada barcode.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          aria-label="Ketik barcode"
          placeholder="Ketik barcode"
          className="w-[240px] font-mono"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!typed.trim()}>
          Tambah
        </Button>
        {!createInternal && !barcodes.some((b) => b.kind === 'internal') && (
          <Button type="button" variant="outline" onClick={onCreateInternal}>
            Buat barcode internal
          </Button>
        )}
      </div>
    </div>
  )
}

function PartNumberList({ partNumbers, onEdit }: { partNumbers: ProductPartNumber[]; onEdit: (k: ProductPartNumber[]) => void }) {
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'oem' | 'alt'>('oem')
  const add = () => {
    const k = code.trim()
    if (!k || partNumbers.some((x) => x.code.toLowerCase() === k.toLowerCase())) return
    onEdit([...partNumbers, { code: k, kind }])
    setCode('')
  }
  return (
    <div>
      <span className="text-sm font-medium">Kode part</span>
      <p className="text-sm text-muted-foreground">Kode OEM atau aftermarket yang bisa dicari di kasir.</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {partNumbers.map((k) => (
          <li key={k.code} className="flex h-9 items-center gap-1 rounded-sm border border-border bg-card pr-1 pl-3">
            <span className="font-mono text-sm">{k.code}</span>
            <span className="text-sm text-muted-foreground">{k.kind === 'oem' ? 'OEM' : 'Alt'}</span>
            <button
              type="button"
              aria-label={`Hapus kode part ${k.code}`}
              onClick={() => onEdit(partNumbers.filter((x) => x.code !== k.code))}
              className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          aria-label="Kode part"
          placeholder="mis. 06455-KVB-305"
          className="w-[240px] font-mono"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <select
          aria-label="Jenis kode part"
          className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
          value={kind}
          onChange={(e) => setKind(e.target.value === 'alt' ? 'alt' : 'oem')}
        >
          <option value="oem">OEM</option>
          <option value="alt">Aftermarket</option>
        </select>
        <Button type="button" variant="outline" onClick={add} disabled={!code.trim()}>
          Tambah
        </Button>
      </div>
    </div>
  )
}

function PrintLabelDialog({ product, width, onDone }: { product: ProductDetail; width: 58 | 80; onDone: () => void }) {
  const sequence = [...product.barcodes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'internal' ? -1 : 1))
  const [code, setCode] = useState(sequence[0]?.barcode ?? '')
  const [count, setCount] = useState('1')
  const n = Number(count)
  const valid = Number.isInteger(n) && n >= 1 && n <= 200
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        await print(<LabelSheet items={[{ label: { name: product.name, brand: product.brand, code }, count: n }]} width={width} />, width)
        onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>Cetak label</DialogTitle>
        <DialogDescription>
          {fullName(product)} di kertas {width} mm. Harga tidak dicetak. Kertas dipotong setelah semua label tercetak.
        </DialogDescription>
      </DialogHeader>
      {sequence.length > 1 && (
        <Field id="label-barcode" label="Barcode">
          <select id="label-barcode" className="h-11 rounded-md border border-input bg-card px-3 font-mono" value={code} onChange={(e) => setCode(e.target.value)}>
            {sequence.map((b) => (
              <option key={b.barcode} value={b.barcode}>
                {b.barcode} {b.kind === 'internal' ? '(internal)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="label-count" label="Jumlah label" error={valid ? undefined : 'Isi 1 sampai 200'}>
        <Input id="label-count" inputMode="numeric" className="w-28 text-right" autoFocus value={count} onChange={(e) => setCount(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={!valid}>
          Cetak
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nonaktifkan atau aktifkan lagi. Part boleh dinonaktifkan walaupun stoknya bukan 0 (R18). */
function StatusDialog({ product, onDone, refresh }: { product: ProductDetail; onDone: () => void; refresh: () => Promise<void> }) {
  const update = useMutation({
    mutationFn: () => setProductActive(product.id, !product.active),
    onSuccess: async () => {
      await refresh()
      onDone()
    },
  })
  const remainingStock = product.type === 'part' && product.stock !== null && product.stock !== 0
  const subject = PAGES[product.type].menu
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{product.active ? `Nonaktifkan ${fullName(product)}?` : `Aktifkan lagi ${fullName(product)}?`}</DialogTitle>
        <DialogDescription>
          {product.active
            ? `${subject} tidak muncul lagi di kasir, pencarian, dan opname penuh. Nota lama tetap utuh. Perubahan tercatat di riwayat.`
            : `${subject} muncul lagi di kasir, pencarian, dan opname. Perubahan tercatat di riwayat.`}
        </DialogDescription>
      </DialogHeader>
      {product.active && remainingStock && (
        <Notice tone="warning">
          Stok masih {formatQty(product.stock!)} {product.unit}. Stok ini tetap terhitung di nilai persediaan.
        </Notice>
      )}
      {update.isError && <Notice tone="error">{update.error.message}</Notice>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button variant={product.active ? 'destructive' : 'default'} disabled={update.isPending} onClick={() => update.mutate()}>
          {product.active ? 'Nonaktifkan' : 'Aktifkan lagi'}
        </Button>
      </DialogFooter>
    </div>
  )
}
