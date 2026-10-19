import { expect, test } from 'vitest'

import { dayLabel, niceScale, shortRupiah } from '@/dashboard/chart'

test('sumbu omzet berhenti di angka bulat di atas nilai tertinggi', () => {
  expect(niceScale(1_890_000)).toEqual({ top: 2_000_000, ticks: [0, 1_000_000, 2_000_000] })
  expect(niceScale(450_000)).toEqual({ top: 600_000, ticks: [0, 200_000, 400_000, 600_000] })
  expect(niceScale(2_000_000)).toEqual({ top: 2_000_000, ticks: [0, 1_000_000, 2_000_000] })
})

test('tanpa penjualan, sumbu hanya garis dasar', () => {
  expect(niceScale(0)).toEqual({ top: 1, ticks: [0] })
})

test('label sumbu rupiah disingkat rb dan jt', () => {
  expect([0, 750, 2_500, 250_000, 1_000_000, 1_500_000, 12_000_000].map(shortRupiah)).toEqual([
    '0',
    '750',
    '2,5 rb',
    '250 rb',
    '1 jt',
    '1,5 jt',
    '12 jt',
  ])
})

test('tanggal di tooltip memakai nama hari', () => {
  expect(dayLabel('2026-10-19')).toBe('Sen, 19/10/2026')
  expect(dayLabel('2026-10-18')).toBe('Min, 18/10/2026')
})
