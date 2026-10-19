import { expect, test } from 'vitest'

import { buildDailySummary, type DailySummary } from '@/pos/dailySummary'

const SUMMARY: DailySummary = {
  date: '2026-10-19',
  sales: 23,
  partRevenue: 1250000,
  serviceRevenue: 640000,
  total: 1890000,
  voidSales: 1,
  voidTotal: 52000,
  byMethod: { tunai: 1100000, qris: 540000, transfer: 250000 },
}

test('ringkasan harian 80 mm sesuai contoh R32, metode tanpa transaksi tetap tampil 0', () => {
  const lines = buildDailySummary(SUMMARY, 48, 'Bengkel Maju Jaya', new Date('2026-10-19T10:00:00Z'))
  expect(lines.every((l) => l.length <= 48)).toBe(true)
  expect(lines).toContain(`RINGKASAN HARIAN 19/10/2026`.padStart(Math.floor((48 - 27) / 2) + 27))
  expect(lines).toContain(`Nota${' '.repeat(42)}23`)
  expect(lines).toContain(`Omzet part${' '.repeat(29)}1.250.000`)
  expect(lines).toContain(`Total${' '.repeat(34)}1.890.000`)
  expect(lines).toContain(`EDC${' '.repeat(44)}0`)
  expect(lines).toContain(`Void: 1 nota${' '.repeat(30)}52.000`)
  expect(lines.at(-1)).toContain('Dicetak 19/10/2026 17:00')
})

test('ringkasan harian muat di kertas 58 mm', () => {
  const lines = buildDailySummary({ ...SUMMARY, total: 123456789, partRevenue: 123456789 }, 32, 'Bengkel Maju Jaya Sentosa Abadi Motor', new Date())
  expect(lines.every((l) => l.length <= 32)).toBe(true)
})
