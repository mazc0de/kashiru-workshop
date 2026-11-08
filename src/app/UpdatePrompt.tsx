import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Kasir biasanya membiarkan tab terbuka seharian, jadi versi baru dicek berkala, bukan hanya saat halaman dibuka. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/*
 * Service worker versi baru menunggu sampai kasir menekan "Muat ulang". Tidak reload otomatis supaya
 * pembayaran atau form yang sedang diisi tidak hilang, dan halaman lama tetap memakai berkas versinya
 * sendiri sampai saat itu (potongan layar lama tidak ada lagi di server setelah deploy).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        // Saat offline, cek dilewati; dicoba lagi di putaran berikutnya.
        if (navigator.onLine) registration.update().catch(() => {})
      }, CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm"
    >
      <RefreshCw className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <p className="min-w-0 flex-1">Versi baru Kashiru sudah tersedia.</p>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Muat ulang
      </Button>
    </div>
  )
}
