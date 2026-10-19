import { useEffect } from 'react'

import { readStored, removeStored, writeStored } from '@/lib/localStore'

// Logout otomatis setelah tidak ada aktivitas selama durasi di Pengaturan (default 12 jam),
// ditunda selama offline (PRD 4.1). Waktu aktivitas disimpan di perangkat, jadi tetap dihitung
// walaupun browser ditutup.

const KEY = 'kashiru.lastActivity'
const WRITE_INTERVAL_MS = 15_000
const CHECK_INTERVAL_MS = 60_000
export const DEFAULT_LOGOUT_HOURS = 12

export function isExpired(lastActiveMs: number, nowMs: number, hours: number): boolean {
  return nowMs - lastActiveMs >= hours * 3_600_000
}

export function recordActivity(timeMs = Date.now()): void {
  writeStored(KEY, timeMs)
}

export function forgetActivity(): void {
  removeStored(KEY)
}

export function autoLogoutMessage(hours: number): string {
  return `Keluar otomatis karena tidak ada aktivitas selama ${hours} jam.`
}

export function useAutoLogout(hours: number, signOut: (message: string) => void): void {
  useEffect(() => {
    if (readStored<number>(KEY) === null) recordActivity()

    let lastWritten = 0
    const mark = () => {
      const now = Date.now()
      if (now - lastWritten >= WRITE_INTERVAL_MS) {
        lastWritten = now
        recordActivity(now)
      }
    }
    const check = () => {
      if (!navigator.onLine) return
      const last = readStored<number>(KEY) ?? Date.now()
      if (isExpired(last, Date.now(), hours)) signOut(autoLogoutMessage(hours))
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    check()
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    window.addEventListener('pointerdown', mark)
    window.addEventListener('keydown', mark)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pointerdown', mark)
      window.removeEventListener('keydown', mark)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hours, signOut])
}
