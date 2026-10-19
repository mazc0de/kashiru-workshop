import { formatDateTime, formatNumber } from '@/lib/format'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/pos/calculate'
import { center, leftRight, type ReceiptWidth } from '@/pos/receipt'

// Ringkasan harian untuk printer struk (PRD 4.11, R32): jumlah nota, omzet part dan jasa, total per
// metode bayar, dan nota void bertanggal hari itu. Tanpa hitungan kas.

export type DailySummary = {
  /** Tanggal nota "YYYY-MM-DD". */
  date: string
  sales: number
  partRevenue: number
  serviceRevenue: number
  total: number
  voidSales: number
  voidTotal: number
  byMethod: Partial<Record<PaymentMethod, number>>
}

const METHODS: PaymentMethod[] = ['tunai', 'qris', 'transfer', 'edc']
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export function buildDailySummary(s: DailySummary, width: ReceiptWidth, workshop: string, printedAt: Date): string[] {
  const row = (label: string, value: number) => leftRight(label, formatNumber(value), width)
  return [
    ...center(workshop, width),
    ...center(`RINGKASAN HARIAN ${dmy(s.date)}`, width),
    '-'.repeat(width),
    ...leftRight('Nota', String(s.sales), width),
    ...row('Omzet part', s.partRevenue),
    ...row('Omzet jasa', s.serviceRevenue),
    ...row('Total', s.total),
    '-'.repeat(width),
    ...METHODS.flatMap((m) => row(PAYMENT_METHOD_LABELS[m], s.byMethod[m] ?? 0)),
    '-'.repeat(width),
    ...row(`Void: ${s.voidSales} nota`, s.voidTotal),
    '',
    ...center(`Dicetak ${formatDateTime(printedAt)}`, width),
  ]
}
