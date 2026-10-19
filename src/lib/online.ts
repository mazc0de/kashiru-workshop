import { useSyncExternalStore } from 'react'

function subscribe(changed: () => void) {
  window.addEventListener('online', changed)
  window.addEventListener('offline', changed)
  return () => {
    window.removeEventListener('online', changed)
    window.removeEventListener('offline', changed)
  }
}

/**
 * Hasil `janji`, atau null kalau belum selesai dalam `ms`. Dipakai supaya kasir tidak tertahan saat Wi-Fi
 * tersambung tetapi internet mati: Supabase Auth bisa menahan semua permintaan sampai 30 detik selama
 * mencoba memperpanjang token.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([Promise.resolve(promise), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

/** true selama browser terhubung ke jaringan. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
