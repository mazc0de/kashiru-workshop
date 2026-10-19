import { cn } from 'cn'

import { STOCK_STATUS_LABELS, stockStatus } from '@/products/product'

/**
 * Status stok dengan warna semantik (PRD 4.3, PRD 6): hijau Aman, kuning Menipis, merah Habis dan Minus.
 * Part dengan stok minimum 0 tidak dipantau, jadi tidak pernah berstatus Aman atau Menipis.
 */
export function StockStatusPill({ stock, minStock }: { stock: number; minStock: number }) {
  const status = stockStatus(stock, minStock)
  if (!status) return null
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-none items-center rounded-sm px-2 text-sm whitespace-nowrap',
        status === 'safe' && 'bg-pill-positive text-pill-positive-ink',
        status === 'low' && 'bg-pill-warning text-pill-warning-ink',
        (status === 'out' || status === 'negative') && 'bg-pill-negative text-pill-negative-ink',
      )}
      title={status === 'negative' ? 'Stok sistem minus, perlu dicek' : undefined}
    >
      {STOCK_STATUS_LABELS[status]}
      {status === 'negative' && ' · perlu dicek'}
    </span>
  )
}
