import { describe, expect, test } from 'vitest'

import { addDays, periodLabel, periodParams, presetRange, readPeriod } from '@/reports/period'

describe('presetRange', () => {
  test('pilihan cepat menurut tanggal hari ini (WIB)', () => {
    expect(presetRange('today', '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-19' })
    expect(presetRange('yesterday', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(presetRange('last7', '2026-10-19')).toEqual({ from: '2026-10-13', to: '2026-10-19' })
    expect(presetRange('thisMonth', '2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-19' })
    expect(presetRange('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('readPeriod', () => {
  test('default Bulan ini; pilihan tidak dikenal juga jatuh ke Bulan ini', () => {
    expect(readPeriod(new URLSearchParams(), '2026-10-19')).toEqual({ preset: 'thisMonth', from: '2026-10-01', to: '2026-10-19' })
    expect(readPeriod(new URLSearchParams('period=minggu'), '2026-10-19').preset).toBe('thisMonth')
  })

  test('Pilih tanggal: rentang terbalik ditukar, tanggal tidak valid jatuh ke Bulan ini', () => {
    expect(readPeriod(new URLSearchParams('period=custom&from=2026-10-10&to=2026-10-02'), '2026-10-19')).toEqual({
      preset: 'custom',
      from: '2026-10-02',
      to: '2026-10-10',
    })
    expect(readPeriod(new URLSearchParams('period=custom&from=kemarin&to=2026-10-02'), '2026-10-19').preset).toBe('thisMonth')
  })

  test('bolak-balik lewat alamat halaman', () => {
    const p = { preset: 'custom' as const, from: '2026-09-01', to: '2026-09-30' }
    expect(readPeriod(new URLSearchParams(periodParams(p)), '2026-10-19')).toEqual(p)
    expect(periodParams({ preset: 'last7', from: '2026-10-13', to: '2026-10-19' })).toEqual({ period: 'last7' })
  })
})

test('label periode dan aritmetika tanggal', () => {
  expect(periodLabel({ from: '2026-10-01', to: '2026-10-19' })).toBe('01/10/2026 – 19/10/2026')
  expect(periodLabel({ from: '2026-10-19', to: '2026-10-19' })).toBe('19/10/2026')
  expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
})
