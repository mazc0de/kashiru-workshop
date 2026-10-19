import { formatNumber, formatQty, formatDateTime } from '@/lib/format'
import type { PaperWidth } from '@/lib/print'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/pos/calculate'

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
  const result: string[] = []
  for (const paragraph of text.split('\n')) {
    let lines = ''
    for (let words of paragraph.split(/\s+/).filter(Boolean)) {
      while (words.length > width) {
        if (lines) {
          result.push(lines)
          lines = ''
        }
        result.push(words.slice(0, width))
        words = words.slice(width)
      }
      if (!lines) lines = words
      else if (lines.length + 1 + words.length <= width) lines += ` ${words}`
      else {
        result.push(lines)
        lines = words
      }
    }
    if (lines) result.push(lines)
  }
  return result
}

export function center(text: string, width: number): string[] {
  return wrap(text, width).map((b) => `${' '.repeat(Math.floor((width - b.length) / 2))}${b}`)
}

/** Teks kiri dan angka rata kanan; kalau tidak muat, angka turun ke baris terakhir atau baris baru. */
export function leftRight(left: string, right: string, width: number): string[] {
  const indent = left.match(/^ */)?.[0] ?? ''
  const lines = wrap(left, width - indent.length).map((b) => indent + b)
  const last = lines.pop() ?? ''
  if (last.length + 1 + right.length <= width) {
    return [...lines, last + ' '.repeat(width - last.length - right.length) + right]
  }
  return [...lines, last, ' '.repeat(width - right.length) + right]
}

/** "Nopol: B 1234 XYZ": label tetap, isi dibungkus dengan indentasi menggantung selebar label. */
export function labelValue(label: string, value: string, width: number): string[] {
  return wrap(value, width - label.length).map((b, i) => (i === 0 ? label : ' '.repeat(label.length)) + b)
}

const rupiah = (n: number) => `Rp ${formatNumber(n)}`

export function buildReceipt(d: ReceiptData, width: ReceiptWidth): string[] {
  const divider = '-'.repeat(width)
  const out: string[] = []

  out.push(...center(d.workshop.name.toUpperCase(), width))
  if (d.workshop.address) out.push(...center(d.workshop.address, width))
  if (d.workshop.phone) out.push(...center(d.workshop.phone, width))
  if (d.void) out.push(...center('*** VOID ***', width))
  if (d.isCopy) out.push(...center('*** SALINAN ***', width))
  out.push(divider)

  const info: [string, string | null][] = [
    ['No   : ', d.number],
    ['Tgl  : ', formatDateTime(d.time)],
    ['Kasir: ', d.cashier],
    ['Nopol: ', d.plate],
    ['Plg  : ', d.customer],
    ['Mek  : ', d.mechanic],
  ]
  for (const [label, value] of info) {
    if (value) out.push(...labelValue(label, value, width))
  }
  out.push(divider)

  const writeLine = (b: ReceiptLine) => {
    const name = b.brand ? `${b.name} · ${b.brand}` : b.name
    if (b.type === 'jasa' && b.qty === 1) {
      out.push(...leftRight(name, formatNumber(b.amount), width))
    } else {
      out.push(...wrap(name, width))
      out.push(...leftRight(`  ${formatQty(b.qty)} x ${formatNumber(b.price)}`, formatNumber(b.amount), width))
    }
    if (b.discount > 0) out.push(...leftRight('  Diskon', `-${formatNumber(b.discount)}`, width))
  }
  const part = d.lines.filter((b) => b.type === 'part')
  const services = d.lines.filter((b) => b.type === 'jasa')
  if (part.length) {
    out.push('PART')
    part.forEach(writeLine)
  }
  if (services.length) {
    out.push('JASA')
    services.forEach(writeLine)
  }
  out.push(divider)

  out.push(...leftRight('Subtotal', formatNumber(d.subtotal), width))
  if (d.saleDiscount > 0) out.push(...leftRight('Diskon nota', `-${formatNumber(d.saleDiscount)}`, width))
  out.push(...leftRight('TOTAL', rupiah(d.total), width))
  out.push(...leftRight(PAYMENT_METHOD_LABELS[d.method], rupiah(d.cash), width))
  if (d.method === 'tunai') out.push(...leftRight('Kembali', rupiah(d.change), width))
  out.push(divider)

  if (d.serviceNote) out.push(...wrap(d.serviceNote, width))
  if (d.workshop.footer) out.push(...center(d.workshop.footer, width))
  out.push(...center('Terima kasih atas kunjungan Anda', width))
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
