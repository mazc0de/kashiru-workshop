import { describe, expect, test } from 'vitest'
import { DIVIDER, labelValueRows, left, leftRightRows, right, rowToString, wrapText, type Measure } from '@/lib/textLayout'
import { buildReceiptRows, sampleReceipt } from '@/pos/receipt'

/** Huruf proporsional tiruan: huruf kapital 1,5 kolom, huruf lain 0,5 kolom. */
const proportional: Measure = (t) => Array.from(t).reduce((s, ch) => s + (/[A-Z]/.test(ch) ? 1.5 : 0.5), 0)

describe('rowToString', () => {
  test('kiri di kolomnya, kanan sampai tepi, tengah, dan garis sepanjang baris', () => {
    expect(rowToString([left('Kasir'), left(':', 5), left('Rina', 7)], 20)).toBe('Kasir: Rina')
    expect(rowToString([left('TOTAL'), right('Rp 5.000')], 20)).toBe('TOTAL       Rp 5.000')
    expect(rowToString([{ align: 'center', text: 'ABC' }], 10)).toBe('   ABC')
    expect(rowToString(DIVIDER, 6)).toBe('------')
  })
})

describe('huruf proporsional', () => {
  test('nama barang huruf kapital dibungkus menurut lebar hurufnya, bukan jumlah karakternya', () => {
    expect(wrapText('BAUT DAS KARBU', 10)).toEqual(['BAUT DAS', 'KARBU'])
    expect(wrapText('BAUT DAS KARBU', 10, proportional)).toEqual(['BAUT', 'DAS', 'KARBU'])
  })

  test('kata yang lebih lebar dari kertas dipotong menurut lebar hurufnya', () => {
    expect(wrapText('ABCDEFGH', 6, proportional)).toEqual(['ABCD', 'EFGH'])
  })

  test('angka turun ke baris baru kalau teks kiri yang diukur tidak menyisakan tempat', () => {
    expect(leftRightRows('TOTAL BAYAR', '1.000', 17)).toEqual([[left('TOTAL BAYAR'), right('1.000')]])
    expect(leftRightRows('TOTAL BAYAR', '1.000', 17, proportional)).toEqual([[left('TOTAL BAYAR')], [right('1.000')]])
  })

  test('label: nama, titik dua, dan isi di kolomnya masing-masing; baris lanjutan menggantung', () => {
    expect(labelValueRows('No   : ', 'abc def', 10, proportional)).toEqual([[left('No'), left(':', 5), left('abc', 7)], [left('def', 7)]])
  })

  test('setiap baris struk contoh muat di kertas 80 mm', () => {
    const rows = buildReceiptRows(sampleReceipt({ name: 'Setya Motor', address: 'Ds. Sidokare', phone: null, footer: null }), 48, proportional)
    for (const row of rows) {
      const lefts = row.filter((c) => c.align === 'left')
      const end = Math.max(0, ...lefts.map((c) => c.at + proportional(c.text)))
      const rightCell = row.find((c) => c.align === 'right')
      expect(end + (rightCell ? proportional(` ${rightCell.text}`) : 0)).toBeLessThanOrEqual(48)
    }
  })
})
