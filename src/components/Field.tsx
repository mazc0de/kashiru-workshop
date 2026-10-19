import type { ReactNode } from 'react'
import { cn } from 'cn'

import { Label } from '@/components/ui/label'

/** Label di atas isian, keterangan abu, dan pesan salah di bawahnya. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-salah`} role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Tombol di samping isian Field: diberi baris kosong setinggi label, jadi tombolnya sejajar dengan isian
 * walaupun di bawah isian muncul keterangan atau pesan salah.
 */
export function FieldAction({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span aria-hidden="true" className="text-sm leading-none select-none">
        &nbsp;
      </span>
      {children}
    </div>
  )
}
