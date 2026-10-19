import type { ReactNode } from 'react'
import { cn } from 'cn'

const TONES = {
  info: 'border-border bg-card text-foreground',
  warning: 'border-[#fde68a] bg-pill-warning text-pill-warning-ink dark:border-pill-warning',
  error: 'border-pill-negative bg-pill-negative text-pill-negative-ink',
} as const

/** Satu kalimat pemberitahuan di dalam bloknya, bukan banner layar penuh. */
export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-4 py-3 text-sm', TONES[tone], className)}>
      {children}
    </div>
  )
}
