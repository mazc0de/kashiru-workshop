import { Link } from 'react-router'
import { Laptop } from 'lucide-react'

import type { Screen } from '@/app/navigation'

/** Kerangka layar sampai layar sebenarnya dibangun di fasenya (IMPLEMENTATION-PLAN.md). */
export function PhasePlaceholder({ screen }: { screen: Screen }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{screen.title}</h1>
      {screen.laptopOnly && (
        <p className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-muted-foreground lg:hidden">
          <Laptop className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Paling nyaman dibuka di laptop
        </p>
      )}
      <p
        className={
          screen.laptopOnly
            ? 'mt-6 hidden rounded-md border border-dashed border-input px-4 py-3 text-muted-foreground lg:block'
            : 'mt-6 rounded-md border border-dashed border-input px-4 py-3 text-muted-foreground'
        }
      >
        Layar ini dibangun di Fase {screen.phase}.
      </p>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-muted-foreground">
        Alamat ini tidak ada di Kashiru.{' '}
        <Link to="/dashboard" className="text-foreground underline underline-offset-4">
          Kembali ke Dashboard
        </Link>
      </p>
    </>
  )
}
