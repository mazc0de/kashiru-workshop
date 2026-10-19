import { useId, useMemo, useState, type Ref } from 'react'
import { Search } from 'lucide-react'
import { cn } from 'cn'

import { Input } from '@/components/ui/input'
import { formatNumber, formatQty } from '@/lib/format'
import { searchProducts, fullName, type LocalProduct } from '@/products/product'

/**
 * Kolom scan dan pencarian kilat: nama, merek, barcode, atau kode part, dari salinan lokal (PRD 4.3).
 * ↑/↓ memilih hasil, Enter memakai, Esc mengosongkan. Dipakai di Kasir, Penerimaan, dan Opname.
 */
export function SearchBox({
  ref,
  query,
  setQuery,
  products,
  onPick,
  disabled = false,
  placeholder,
  className,
  autoFocus = true,
}: {
  ref?: Ref<HTMLInputElement>
  query: string
  setQuery: (v: string) => void
  products: LocalProduct[]
  onPick: (p: LocalProduct) => void
  disabled?: boolean
  placeholder: string
  className?: string
  autoFocus?: boolean
}) {
  const listId = useId()
  const [highlight, setHighlight] = useState(0)
  const result = useMemo(() => (query.trim() ? searchProducts(products, query, { limit: 8 }) : []), [products, query])
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={ref}
        autoFocus={autoFocus}
        aria-label="Scan atau cari produk"
        placeholder={placeholder}
        className="h-12 pl-9 text-base"
        role="combobox"
        aria-expanded={result.length > 0}
        aria-controls={listId}
        aria-activedescendant={result.length ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlight(0)
        }}
        onKeyDown={(e) => {
          if (!result.length) {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              setQuery('')
            }
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((s) => Math.min(result.length - 1, s + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((s) => Math.max(0, s - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            onPick(result[highlight])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setQuery('')
          }
        }}
      />
      {query.trim() !== '' && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {result.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onPick(p)}
              className={cn('flex cursor-default items-center justify-between gap-3 rounded-sm px-3 py-2', i === highlight && 'bg-accent')}
            >
              <span className="min-w-0">
                <span className="block truncate">{fullName(p)}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {p.type === 'jasa' ? 'Jasa' : `Stok ${formatQty(p.stock ?? 0)} ${p.unit ?? ''}`} · {p.category}
                </span>
              </span>
              <span className="flex-none">{formatNumber(p.sellingPrice)}</span>
            </li>
          ))}
          {result.length === 0 && <li className="px-3 py-2.5 text-muted-foreground">Tidak ada produk yang cocok.</li>}
        </ul>
      )}
    </div>
  )
}
