import { Link } from 'react-router'
import { cn } from 'cn'

import { useOnline } from '@/lib/online'
import { useSaleOutbox } from '@/pos/outbox'

type Tone = 'yellow' | 'gray' | 'red'
const TONES: Record<Tone, string> = {
  yellow: 'bg-pill-warning text-pill-warning-ink',
  gray: 'bg-muted text-muted-foreground',
  red: 'bg-pill-negative text-pill-negative-ink',
}

/**
 * Tanda nota belum terkirim (PRD 4.13, R24): hanya muncul saat offline atau ada nota di antrean, dan
 * membuka Riwayat nota. `ringkas` untuk top bar HP: hanya tanda yang paling penting.
 */
export function SyncStatus({ compact = false, onSelect }: { compact?: boolean; onSelect?: () => void }) {
  const online = useOnline()
  const { pending, failed } = useSaleOutbox()
  const badges: { tone: Tone; text: string }[] = []
  if (failed) badges.push({ tone: 'red', text: `${failed} nota gagal terkirim` })
  if (!online) badges.push({ tone: 'yellow', text: pending ? `Offline · ${pending} nota belum terkirim` : 'Offline' })
  else if (pending) badges.push({ tone: 'gray', text: `Mengirim ${pending} nota…` })
  if (!badges.length) return null
  const shown = compact ? badges.slice(0, 1) : badges

  return (
    <Link to="/sales" onClick={onSelect} className="flex flex-col gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2" title="Buka Riwayat nota">
      {shown.map((t) => (
        <span
          key={t.tone}
          role="status"
          className={cn('flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm leading-5', compact && 'h-11 whitespace-nowrap', TONES[t.tone])}
        >
          <span className="size-1.5 flex-none rounded-full bg-current" aria-hidden="true" />
          <span className={cn(compact && 'truncate')}>{t.text}</span>
        </span>
      ))}
    </Link>
  )
}
