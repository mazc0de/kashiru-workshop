import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/lib/online'
import { SETTINGS_QUERY_KEY, useSettings } from '@/lib/settings'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  hours: z.coerce
    .number<string>({ error: 'Isi dengan angka jam' })
    .int('Isi dengan angka jam tanpa koma')
    .min(1, 'Paling sedikit 1 jam'),
})

/** Pengaturan, Keamanan: durasi logout otomatis (PRD 4.1, 4.14). Perubahannya tercatat di riwayat. */
export function SecurityPage() {
  const settings = useSettings()
  const online = useOnline()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { hours: '' },
  })
  const { errors, isDirty } = form.formState

  const currentHours = settings.data?.auto_logout_jam
  useEffect(() => {
    if (currentHours !== undefined) form.reset({ hours: String(currentHours) })
  }, [currentHours, form])

  const save = useMutation({
    mutationFn: async ({ hours }: z.output<typeof schema>) => {
      const { error } = await supabase().from('store_settings').update({ auto_logout_jam: hours }).eq('id', 1)
      if (error) throw new Error(error.message)
      return hours
    },
    onSuccess: async (hours) => {
      form.reset({ hours: String(hours) })
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
    },
  })

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Keamanan</h1>
      <p className="mt-1 text-muted-foreground">Berlaku untuk semua akun di semua perangkat.</p>

      <section className="mt-8 grid gap-6 border-t border-rule pt-8 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <h2 className="text-base font-medium">Logout otomatis</h2>
          <p className="mt-1 text-muted-foreground">
            Akun keluar sendiri kalau perangkat tidak dipakai selama waktu ini. Saat offline, logout otomatis ditunda
            supaya kasir tetap bisa membuat nota.
          </p>
        </div>
        <form
          onSubmit={form.handleSubmit((values) => {
            setSaved(false)
            save.mutate(values)
          })}
          noValidate
          className="flex max-w-[480px] flex-col gap-4 rounded-md border border-border bg-card p-5"
        >
          <Field id="auto-logout" label="Keluar setelah tidak ada aktivitas selama" error={errors.hours?.message}>
            <div className="flex items-center gap-3">
              <Input
                id="auto-logout"
                inputMode="numeric"
                className="w-28 text-right"
                aria-invalid={Boolean(errors.hours)}
                disabled={!settings.data}
                {...form.register('hours', { onChange: () => setSaved(false) })}
              />
              <span className="text-muted-foreground">jam</span>
            </div>
          </Field>
          {save.isError && <Notice tone="error">{save.error.message}</Notice>}
          <div className="flex items-center justify-end gap-3">
            {saved && !isDirty && <span className="text-sm text-muted-foreground">Tersimpan</span>}
            <Button type="submit" disabled={!online || save.isPending || !isDirty}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </form>
      </section>
    </>
  )
}
