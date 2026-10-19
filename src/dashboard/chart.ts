// Hitungan grafik omzet 30 hari di dashboard (R36): skala sumbu dan label singkat.

const STEPS = [1, 2, 2.5, 5, 10]

/** Skala sumbu dengan sekitar 3 garis bantu di angka bulat; tanpa data hanya garis dasar. */
export function niceScale(max: number, targetTicks = 3): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0] }
  const raw = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = STEPS.find((s) => s * magnitude >= raw)! * magnitude
  const top = Math.ceil(max / step) * step
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

/** 250000 -> "250 rb", 1500000 -> "1,5 jt". Untuk label sumbu yang sempit. */
export function shortRupiah(value: number): string {
  if (value >= 1_000_000) return `${decimal.format(value / 1_000_000)} jt`
  if (value >= 1_000) return `${decimal.format(value / 1_000)} rb`
  return decimal.format(value)
}

const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' })

/** "2026-10-19" -> "Sen, 19/10/2026". */
export function dayLabel(date: string): string {
  const day = weekday.format(new Date(`${date}T00:00:00Z`))
  return `${day}, ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}
