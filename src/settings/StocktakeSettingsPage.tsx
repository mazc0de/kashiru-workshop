import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { useSaveSettings } from '@/settings/saveSettings'

/** Pengaturan, Opname (PRD 4.5, 4.14): blind count. */
export function StocktakeSettingsPage() {
  const settings = useSettings()
  const online = useOnline()
  const save = useSaveSettings()
  const p = settings.data

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Opname</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">Berlaku untuk sesi yang sedang terbuka maupun sesi berikutnya.</p>
      {p && (
        <div className="mt-6 flex max-w-[560px] flex-col gap-3 rounded-md border border-border bg-card p-5">
          <span className="block text-sm font-medium" id="label-blind">
            Blind count
          </span>
          <div role="radiogroup" aria-labelledby="label-blind" className="inline-flex h-11 w-fit rounded-md border border-input bg-card p-1">
            {(
              [
                [true, 'Aktif'],
                [false, 'Mati'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={p.blind_count === value}
                disabled={!online || save.isPending}
                onClick={() => p.blind_count !== value && save.mutate({ blind_count: value })}
                className={cn('rounded-sm px-4 text-[15px] text-muted-foreground', p.blind_count === value && 'bg-active text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Aktif: stok sistem disembunyikan di layar hitung dan input lembar hitung, supaya penghitung tidak terpengaruh angka sistem. Stok sistem tetap terlihat di
            langkah Tinjau.
          </p>
          {save.isError && <Notice tone="error">{save.error.message}</Notice>}
        </div>
      )}
    </>
  )
}
