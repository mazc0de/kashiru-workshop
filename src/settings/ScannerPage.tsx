import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { db } from '@/lib/localCopy'
import { useBarcodeScanner } from '@/lib/scanner'
import { playSuccess } from '@/lib/sound'
import { findByBarcode, fullName, type LocalProduct } from '@/products/product'

/** Panduan Produk resmi Zebra DS2208 (MN-002874), berisi barcode setelannya. */
const ZEBRA_GUIDE = 'https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/product/ds2208-prg-en.pdf'

const SETTINGS: { title: string; state: string; where: string }[] = [
  {
    title: 'USB Keyboard (HID)',
    state: 'Bawaan pabrik. Pindai hanya kalau scanner pernah diubah ke mode lain.',
    where: 'Bab USB Interface, USB Device Type, halaman 7-5 (halaman 97 di PDF).',
  },
  {
    title: 'US English (North American)',
    state: 'Bawaan pabrik. Layout keyboard lain membuat huruf dan tanda baca terbaca berbeda.',
    where: 'Lampiran B, Country Codes, halaman B-2 (halaman 306 di PDF).',
  },
  {
    title: 'Add Enter Key (Carriage Return/Line Feed)',
    state: 'Wajib dipindai sekali. Bawaan pabrik tidak menambahkan Enter, padahal Kashiru mengenali scan dari Enter di akhir kode.',
    where: 'Bab User Preferences & Miscellaneous Options, halaman 5-29 (halaman 77 di PDF).',
  },
]

type ScanResult = { code: string; at: Date; product: LocalProduct | null }

/**
 * Pengaturan, Scanner (PRD 4.8, 4.14, R49): setelan Zebra DS2208 dengan rujukan ke panduan resmi Zebra,
 * dan uji scan. Barcode setelan tidak dibuat ulang di Kashiru, karena isinya kode khusus Zebra.
 */
export function ScannerPage() {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as LocalProduct[])
  const [scans, setScans] = useState<ScanResult[]>([])
  const [typed, setTyped] = useState('')

  useBarcodeScanner((code) => {
    playSuccess()
    setScans((s) => [{ code, at: new Date(), product: findByBarcode(products, code) }, ...s].slice(0, 5))
  })

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">
        Kashiru membaca scanner Zebra DS2208 sebagai keyboard: setiap scan diketik sangat cepat lalu diakhiri Enter. Tidak perlu driver tambahan.
      </p>

      <section aria-labelledby="scanner-settings" className="mt-6 max-w-[720px] rounded-md border border-border bg-card p-5">
        <h2 id="scanner-settings" className="font-semibold">
          Setelan DS2208
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Barcode setelannya ada di{' '}
          <a href={ZEBRA_GUIDE} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
            panduan resmi Zebra DS2208 (PDF)
          </a>
          . Buka di layar lain atau cetak halamannya, lalu pindai barcode dengan nama yang sama persis.
        </p>
        <ol className="mt-4 flex flex-col gap-4">
          {SETTINGS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm">{s.state}</p>
                <p className="text-sm text-muted-foreground">{s.where}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-rule pt-4 text-sm text-muted-foreground">
          Kalau setelan scanner kacau, pindai <span className="text-foreground">Set Factory Defaults</span> (halaman 5-5, halaman 53 di PDF), lalu
          ulangi langkah 3.
        </p>
      </section>

      <section aria-labelledby="scanner-test" className="mt-4 max-w-[720px] rounded-md border border-border bg-card p-5">
        <h2 id="scanner-test" className="font-semibold">
          Uji scan
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pindai barcode apa saja. Yang terbaca sebagai scan muncul di sini dengan bunyi beep, beserta nama produknya kalau sudah terdaftar.
        </p>
        <ul className="mt-3 overflow-hidden rounded-md border border-border" aria-live="polite">
          {scans.length === 0 && <li className="px-4 py-3 text-muted-foreground">Belum ada scan.</li>}
          {scans.map((s, i) => (
            <li key={`${s.at.getTime()}-${i}`} className="flex items-center justify-between gap-4 border-rule px-4 py-2.5 not-first:border-t">
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">{s.code}</span>
                <span className="block truncate text-sm text-muted-foreground">{s.product ? fullName(s.product) : 'Belum terdaftar di Produk'}</span>
              </span>
              <span className="shrink-0 text-sm text-muted-foreground">{formatDateTime(s.at).slice(11)}</span>
            </li>
          ))}
        </ul>

        <label htmlFor="scanner-typed" className="mt-4 block text-sm font-medium">
          Scan tidak muncul di daftar? Klik kolom ini lalu pindai sekali lagi
        </label>
        <Input id="scanner-typed" className="mt-1.5 font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>Kode muncul di kolom, tetapi tidak di daftar: Enter belum ditambahkan (langkah 3).</li>
          <li>Kode di daftar berbeda dari angka di bawah barcode: periksa layout keyboard (langkah 2).</li>
          <li>Tidak muncul apa pun: periksa kabel USB dan mode USB Keyboard (langkah 1).</li>
        </ul>
      </section>
    </>
  )
}
