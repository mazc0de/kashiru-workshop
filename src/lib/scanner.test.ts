import { describe, expect, test } from 'vitest'

import { ScanDetector, type KeyResult } from '@/lib/scanner'

/** Mengetik `teks` dengan jeda tetap, lalu Enter, dan mengembalikan hasil terakhir. */
function typed(p: ScanDetector, text: string, gapMs: number, startMs = 1000, enterGapMs = gapMs): KeyResult {
  let t = startMs
  for (const c of text) {
    p.press(c, t)
    t += gapMs
  }
  return p.press('Enter', t - gapMs + enterGapMs)
}

describe('PendeteksiScan', () => {
  test('karakter cepat diakhiri Enter adalah scan', () => {
    expect(typed(new ScanDetector(), '8991234500011', 4)).toEqual({ kind: 'scan', code: '8991234500011' })
  })

  test('ketikan manusia (jeda 80 ms) bukan scan', () => {
    expect(typed(new ScanDetector(), '200001', 80)).toEqual({ kind: 'normal' })
  })

  test('jeda 30 ms atau lebih tidak lagi dianggap scan', () => {
    expect(typed(new ScanDetector(), '200001', 29)).toEqual({ kind: 'scan', code: '200001' })
    expect(typed(new ScanDetector(), '200001', 30)).toEqual({ kind: 'normal' })
  })

  test('kurang dari 4 karakter bukan scan', () => {
    expect(typed(new ScanDetector(), '123', 4)).toEqual({ kind: 'normal' })
    expect(typed(new ScanDetector(), '1234', 4)).toEqual({ kind: 'scan', code: '1234' })
  })

  test('Enter yang datang lambat setelah karakter cepat bukan scan', () => {
    expect(typed(new ScanDetector(), '200001', 4, 1000, 500)).toEqual({ kind: 'normal' })
  })

  test('ketikan lambat sebelum scan tidak ikut masuk kode', () => {
    const p = new ScanDetector()
    p.press('a', 0)
    p.press('b', 200)
    expect(typed(p, '200002', 3, 1000)).toEqual({ kind: 'scan', code: '200002' })
  })

  test('Shift untuk huruf besar tidak memutus scan Code128', () => {
    const p = new ScanDetector()
    p.press('Shift', 1000)
    p.press('A', 1002)
    p.press('Shift', 1003)
    p.press('B', 1005)
    p.press('1', 1008)
    p.press('2', 1011)
    expect(p.press('Enter', 1014)).toEqual({ kind: 'scan', code: 'AB12' })
  })

  test('tombol navigasi di tengah memutus urutan', () => {
    const p = new ScanDetector()
    p.press('2', 1000)
    p.press('0', 1003)
    p.press('ArrowLeft', 1005)
    p.press('0', 1007)
    expect(p.press('Enter', 1010)).toEqual({ kind: 'normal' })
  })

  test('karakter pertama ditandai "mulai" supaya isi kolom teks bisa dicuplik', () => {
    const p = new ScanDetector()
    expect(p.press('2', 1000)).toEqual({ kind: 'start' })
    expect(p.press('0', 1004)).toEqual({ kind: 'continue' })
    expect(p.press('0', 1100)).toEqual({ kind: 'start' })
  })
})
