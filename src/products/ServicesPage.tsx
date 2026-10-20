import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { paginate } from '@/lib/paginate'
import { useMasterData } from '@/settings/masterData'
import { useProductList } from '@/products/data'
import { searchProducts, type LocalProduct } from '@/products/product'

type FilterStatus = 'active' | 'inactive' | 'all'

/**
 * Daftar jasa dengan tarif default-nya. Jasa di sini muncul di jendela Jasa di Kasir; jasa yang belum
 * terdaftar bisa diketik manual di Kasir tanpa ditambahkan ke sini.
 */
const PAGE_SIZE = 50

export function ServicesPage() {
  const online = useOnline()
  const list = useProductList()
  const category = useMasterData('category')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<FilterStatus>('active')

  const all = useMemo(() => (list.data ?? []).filter((p) => p.type === 'jasa'), [list.data])
  const result = useMemo(() => {
    const found = searchProducts(all, query, { categoryId: categoryId || null, includeInactive: status !== 'active' })
    return status === 'inactive' ? found.filter((p) => !p.active) : found
  }, [all, query, categoryId, status])
  const filterKey = `${query}|${categoryId}|${status}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const paged = paginate(result, pageState.key === filterKey ? pageState.page : 1, PAGE_SIZE)
  const activeTotal = all.filter((p) => p.active).length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jasa</h1>
          <p className="mt-1 text-muted-foreground">
            {list.isSuccess ? `${activeTotal} jasa aktif. ` : ''}
            Tarif di sini adalah tarif default dan bisa diubah di kasir.
          </p>
        </div>
        <Button render={<Link to="/services/new" />} disabled={!online} nativeButton={false}>
          Jasa baru
        </Button>
      </div>

      {!online && (
        <Notice tone="warning" className="mt-6">
          Tidak ada koneksi internet. Jasa hanya bisa ditambah dan diubah saat online.
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Cari jasa" placeholder="Cari nama jasa" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
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
        <div role="radiogroup" aria-label="Status jasa" className="flex h-11 rounded-md border border-input bg-card p-1">
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
              <th className="px-4 font-normal">{list.isSuccess ? `${result.length} jasa` : 'Jasa'}</th>
              <th className="w-[160px] px-4 text-right font-normal">Tarif</th>
              <th className="w-[120px] px-4 font-normal">
                <span className="sr-only">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isPending &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} className="h-14 border-t border-rule" aria-hidden="true">
                  <td className="px-4"><div className="h-4 w-64 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="ml-auto h-4 w-20 rounded-sm bg-muted" /></td>
                  <td />
                </tr>
              ))}
            {list.isError && (
              <tr className="border-t border-rule">
                <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                  Daftar jasa tidak bisa dimuat.{' '}
                  <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void list.refetch()}>
                    Coba lagi
                  </button>
                </td>
              </tr>
            )}
            {list.isSuccess && result.length === 0 && (
              <tr className="border-t border-rule">
                <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                  {all.length === 0 ? 'Belum ada jasa. Klik Jasa baru untuk menambahkan.' : 'Tidak ada jasa yang cocok dengan pencarian ini.'}
                </td>
              </tr>
            )}
            {paged.rows.map((p) => (
              <ServiceRow key={p.id} service={p} />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        paged={paged}
        unit="jasa"
        onPage={(page) => {
          setPageState({ key: filterKey, page })
          window.scrollTo({ top: 0 })
        }}
      />
    </>
  )
}

function ServiceRow({ service: p }: { service: LocalProduct }) {
  return (
    <tr className="h-14 border-t border-rule hover:bg-muted/40">
      <td className="max-w-0 px-4 py-2">
        <Link to={`/services/${p.id}`} className={cn('block truncate', !p.active && 'text-muted-foreground')}>
          {p.name}
        </Link>
        <span className="block truncate text-sm text-muted-foreground">{p.category}</span>
      </td>
      <td className="px-4 text-right">{formatNumber(p.sellingPrice)}</td>
      <td className="px-4">
        {!p.active && <span className="inline-flex h-6 items-center rounded-sm bg-muted px-2 text-sm text-muted-foreground">Nonaktif</span>}
      </td>
    </tr>
  )
}
