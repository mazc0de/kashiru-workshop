import { formatNumber, formatQty, formatDateTime } from '@/lib/format'
import type { PaperWidth } from '@/lib/print'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/pos/calculate'
import {
  DIVIDER,
  centerRows,
  countChars,
  labelValueRows,
  left,
  leftRightRows,
  rowToString,
  wrapText,
  type Measure,
  type Row,
} from '@/lib/textLayout'

// Isi struk sebagai baris teks lebar tetap (PRD 4.10): 48 karakter untuk kertas 80 mm, 32 untuk 58 mm.
// Baris yang kosong tidak dicetak. Angka rata kanan sampai tepi kertas.

export type ReceiptWidth = 32 | 48

/** 80 mm memuat 48 karakter, 58 mm memuat 32 karakter (PRD 4.10). */
export const CHARS_PER_LINE: Record<PaperWidth, ReceiptWidth> = { 58: 32, 80: 48 }

export type ReceiptLine = {
  type: 'part' | 'jasa'
  name: string
  brand: string | null
  qty: number
  price: number
  amount: number
  discount: number
}

export type ReceiptData = {
  workshop: { name: string; address: string | null; phone: string | null; footer: string | null }
  number: string
  time: string | Date
  cashier: string
  plate: string | null
  customer: string | null
  /**
   * Keterangan nota, hanya dari keranjang di laptop (R62). Tidak tersimpan di server, jadi cetak ulang dari
   * Riwayat nota dan struk yang tersimpan sebelum ada keterangan tidak punya isian ini.
   */
  description?: string | null
  mechanic: string | null
  serviceNote: string | null
  lines: ReceiptLine[]
  subtotal: number
  saleDiscount: number
  total: number
  method: PaymentMethod
  cash: number
  change: number
  /** Cetak ulang dari riwayat nota diberi tanda SALINAN. */
  isCopy: boolean
  void: boolean
}

/** Pecah teks per kata supaya muat di lebar kertas; kata yang terlalu panjang dipotong paksa. */
export function wrap(text: string, width: number): string[] {
  return wrapText(text, width)
}

const asText = (rows: Row[], width: number) => rows.map((b) => rowToString(b, width))

export function center(text: string, width: number): string[] {
  return asText(centerRows(text, width), width)
}

/** Teks kiri dan angka rata kanan; kalau tidak muat, angka turun ke baris terakhir atau baris baru. */
export function leftRight(leftText: string, rightText: string, width: number): string[] {
  return asText(leftRightRows(leftText, rightText, width), width)
}

/** "Nopol: B 1234 XYZ": label tetap, isi dibungkus dengan indentasi menggantung selebar label. */
export function labelValue(label: string, value: string, width: number): string[] {
  return asText(labelValueRows(label, value, width), width)
}

const rupiah = (n: number) => `Rp ${formatNumber(n)}`

/** Struk sebagai teks lebar tetap, untuk huruf sama lebar. */
export function buildReceipt(d: ReceiptData, width: ReceiptWidth): string[] {
  return asText(buildReceiptRows(d, width), width)
}

/**
 * Struk sebagai baris berkolom. `measure` mengukur lebar teks dalam kolom: bawaannya satu karakter satu
 * kolom (Courier New); untuk huruf proporsional diukur dari hurufnya, supaya nama barang dibungkus tepat.
 */
export function buildReceiptRows(d: ReceiptData, width: ReceiptWidth, measure: Measure = countChars): Row[] {
  const out: Row[] = []
  const text = (t: string) => out.push(...wrapText(t, width, measure).map((b) => [left(b)]))
  const centered = (t: string) => out.push(...centerRows(t, width, measure))
  const amount = (l: string, r: string) => out.push(...leftRightRows(l, r, width, measure))

  centered(d.workshop.name.toUpperCase())
  if (d.workshop.address) centered(d.workshop.address)
  if (d.workshop.phone) centered(d.workshop.phone)
  if (d.void) centered('*** VOID ***')
  if (d.isCopy) centered('*** SALINAN ***')
  out.push(DIVIDER)

  const info: [string, string | null][] = [
    ['No   : ', d.number],
    ['Tgl  : ', formatDateTime(d.time)],
    ['Kasir: ', d.cashier],
    ['Nopol: ', d.plate],
    ['Plg  : ', d.customer],
    ['Ket  : ', d.description ?? null],
    ['Mek  : ', d.mechanic],
  ]
  for (const [label, value] of info) {
    if (value) out.push(...labelValueRows(label, value, width, measure))
  }
  out.push(DIVIDER)

  const writeLine = (b: ReceiptLine) => {
    const name = b.brand ? `${b.name} · ${b.brand}` : b.name
    if (b.type === 'jasa' && b.qty === 1) {
      amount(name, formatNumber(b.amount))
    } else {
      text(name)
      amount(`  ${formatQty(b.qty)} x ${formatNumber(b.price)}`, formatNumber(b.amount))
    }
    if (b.discount > 0) amount('  Diskon', `-${formatNumber(b.discount)}`)
  }
  const part = d.lines.filter((b) => b.type === 'part')
  const services = d.lines.filter((b) => b.type === 'jasa')
  if (part.length) {
    text('PART')
    part.forEach(writeLine)
  }
  if (services.length) {
    text('JASA')
    services.forEach(writeLine)
  }
  out.push(DIVIDER)

  amount('Subtotal', formatNumber(d.subtotal))
  if (d.saleDiscount > 0) amount('Diskon nota', `-${formatNumber(d.saleDiscount)}`)
  amount('TOTAL', rupiah(d.total))
  amount(PAYMENT_METHOD_LABELS[d.method], rupiah(d.cash))
  if (d.method === 'tunai') amount('Kembali', rupiah(d.change))
  out.push(DIVIDER)

  if (d.serviceNote) text(d.serviceNote)
  if (d.workshop.footer) centered(d.workshop.footer)
  centered('Terima kasih atas kunjungan Anda')
  return out
}

/** Nota contoh untuk pratinjau dan cetak uji di Pengaturan (angka dari contoh PRD 4.10). */
export function sampleReceipt(workshop: ReceiptData['workshop']): ReceiptData {
  return {
    workshop,
    number: 'KSR-20261018-0007',
    time: '2026-10-18T07:32:00Z',
    cashier: 'Rina',
    plate: 'B 1234 XYZ',
    customer: 'Pak Budi',
    description: 'Vario hitam',
    mechanic: 'Andi',
    serviceNote: 'Ganti oli berikutnya: 21.000 km',
    lines: [
      { type: 'part', name: 'Kampas Rem Depan Vario', brand: 'Federal', qty: 1, price: 45000, amount: 45000, discount: 0 },
      { type: 'part', name: 'Oli MPX 1L', brand: 'AHM', qty: 1, price: 52000, amount: 52000, discount: 2000 },
      { type: 'jasa', name: 'Servis rem', brand: null, qty: 1, price: 35000, amount: 35000, discount: 0 },
    ],
    subtotal: 130000,
    saleDiscount: 5000,
    total: 125000,
    method: 'tunai',
    cash: 150000,
    change: 25000,
    isCopy: false,
    void: false,
  }
}
