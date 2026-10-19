// Format tampilan baku (PRD 6, PRD 9): Rupiah tanpa desimal, qty pecahan dengan koma
// tanpa nol di belakang, tanggal DD/MM/YYYY dan jam HH:MM dalam WIB.

const TIME_ZONE = 'Asia/Jakarta'

const integerFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const qtyFormat = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Nilai rupiah dibulatkan ke rupiah terdekat (0,5 ke atas), sesuai PRD 4.6. */
function roundRupiah(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value))
  return Object.is(rounded, -0) ? 0 : rounded
}

/** 125000 -> "125.000". Untuk kolom angka di struk dan tabel. */
export function formatNumber(value: number): string {
  return integerFormat.format(roundRupiah(value))
}

/** 125000 -> "Rp 125.000", -5000 -> "-Rp 5.000". */
export function formatRupiah(value: number): string {
  const rounded = roundRupiah(value)
  return `${rounded < 0 ? '-' : ''}Rp ${integerFormat.format(Math.abs(rounded))}`
}

/** 0.8 -> "0,8", 1.5 -> "1,5", 2 -> "2". Paling banyak 2 angka di belakang koma. */
export function formatQty(value: number): string {
  return qtyFormat.format(value)
}

function getParts(time: Date | string) {
  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(new Date(time)).map((b) => [b.type, b.value]),
  )
  return parts as Record<'day' | 'month' | 'year' | 'hour' | 'minute', string>
}

/** "18/10/2026" menurut WIB. */
export function formatDate(time: Date | string): string {
  const b = getParts(time)
  return `${b.day}/${b.month}/${b.year}`
}

/** "18/10/2026 14:32" menurut WIB. */
export function formatDateTime(time: Date | string): string {
  const b = getParts(time)
  return `${b.day}/${b.month}/${b.year} ${b.hour}:${b.minute}`
}

/**
 * Isian rupiah dari keyboard: "45.000", "45000", "Rp 45.000" -> 45000.
 * Hanya angka bulat tidak negatif; selain itu null.
 */
export function parseRupiah(text: string): number | null {
  const clean = text.replace(/^\s*rp\s*/i, '').replace(/[.\s]/g, '')
  if (!/^\d+$/.test(clean)) return null
  return Number(clean)
}

/**
 * Isian qty: koma atau titik sebagai desimal, paling banyak 2 angka di belakangnya.
 * "1,5" -> 1.5, "2" -> 2, "0.25" -> 0.25. Selain itu null.
 */
export function parseQty(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Number(clean)
}
