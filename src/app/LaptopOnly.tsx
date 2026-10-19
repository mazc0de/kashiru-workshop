import type { ReactNode } from 'react'
import { Laptop } from 'lucide-react'

import { useIsLaptop } from '@/lib/useIsLaptop'

/**
 * Layar kasir, opname, penerimaan, form produk, dan pengaturan hanya dirancang untuk laptop (PRD 6).
 * Di layar di bawah 1024px, judulnya tetap tampil dengan pesan "Paling nyaman dibuka di laptop".
 * Hanya satu versi yang dirender, jadi layar laptop (mis. pendengar scan di Kasir) tidak berjalan di HP
 * dan halaman hanya punya satu h1.
 */
export function LaptopOnly({ title, children }: { title: string; children: ReactNode }) {
  if (useIsLaptop()) return children
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-muted-foreground">
        <Laptop className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Paling nyaman dibuka di laptop
      </p>
    </>
  )
}
