import { useRef, useState } from 'react'

import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReceiptSheet } from '@/pos/ReceiptSheet'
import { sampleReceipt } from '@/pos/receipt'
import { deleteLogoFile, uploadLogo, useLogo } from '@/lib/logo'
import { useOnline } from '@/lib/online'
import { useSettings, type Settings } from '@/lib/settings'
import { useSaveSettings } from '@/settings/saveSettings'

type FormValues = { name: string; address: string; phone: string; footer: string }

const fromSettings = (p: Settings): FormValues => ({
  name: p.nama_bengkel,
  address: p.alamat ?? '',
  phone: p.telepon ?? '',
  footer: p.footer_struk ?? '',
})

/** Pengaturan, Profil bengkel (PRD 4.14): nama, alamat, telepon, logo, dan teks footer struk, dengan pratinjau struk. */
export function WorkshopProfilePage() {
  const settings = useSettings()
  if (!settings.data) return <h1 className="text-2xl font-semibold tracking-tight">Profil bengkel</h1>
  return <WorkshopProfileForm p={settings.data} />
}

function WorkshopProfileForm({ p }: { p: Settings }) {
  const online = useOnline()
  const [values, setValues] = useState<FormValues>(() => fromSettings(p))
  const [saved, setSaved] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const logo = useLogo(p.logo_url)
  const save = useSaveSettings(() => setSaved(true))

  const update = (key: keyof FormValues, value: string) => {
    setValues({ ...values, [key]: value })
    setSaved(false)
  }
  const changed = JSON.stringify(values) !== JSON.stringify(fromSettings(p))
  const nameEmpty = !values.name.trim()

  const replaceLogo = async (file: File | undefined) => {
    if (!file) return
    setLogoError(null)
    setUploading(true)
    try {
      const oldPath = p.logo_url
      const path = await uploadLogo(file)
      await save.mutateAsync({ logo_url: path })
      if (oldPath) await deleteLogoFile(oldPath)
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const removeLogo = async () => {
    const oldPath = p.logo_url
    await save.mutateAsync({ logo_url: null })
    if (oldPath) await deleteLogoFile(oldPath)
  }

  const width = p.ukuran_kertas === 58 ? 58 : 80

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Profil bengkel</h1>
      <p className="mt-1 text-muted-foreground">Dicetak di bagian atas dan bawah setiap struk.</p>

      <div className="mt-6 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_auto]">
        <form
          noValidate
          className="flex max-w-[560px] flex-col gap-4 rounded-md border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (nameEmpty) return
            save.mutate({
              nama_bengkel: values.name,
              alamat: values.address || null,
              telepon: values.phone || null,
              footer_struk: values.footer || null,
            })
          }}
        >
          <Field id="workshop-name" label="Nama bengkel" error={nameEmpty ? 'Nama bengkel wajib diisi' : undefined}>
            <Input id="workshop-name" value={values.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field id="workshop-address" label="Alamat">
            <Input id="workshop-address" value={values.address} onChange={(e) => update('address', e.target.value)} />
          </Field>
          <Field id="workshop-phone" label="Telepon">
            <Input id="workshop-phone" inputMode="tel" value={values.phone} onChange={(e) => update('phone', e.target.value)} />
          </Field>
          <Field id="workshop-footer" label="Teks footer struk" hint="Opsional, mis. jam buka atau nomor WhatsApp. Dicetak sebelum ucapan terima kasih.">
            <textarea
              id="workshop-footer"
              rows={2}
              className="rounded-md border border-input bg-card px-3 py-2 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={values.footer}
              onChange={(e) => update('footer', e.target.value)}
            />
          </Field>
          {save.isError && <Notice tone="error">{save.error.message}</Notice>}
          <div className="flex items-center justify-end gap-3">
            {saved && !changed && <span className="text-sm text-muted-foreground">Tersimpan</span>}
            <Button type="submit" disabled={!online || !changed || nameEmpty || save.isPending}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>

          <div className="border-t border-rule pt-4">
            <span className="text-sm font-medium">Logo</span>
            <p className="text-sm text-muted-foreground">Opsional. PNG atau JPG, paling besar 200 KB. Dicetak hitam-putih.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {logo && <img src={logo} alt="Logo bengkel" className="h-12 rounded-sm border border-border bg-white object-contain p-1 grayscale" />}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="sr-only" id="workshop-logo" onChange={(e) => void replaceLogo(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={!online || uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? 'Mengunggah…' : p.logo_url ? 'Ganti logo' : 'Unggah logo'}
              </Button>
              {p.logo_url && (
                <Button type="button" variant="ghost" disabled={!online || uploading} onClick={() => void removeLogo()}>
                  Hapus logo
                </Button>
              )}
            </div>
            {logoError && <p className="mt-2 text-sm text-negative" role="alert">{logoError}</p>}
          </div>
        </form>

        <figure>
          <figcaption className="mb-2 text-sm text-muted-foreground">Pratinjau struk {width} mm</figcaption>
          <div className="rounded-md border border-border bg-white p-4 shadow-sm">
            <ReceiptSheet
              screen
              width={width}
              logo={logo}
              data={sampleReceipt({ name: values.name || 'Nama bengkel', address: values.address || null, phone: values.phone || null, footer: values.footer || null })}
            />
          </div>
        </figure>
      </div>
    </>
  )
}
