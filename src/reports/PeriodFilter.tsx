import { Input } from '@/components/ui/input'
import { PERIOD_PRESETS, presetRange, type PeriodPreset } from '@/reports/period'
import type { PeriodState } from '@/reports/usePeriod'

/** Pilihan cepat periode; "Pilih tanggal" membuka dua isian tanggal. */
export function PeriodFilter({ period, setPeriod, today }: PeriodState) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Periode"
        className="h-11 rounded-md border border-input bg-card px-3 text-[15px]"
        value={period.preset}
        onChange={(e) => {
          const preset = e.target.value as PeriodPreset
          setPeriod(preset === 'custom' ? { preset, from: period.from, to: period.to } : { preset, ...presetRange(preset, today) })
        }}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {period.preset === 'custom' && (
        <span className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Dari tanggal"
            className="w-auto"
            value={period.from}
            max={today}
            onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })}
          />
          <span className="text-muted-foreground" aria-hidden="true">
            –
          </span>
          <Input
            type="date"
            aria-label="Sampai tanggal"
            className="w-auto"
            value={period.to}
            max={today}
            onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
          />
        </span>
      )}
    </div>
  )
}
