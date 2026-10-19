import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Paged } from '@/lib/paginate'

/** "1–50 dari 230 produk" dengan tombol halaman sebelumnya dan berikutnya. Tidak tampil untuk satu halaman. */
export function Pagination({ paged, unit, onPage }: { paged: Paged<unknown>; unit: string; onPage: (page: number) => void }) {
  if (paged.pageCount <= 1) return null
  return (
    <nav aria-label="Halaman" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground tabular-nums">
        {paged.from}–{paged.to} dari {paged.total} {unit}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={paged.page <= 1} onClick={() => onPage(paged.page - 1)}>
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sebelumnya
        </Button>
        <span className="min-w-[110px] text-center text-sm tabular-nums" aria-live="polite">
          Halaman {paged.page} dari {paged.pageCount}
        </span>
        <Button variant="outline" disabled={paged.page >= paged.pageCount} onClick={() => onPage(paged.page + 1)}>
          Berikutnya
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
