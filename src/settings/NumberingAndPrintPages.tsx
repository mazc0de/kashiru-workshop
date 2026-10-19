import { useState } from 'react'
import { cn } from 'cn'

import { Field, FieldAction } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { printReceipt } from '@/pos/printReceipt'
import { formatSaleNumber, wibDate } from '@/pos/saleNumber'
import { sampleReceipt } from '@/pos/receipt'
import { useLogo } from '@/lib/logo'
import { useOnline } from '@/lib/online'
import { useSettings, type Settings } from '@/lib/settings'
import { useSaveSettings } from '@/settings/saveSettings'

const PREFIX_PATTERN = /^[A-Z0-9]{1,5}$/

/** Pengaturan, Nomor dokumen (PRD 4.14, R9): awalan nota, penerimaan, dan opname. */
export function DocumentNumbersPage() {
  const settings = useSettings()
  if (!settings.data) return <h1 className="text-2xl font-semibold tracking-tight">Nomor dokumen</h1>
  return <DocumentNumberForm p={settings.data} />
}

function DocumentNumberForm({ p }: { p: Settings }) {
  const online = useOnline()
  const [values, setValues] = useState({ sale: p.awalan_nota, receiving: p.awalan_penerimaan, stocktake: p.awalan_opname })
  const [saved, setSaved] = useState(false)
  const [today] = useState(() => wibDate(new Date()))
  const save = useSaveSettings(() => setSaved(true))

  const prefixError = (v: string) => (PREFIX_PATTERN.test(v) ? undefined : 'Huruf A-Z dan angka, 1 sampai 5 karakter')
  const duplicate = new Set([values.sale, values.receiving, values.stocktake]).size < 3
  const valid = !prefixError(values.sale) && !prefixError(values.receiving) && !prefixError(values.stocktake) && !duplicate
  const changed = values.sale !== p.awalan_nota || values.receiving !== p.awalan_penerimaan || values.stocktake !== p.awalan_opname
  const update = (k: keyof typeof values, v: string) => {
    setValues({ ...values, [k]: v.toUpperCase().replace(/\s/g, '') })
    setSaved(false)
  }

  const rows = [
    { key: 'sale' as const, label: 'Nota', example: formatSaleNumber(values.sale, today, 1) },
    { key: 'receiving' as const, label: 'Penerimaan', example: formatSaleNumber(values.receiving, today, 1) },
    { key: 'stocktake' as const, label: 'Sesi opname', example: `${values.stocktake}-${today.replaceAll('-', '')}-01` },
  ]

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Nomor dokumen</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">
        Format {'{AWALAN}-{YYYYMMDD}-{URUT}'}. Urut mulai dari awal setiap hari. Mengganti awalan tidak mengulang nomor urut.
      </p>
      <form
        noValidate
        className="mt-6 flex max-w-[560px] flex-col gap-4 rounded-md border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save.mutate({ awalan_nota: values.sale, awalan_penerimaan: values.receiving, awalan_opname: values.stocktake })
        }}
      >
        {rows.map((b) => (
          <Field key={b.key} id={`awalan-${b.key}`} label={`Awalan ${b.label.toLowerCase()}`} hint={`Contoh: ${b.example}`} error={prefixError(values[b.key])}>
            <Input id={`awalan-${b.key}`} className="w-32 font-mono uppercase" maxLength={5} value={values[b.key]} onChange={(e) => update(b.key, e.target.value)} />
          </Field>
        ))}
        {duplicate && <Notice tone="error">Ketiga awalan harus berbeda.</Notice>}
        {save.isError && <Notice tone="error">{save.error.message}</Notice>}
        <div className="flex items-center justify-end gap-3">
          {saved && !changed && <span className="text-sm text-muted-foreground">Tersimpan</span>}
          <Button type="submit" disabled={!online || !changed || !valid || save.isPending}>
            {save.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </form>
    </>
  )
}

/** Pengaturan, Cetak (PRD 4.10, 4.14): ukuran kertas dan jumlah salinan struk. */
export function PrintSettingsPage() {
  const settings = useSettings()
  if (!settings.data) return <h1 className="text-2xl font-semibold tracking-tight">Cetak</h1>
  return <PrintPanel p={settings.data} />
}

function PrintPanel({ p }: { p: Settings }) {
  const online = useOnline()
  const logo = useLogo(p.logo_url)
  const [copies, setCopies] = useState(String(p.jumlah_salinan))
  const [saved, setSaved] = useState(false)
  const save = useSaveSettings(() => setSaved(true))

  const n = Number(copies)
  const copiesValid = Number.isInteger(n) && n >= 1 && n <= 5
  const width = p.ukuran_kertas === 58 ? 58 : 80

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Cetak</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">
        Berlaku untuk struk, label barcode, lembar hitung opname, saran belanja, dan ringkasan harian. Atur juga ukuran kertas yang sama di driver printer Windows.
      </p>
      <div className="mt-6 flex max-w-[560px] flex-col gap-5 rounded-md border border-border bg-card p-5">
        <div>
          <span className="block text-sm font-medium" id="label-paper">
            Ukuran kertas
          </span>
          <div role="radiogroup" aria-labelledby="label-paper" className="mt-2 inline-flex h-11 rounded-md border border-input bg-card p-1">
            {([80, 58] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={p.ukuran_kertas === u}
                disabled={!online || save.isPending}
                onClick={() => {
                  setSaved(false)
                  save.mutate({ ukuran_kertas: u })
                }}
                className={cn('rounded-sm px-4 text-[15px] text-muted-foreground', p.ukuran_kertas === u && 'bg-active text-foreground')}
              >
                {u} mm
              </button>
            ))}
          </div>
        </div>
        <form
          noValidate
          className="flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (copiesValid) {
              setSaved(false)
              save.mutate({ jumlah_salinan: n })
            }
          }}
        >
          <Field id="receipt-copies" label="Jumlah salinan struk" error={copiesValid ? undefined : 'Isi 1 sampai 5'}>
            <Input id="receipt-copies" inputMode="numeric" className="w-24 text-right" value={copies} onChange={(e) => setCopies(e.target.value)} />
          </Field>
          <FieldAction>
            <Button type="submit" variant="outline" disabled={!online || !copiesValid || n === p.jumlah_salinan || save.isPending}>
              Simpan
            </Button>
          </FieldAction>
        </form>
        {saved && <span className="text-sm text-muted-foreground">Tersimpan</span>}
        {save.isError && <Notice tone="error">{save.error.message}</Notice>}
        <div className="border-t border-rule pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void printReceipt(
                sampleReceipt({ name: p.nama_bengkel, address: p.alamat, phone: p.telepon, footer: p.footer_struk }),
                width,
                logo,
                1,
              )
            }
          >
            Cetak contoh struk
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">Untuk memeriksa lebar kertas dan pemotong otomatis printer.</p>
        </div>
      </div>
    </>
  )
}
