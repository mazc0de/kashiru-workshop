import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'

import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/format'
import { paginate } from '@/lib/paginate'
import { print } from '@/lib/print'
import { useSettings } from '@/lib/settings'
import { useMasterData } from '@/settings/masterData'
import { LabelSheet } from '@/products/BarcodeLabel'
import { useInternalBarcodes, type InternalBarcode } from '@/products/data'

/**
 * Label barcode (PRD 4.9): semua barcode internal part aktif di satu tempat, supaya labelnya bisa
 * dicetak sekaligus untuk ditempel di part. Centang barisnya, isi jumlah label, lalu cetak.
 */
const PAGE_SIZE = 50
const MAX_PER_ROW = 200

export function BarcodeLabelsPage() {
  const list = useInternalBarcodes()
  const category = useMasterData('category')
  const settings = useSettings()
  const width = settings.data?.ukuran_kertas === 58 ? 58 : 80
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  // Barcode yang dicentang beserta jumlah labelnya (teks, supaya isian boleh kosong sementara diketik).
  const [chosen, setChosen] = useState<Map<string, string>>(() => new Map())
  const [printing, setPrinting] = useState(false)

  const all = useMemo(() => list.data ?? [], [list.data])
  const result = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((b) => {
      if (categoryId && b.categoryId !== categoryId) return false
      const text = `${b.barcode} ${b.name} ${b.brand ?? ''}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
  }, [all, query, categoryId])
  const filterKey = `${query}|${categoryId}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const paged = paginate(result, pageState.key === filterKey ? pageState.page : 1, PAGE_SIZE)

  const update = (fn: (m: Map<string, string>) => void) =>
    setChosen((m) => {
      const next = new Map(m)
      fn(next)
      return next
    })
  const toggle = (id: string, on: boolean) => update((m) => (on ? m.set(id, m.get(id) ?? '1') : m.delete(id)))

  const allChosen = result.length > 0 && result.every((b) => chosen.has(b.id))
  const someChosen = result.some((b) => chosen.has(b.id))

  const selected = all.filter((b) => chosen.has(b.id)).map((b) => ({ item: b, count: Number(chosen.get(b.id)) }))
  const invalid = selected.some(({ count }) => !validCount(count))
  const totalLabels = invalid ? 0 : selected.reduce((n, s) => n + s.count, 0)

  const printAll = async () => {
    if (invalid || selected.length === 0) return
    setPrinting(true)
    try {
      await print(
        <LabelSheet items={selected.map(({ item, count }) => ({ label: { name: item.name, brand: item.brand, code: item.barcode }, count }))} width={width} />,
        width,
      )
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Label barcode</h1>
          <p className="mt-1 text-muted-foreground">
            Barcode internal untuk ditempel di part tanpa barcode pabrik. Centang, isi jumlah label, lalu cetak di kertas {width} mm.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <Button variant="outline" onClick={() => setChosen(new Map())}>
              Kosongkan pilihan
            </Button>
          )}
          <Button onClick={() => void printAll()} disabled={selected.length === 0 || invalid || printing}>
            {selected.length === 0 ? 'Cetak label' : invalid ? 'Periksa jumlah label' : `Cetak ${formatNumber(totalLabels)} label`}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Cari barcode"
            placeholder="Cari barcode, nama, atau merek"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter kategori"
          className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Semua kategori</option>
          {(category.data ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.active ? '' : ' (nonaktif)'}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="w-11">
                <RowCheckbox
                  label="Pilih semua yang tampil"
                  checked={allChosen}
                  partial={someChosen && !allChosen}
                  disabled={result.length === 0}
                  onChange={(on) => update((m) => result.forEach((b) => (on ? m.set(b.id, m.get(b.id) ?? '1') : m.delete(b.id))))}
                />
              </th>
              <th className="w-[160px] px-4 font-normal">Barcode</th>
              <th className="px-4 font-normal">{list.isSuccess ? `${result.length} part` : 'Part'}</th>
              <th className="w-[160px] px-4 text-right font-normal">Jumlah label</th>
            </tr>
          </thead>
          <tbody>
            {list.isPending &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} className="h-14 border-t border-rule" aria-hidden="true">
                  <td />
                  <td className="px-4"><div className="h-4 w-20 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="h-4 w-64 rounded-sm bg-muted" /></td>
                  <td />
                </tr>
              ))}
            {list.isError && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">
                  Daftar barcode tidak bisa dimuat.{' '}
                  <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void list.refetch()}>
                    Coba lagi
                  </button>
                </td>
              </tr>
            )}
            {list.isSuccess && result.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">
                  {all.length === 0
                    ? 'Belum ada barcode internal. Buat dari halaman part dengan tombol Buat barcode internal.'
                    : 'Tidak ada barcode yang cocok dengan pencarian ini.'}
                </td>
              </tr>
            )}
            {paged.rows.map((b) => (
              <LabelRow
                key={b.id}
                item={b}
                count={chosen.get(b.id) ?? null}
                onToggle={(on) => toggle(b.id, on)}
                onCount={(v) => update((m) => m.set(b.id, v))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        paged={paged}
        unit="barcode"
        onPage={(page) => {
          setPageState({ key: filterKey, page })
          window.scrollTo({ top: 0 })
        }}
      />
    </>
  )
}

function validCount(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_PER_ROW
}

function LabelRow({
  item,
  count,
  onToggle,
  onCount,
}: {
  item: InternalBarcode
  /** null kalau barisnya tidak dicentang. */
  count: string | null
  onToggle: (on: boolean) => void
  onCount: (v: string) => void
}) {
  const on = count !== null
  const invalid = on && !validCount(Number(count))
  return (
    <tr className="h-14 border-t border-rule hover:bg-muted/40">
      <td>
        <RowCheckbox label={`Pilih ${item.barcode}`} checked={on} onChange={onToggle} />
      </td>
      <td className="px-4 font-mono">{item.barcode}</td>
      <td className="max-w-0 px-4 py-2">
        <Link to={`/products/${item.productId}`} className="block truncate">
          {item.name}
          {item.brand && <span className="text-muted-foreground"> · {item.brand}</span>}
        </Link>
        <span className="block truncate text-sm text-muted-foreground">{item.category}</span>
      </td>
      <td className="px-4 text-right">
        {on && (
          <Input
            aria-label={`Jumlah label ${item.barcode}`}
            aria-invalid={invalid}
            title={invalid ? `Isi 1 sampai ${MAX_PER_ROW}` : undefined}
            inputMode="numeric"
            autoComplete="off"
            className="ml-auto h-9 w-20 text-right"
            value={count}
            onChange={(e) => onCount(e.target.value.trim())}
          />
        )}
      </td>
    </tr>
  )
}

function RowCheckbox({
  label,
  checked,
  onChange,
  partial = false,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  partial?: boolean
  disabled?: boolean
}) {
  return (
    <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        className="size-[18px] accent-foreground"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = partial
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
