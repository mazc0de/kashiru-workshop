import { useState } from 'react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { formatNumber, formatDateTime } from '@/lib/format'
import { useLogo } from '@/lib/logo'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { retry, useSaleOutbox, type OutboxSale } from '@/pos/outbox'
import { printReceipt } from '@/pos/printReceipt'

/**
 * Bagian "Belum terkirim" di Riwayat nota (PRD 4.13, R24): nota di antrean laptop ini, tetap tampil saat
 * offline. Nota bisa dicetak sebagai SALINAN; nota gagal bisa dicoba lagi tetapi tidak bisa dihapus.
 */
export function UnsentSalesSection() {
  const online = useOnline()
  const { queue, isSending } = useSaleOutbox()
  const settings = useSettings()
  const logo = useLogo(settings.data?.logo_url)
  const [retrying, setRetrying] = useState<string | null>(null)
  if (!queue.length) return null

  const print = (n: OutboxSale) => {
    if (settings.data) void printReceipt({ ...n.receipt, isCopy: true }, settings.data.ukuran_kertas === 58 ? 58 : 80, logo, 1)
  }
  const rerun = async (n: OutboxSale) => {
    setRetrying(n.clientId)
    await retry(n.clientId).catch(() => undefined)
    setRetrying(null)
  }

  return (
    <section aria-labelledby="unsent-title" className="mt-6">
      <h2 id="unsent-title" className="text-lg font-semibold">
        Belum terkirim
      </h2>
      <p className="mt-0.5 text-muted-foreground">
        Tersimpan di laptop ini dan {online ? 'dikirim otomatis sesuai urutan dibuat' : 'dikirim otomatis saat online'}. Stok di server dan laporan baru
        menghitungnya setelah terkirim.
      </p>
      <ul className="mt-3 overflow-hidden rounded-md border border-border bg-card">
        {queue.map((n) => {
          const who = [n.receipt.plate, n.receipt.customer].filter(Boolean).join(' · ')
          const failed = n.status === 'failed'
          return (
            <li key={n.clientId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule px-4 py-2.5 first:border-t-0">
              <span className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <span className="block truncate font-mono text-sm">{n.number}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {formatDateTime(n.createdAt)} · {n.receipt.cashier}
                  {who && ` · ${who}`}
                </span>
              </span>
              <span
                className={cn(
                  'inline-flex h-6 items-center rounded-sm px-2 text-sm whitespace-nowrap',
                  failed ? 'bg-pill-negative text-pill-negative-ink' : 'bg-muted text-muted-foreground',
                )}
              >
                {failed ? 'Gagal' : 'Menunggu dikirim'}
              </span>
              <span className="ml-auto text-right sm:ml-0 sm:w-[96px]">{formatNumber(n.total)}</span>
              <span className="flex gap-2">
                <Button variant="outline" onClick={() => print(n)}>
                  Cetak
                </Button>
                {failed && (
                  <Button variant="outline" disabled={!online || isSending || retrying !== null} onClick={() => void rerun(n)}>
                    {retrying === n.clientId ? 'Mengirim…' : 'Coba lagi'}
                  </Button>
                )}
              </span>
              {failed && n.reason && <span className="basis-full text-sm text-negative">Ditolak server: {n.reason}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
