import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { playSuccess, playError } from '@/lib/sound'
import { formatNumber, formatQty } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { paginate } from '@/lib/paginate'
import { useBarcodeScanner } from '@/lib/scanner'
import { useMasterData } from '@/settings/masterData'
import { useProductList } from '@/products/data'
import { NewBarcodeDialog } from '@/products/UnknownBarcodeDialog'
import { StockStatusPill } from '@/products/StockStatusPill'
import { searchProducts, type LocalProduct } from '@/products/product'

type FilterStatus = 'active' | 'inactive' | 'all'

/**
 * Daftar produk (PRD 4.2), khusus part; jasa ada di menu Jasa. Scan barcode membuka produknya; barcode yang
 * belum dikenal menawarkan "Daftarkan produk baru" atau "Tautkan ke produk yang ada" (PRD 4.8).
 */
const PAGE_SIZE = 50

export function ProductsPage() {
  const navigate = useNavigate()
  const online = useOnline()
  const list = useProductList()
  const category = useMasterData('category')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<FilterStatus>('active')
  const [newBarcode, setNewBarcode] = useState<string | null>(null)

  const all = useMemo(() => (list.data ?? []).filter((p) => p.type === 'part'), [list.data])
  const result = useMemo(() => {
    const found = searchProducts(all, query, { categoryId: categoryId || null, includeInactive: status !== 'active' })
    return status === 'inactive' ? found.filter((p) => !p.active) : found
  }, [all, query, categoryId, status])
  // Pagination di frontend (revisi UI): 50 produk per halaman, kembali ke halaman 1 saat filter berubah.
  const filterKey = `${query}|${categoryId}|${status}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const paged = paginate(result, pageState.key === filterKey ? pageState.page : 1, PAGE_SIZE)

  useBarcodeScanner((code) => {
    const p = all.find((x) => x.barcodes.some((b) => b.toLowerCase() === code.toLowerCase()))
    if (p) {
      playSuccess()
      navigate(`/products/${p.id}`)
    } else {
      playError()
      setNewBarcode(code)
    }
  }, newBarcode === null)

  const partTotal = all.filter((p) => p.active).length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produk</h1>
          <p className="mt-1 text-muted-foreground">
            {list.isSuccess
              ? `${partTotal} part aktif. Scan barcode untuk membuka atau mendaftarkan part. Jasa ada di menu Jasa.`
              : 'Scan barcode untuk membuka atau mendaftarkan part.'}
          </p>
        </div>
        <Button render={<Link to="/products/new" />} disabled={!online} nativeButton={false}>
          Produk baru
        </Button>
      </div>

      {!online && (
        <Notice tone="warning" className="mt-6">
          Tidak ada koneksi internet. Produk hanya bisa ditambah dan diubah saat online.
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Cari produk"
            placeholder="Cari nama, merek, barcode, atau kode part"
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
        <div role="radiogroup" aria-label="Status produk" className="flex h-11 rounded-md border border-input bg-card p-1">
          {(['active', 'inactive', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn('rounded-sm px-3 text-[15px] text-muted-foreground', status === s && 'bg-active text-foreground')}
            >
              {s === 'active' ? 'Aktif' : s === 'inactive' ? 'Nonaktif' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">
                {list.isSuccess ? `${result.length} produk` : 'Produk'}
              </th>
              <th className="w-[160px] px-4 text-right font-normal">Harga jual</th>
              <th className="w-[140px] px-4 text-right font-normal">Stok</th>
              <th className="w-[120px] px-4 font-normal">
                <span className="sr-only">Status stok</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isPending &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} className="h-14 border-t border-rule" aria-hidden="true">
                  <td className="px-4"><div className="h-4 w-64 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="ml-auto h-4 w-20 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="ml-auto h-4 w-12 rounded-sm bg-muted" /></td>
                  <td />
                </tr>
              ))}
            {list.isError && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">
                  Daftar produk tidak bisa dimuat.{' '}
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
                    ? 'Belum ada produk. Scan barcode part, atau klik Produk baru.'
                    : 'Tidak ada produk yang cocok dengan pencarian ini.'}
                </td>
              </tr>
            )}
            {paged.rows.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        paged={paged}
        unit="produk"
        onPage={(page) => {
          setPageState({ key: filterKey, page })
          window.scrollTo({ top: 0 })
        }}
      />

      <NewBarcodeDialog code={newBarcode} list={all} onClose={() => setNewBarcode(null)} />
    </>
  )
}

function ProductRow({ product: p }: { product: LocalProduct }) {
  const note = [p.category, ...p.barcodes, ...p.partNumbers].join(' · ')
  return (
    <tr className="h-14 border-t border-rule hover:bg-muted/40">
      <td className="max-w-0 px-4 py-2">
        <Link to={`/products/${p.id}`} className={cn('block truncate', !p.active && 'text-muted-foreground')}>
          {p.name}
          {p.brand && <span className="text-muted-foreground"> · {p.brand}</span>}
        </Link>
        <span className="block truncate text-sm text-muted-foreground">{note}</span>
      </td>
      <td className="px-4 text-right">{formatNumber(p.sellingPrice)}</td>
      <td className="px-4 text-right">
        {p.stock === null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <>
            {formatQty(p.stock)} <span className="text-sm text-muted-foreground">{p.unit}</span>
          </>
        )}
      </td>
      <td className="px-4">
        {!p.active ? (
          <span className="inline-flex h-6 items-center rounded-sm bg-muted px-2 text-sm text-muted-foreground">Nonaktif</span>
        ) : (
          p.stock !== null && <StockStatusPill stock={p.stock} minStock={p.minStock} />
        )}
      </td>
    </tr>
  )
}
