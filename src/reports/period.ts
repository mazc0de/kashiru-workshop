// Filter periode laporan dan menu Riwayat (R33, R35). Tanggal berupa teks "YYYY-MM-DD" menurut WIB,
// disimpan di alamat halaman supaya pindah tab tidak mengulang pilihan.

export type PeriodPreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom'

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: 'last7', label: '7 hari terakhir' },
  { id: 'thisMonth', label: 'Bulan ini' },
  { id: 'lastMonth', label: 'Bulan lalu' },
  { id: 'custom', label: 'Pilih tanggal' },
]

export type Period = { preset: PeriodPreset; from: string; to: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Tambah n hari pada tanggal "YYYY-MM-DD" (aritmetika kalender, tanpa zona waktu). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'lastMonth': {
      const lastDay = addDays(`${today.slice(0, 7)}-01`, -1)
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay }
    }
  }
}

/** Periode dari alamat halaman; default Bulan ini. Rentang terbalik ditukar. */
export function readPeriod(params: URLSearchParams, today: string): Period {
  const preset = params.get('period') as PeriodPreset | null
  if (preset === 'custom') {
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    if (ISO.test(from) && ISO.test(to)) return from <= to ? { preset, from, to } : { preset, from: to, to: from }
  }
  const valid = PERIOD_PRESETS.some((p) => p.id === preset && p.id !== 'custom')
  const chosen = valid ? (preset as Exclude<PeriodPreset, 'custom'>) : 'thisMonth'
  return { preset: chosen, ...presetRange(chosen, today) }
}

export function periodParams(p: Period): Record<string, string> {
  return p.preset === 'custom' ? { period: 'custom', from: p.from, to: p.to } : { period: p.preset }
}

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

/** "01/10/2026 – 19/10/2026", atau satu tanggal kalau dari dan sampai sama. */
export function periodLabel(p: Pick<Period, 'from' | 'to'>): string {
  return p.from === p.to ? dmy(p.from) : `${dmy(p.from)} – ${dmy(p.to)}`
}
