import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Laptop, Search } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { exportExcel } from '@/lib/export'
import { formatQty, formatDate } from '@/lib/format'
import { printText } from '@/lib/printText'
import { useSettings } from '@/lib/settings'
import { useIsLaptop } from '@/lib/useIsLaptop'
import { useProductList } from '@/products/data'
import { searchProducts, STOCK_STATUS_LABELS, fullName, stockStatus, type StockStatus } from '@/products/product'
import { StockStatusPill } from '@/products/StockStatusPill'
import { summarizeStatus, purchaseSuggestions, buildSuggestionText } from '@/stock/stock'

type Filter = 'all' | StockStatus

const FILTERS: Filter[] = ['all', 'safe', 'low', 'out', 'negative']

/**
 * Stok (PRD 4.3): status stok per part dan saran belanja. Status stok responsif untuk HP dan filternya
 * ada di alamat, supaya angka di Dashboard bisa membukanya langsung (R36). Saran belanja tetap laptop.
 */
export function StockPage() {
  const [param, setParam] = useSearchParams()
  const tab = param.get('tab') === 'suggestions' ? 'suggestions' : 'status'
  const status = param.get('status') as Filter | null
  const filter: Filter = status && FILTERS.includes(status) ? status : 'all'
  const laptop = useIsLaptop()
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
      <div role="tablist" aria-label="Bagian stok" className="mt-4 flex gap-6 border-b border-border">
        {(
          [
            ['status', 'Status stok'],
            ['suggestions', 'Saran belanja'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setParam(id === 'status' ? {} : { tab: id }, { replace: true })}
            className={cn('-mb-px h-11 border-b-2 text-[15px]', tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'status' ? (
        <StockStatusTab filter={filter} setFilter={(f) => setParam(f === 'all' ? {} : { status: f }, { replace: true })} />
      ) : laptop ? (
        <SuggestionsTab />
      ) : (
        <p className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-muted-foreground">
          <Laptop className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Paling nyaman dibuka di laptop
        </p>
      )}
    </>
  )
}

function StockStatusTab({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const list = useProductList()
  const [query, setQuery] = useState('')
  const part = useMemo(() => (list.data ?? []).filter((p) => p.type === 'part' && p.active), [list.data])
  const summary = summarizeStatus(part)
  const result = useMemo(
    () => searchProducts(part, query).filter((p) => filter === 'all' || stockStatus(p.stock ?? 0, p.minStock) === filter),
    [part, query, filter],
  )

  // Kartu hitungan sekaligus filter (taste-skill: count cards that filter).
  const cards: { id: Filter; label: string; value: number }[] = [
    { id: 'all', label: 'Semua part aktif', value: summary.all },
    { id: 'safe', label: 'Aman', value: summary.safe },
    { id: 'low', label: 'Menipis', value: summary.low },
    { id: 'out', label: 'Habis', value: summary.out },
    { id: 'negative', label: 'Minus', value: summary.negative },
  ]

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={filter === k.id}
            onClick={() => setFilter(k.id)}
            className={cn(
              'flex h-[68px] flex-col justify-center rounded-md border bg-card px-3 text-left',
              k.id === 'all' && 'col-span-2 sm:col-span-1',
              filter === k.id ? 'border-foreground' : 'border-border hover:border-input',
            )}
          >
            <span className="text-sm text-muted-foreground">{k.label}</span>
            <span className={cn('text-lg font-semibold', k.id === 'negative' && k.value > 0 && 'text-negative')}>{list.isSuccess ? k.value : '–'}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Part dengan stok minimum 0 tidak dipantau ({summary.unmonitored} part), sehingga hanya bisa berstatus Habis atau Minus.
      </p>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Cari part" placeholder="Cari nama, merek, barcode, atau kode part" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* Tabel di laptop; di HP setiap part menjadi dua baris (PRD 6). */}
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_130px_110px_140px] items-center px-4 py-3 text-sm text-muted-foreground lg:grid">
          <span>{list.isSuccess ? `${result.length} part` : 'Part'}</span>
          <span className="px-4 text-right">Stok</span>
          <span className="px-4 text-right">Minimum</span>
          <span className="sr-only">Status</span>
        </div>
        <p className="px-4 py-3 text-sm text-muted-foreground lg:hidden">{list.isSuccess ? `${result.length} part` : 'Part'}</p>
        {list.isPending && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Memuat stok…</p>}
        {list.isError && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Stok tidak bisa dimuat. Periksa internet.</p>}
        {list.isSuccess && result.length === 0 && <p className="border-t border-rule px-4 py-3 text-muted-foreground">Tidak ada part dengan status ini.</p>}
        <ul>
          {result.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-rule px-4 py-2.5 lg:h-12 lg:grid-cols-[minmax(0,1fr)_130px_110px_140px] lg:items-center lg:gap-x-0 lg:py-0"
            >
              <Link to={`/stock/${p.id}`} className="min-w-0 truncate" title="Buka kartu stok">
                {p.name}
                {p.brand && <span className="text-muted-foreground"> · {p.brand}</span>}
              </Link>
              <span className={cn('text-right lg:px-4', (p.stock ?? 0) < 0 && 'text-negative')}>
                {formatQty(p.stock ?? 0)} <span className="text-sm text-muted-foreground">{p.unit}</span>
              </span>
              <span className="text-sm text-muted-foreground lg:px-4 lg:text-right lg:text-[15px]">
                <span className="lg:hidden">Minimum </span>
                {p.minStock ? formatQty(p.minStock) : '–'}
              </span>
              <span className="justify-self-end lg:justify-self-start lg:px-4">
                <StockStatusPill stock={p.stock ?? 0} minStock={p.minStock} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function SuggestionsTab() {
  const list = useProductList()
  const settings = useSettings()
  const lines = useMemo(() => purchaseSuggestions(list.data ?? []), [list.data])
  const width = settings.data?.ukuran_kertas === 58 ? 58 : 80
  const [date] = useState(() => formatDate(new Date()))

  const runExport = () =>
    exportExcel({
      fileName: `saran-belanja-${date.replaceAll('/', '-')}`,
      title: `Saran belanja ${date}`,
      columns: [
        { title: 'Part', value: (b) => fullName(b.product), width: 40 },
        { title: 'Status', value: (b) => STOCK_STATUS_LABELS[b.status], width: 10 },
        { title: 'Stok', value: (b) => b.product.stock ?? 0, kind: 'qty', width: 8 },
        { title: 'Minimum', value: (b) => b.product.minStock, kind: 'qty', width: 9 },
        { title: 'Usulan beli', value: (b) => b.suggested, kind: 'qty', width: 11 },
        { title: 'Satuan', value: (b) => b.product.unit ?? '', width: 8 },
      ],
      rows: lines,
    })

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[640px] text-muted-foreground">
          Part berstatus Menipis, Habis, atau Minus. Usulan qty = (stok minimum × 2) − stok saat ini. Hanya catatan; Kashiru tidak membuat PO.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!lines.length} onClick={() => void printText(buildSuggestionText(lines, width === 58 ? 32 : 48, `SARAN BELANJA ${date}`), width)}>
            Cetak
          </Button>
          <Button variant="outline" disabled={!lines.length} onClick={() => void runExport()}>
            Ekspor Excel
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">{list.isSuccess ? `${lines.length} part` : 'Part'}</th>
              <th className="w-[100px] px-4 text-right font-normal">Stok</th>
              <th className="w-[120px] px-4 text-right font-normal">Usulan beli</th>
            </tr>
          </thead>
          <tbody>
            {list.isSuccess && lines.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={3} className="px-4 py-3 text-muted-foreground">Tidak ada part yang perlu dibeli.</td>
              </tr>
            )}
            {lines.map((b) => (
              <tr key={b.product.id} className="h-12 border-t border-rule">
                <td className="max-w-0 px-4">
                  <Link to={`/stock/${b.product.id}`} className="block truncate">
                    {fullName(b.product)}
                  </Link>
                </td>
                <td className={cn('px-4 text-right', (b.product.stock ?? 0) < 0 && 'text-negative')}>{formatQty(b.product.stock ?? 0)}</td>
                <td className="px-4 text-right font-medium">
                  {b.suggested ? `${formatQty(b.suggested)} ${b.product.unit ?? ''}` : <span className="font-normal text-muted-foreground">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
