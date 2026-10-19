import { describe, expect, test } from 'vitest'

import { formatSaleNumber, wibDate, nextSequence } from '@/pos/saleNumber'
import { formatPlate, plateKey } from '@/pos/plate'

describe('nomor nota', () => {
  test('format AWALAN-YYYYMMDD-0001', () => {
    expect(formatSaleNumber('KSR', '2026-10-18', 7)).toBe('KSR-20261018-0007')
    expect(formatSaleNumber('KS', '2026-10-18', 12345)).toBe('KS-20261018-12345')
  })

  test('tanggal nota menurut WIB, bukan UTC', () => {
    expect(wibDate(new Date('2026-10-18T16:59:00Z'))).toBe('2026-10-18')
    expect(wibDate(new Date('2026-10-18T17:00:00Z'))).toBe('2026-10-19')
  })

  test('urut mulai dari 1 setiap hari dan tidak mundur dari server', () => {
    expect(nextSequence(null, '2026-10-18', null)).toBe(1)
    expect(nextSequence({ date: '2026-10-18', last: 6 }, '2026-10-18', null)).toBe(7)
    expect(nextSequence({ date: '2026-10-17', last: 40 }, '2026-10-18', null)).toBe(1)
    expect(nextSequence({ date: '2026-10-18', last: 6 }, '2026-10-18', 9)).toBe(10)
    expect(nextSequence({ date: '2026-10-18', last: 12 }, '2026-10-18', 9)).toBe(13)
  })
})

describe('nopol', () => {
  test('format baku dari contoh PRD', () => {
    expect(formatPlate('b1234xyz')).toBe('B 1234 XYZ')
    expect(formatPlate('B 1234 XYZ')).toBe('B 1234 XYZ')
    expect(formatPlate('  ad   5678 bc ')).toBe('AD 5678 BC')
  })

  test('nopol tidak biasa tetap diterima, spasi yang diketik dipertahankan', () => {
    expect(formatPlate('cd 12 34')).toBe('CD 12 34')
    expect(formatPlate('rf1234')).toBe('RF 1234')
    expect(formatPlate('TNI-123')).toBe('TNI-123')
  })

  test('kunci pencarian mengabaikan spasi dan huruf besar-kecil', () => {
    expect(plateKey('b 1234 xyz')).toBe('B1234XYZ')
    expect(plateKey(formatPlate('b1234xyz'))).toBe(plateKey('B1234 XYZ'))
  })
})
