// Nomor nota dibuat di laptop yang membuat nota, online maupun offline (PRD 4.6, 7.5, ADR 0002, R50):
// {AWALAN}-{YYYYMMDD}-{URUT 4 digit}, urut mulai dari 0001 setiap hari menurut jam laptop (WIB).
// Saat online, urut dicocokkan dengan nomor terakhir di server. Kalau tetap bentrok, server memberi
// urut kosong berikutnya dan menyimpan nomor aslinya.

const wibDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-10-18" menurut WIB. */
export function wibDate(time: Date): string {
  return wibDateFormat.format(time)
}

export function formatSaleNumber(prefix: string, date: string, sequence: number): string {
  return `${prefix}-${date.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`
}

export type StoredSequence = { date: string; last: number }

/**
 * Urut berikutnya untuk tanggal itu: lebih besar dari yang terakhir dipakai di perangkat ini
 * dan yang terakhir tercatat di server (kalau diketahui).
 */
export function nextSequence(stored: StoredSequence | null, date: string, serverLast: number | null): number {
  const local = stored?.date === date ? stored.last : 0
  return Math.max(local, serverLast ?? 0) + 1
}
