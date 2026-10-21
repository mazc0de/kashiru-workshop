import { describe, expect, test } from 'vitest'

import { wrap, leftRight, labelValue, buildReceipt, type ReceiptData } from '@/pos/receipt'

const spaces = (n: number) => ' '.repeat(n)

// Nota contoh PRD 4.10. 07:32 UTC = 14:32 WIB.
const EXAMPLE: ReceiptData = {
  workshop: { name: 'Bengkel Maju Jaya', address: 'Jl. Raya Bogor No. 12, Depok', phone: '0812-3456-7890', footer: null },
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

describe('buildReceipt', () => {
  test('contoh struk PRD 4.10 di kertas 80 mm (48 karakter)', () => {
    const divider = '-'.repeat(48)
    expect(buildReceipt(EXAMPLE, 48)).toEqual([
      `${spaces(15)}BENGKEL MAJU JAYA`,
      `${spaces(10)}Jl. Raya Bogor No. 12, Depok`,
      `${spaces(17)}0812-3456-7890`,
      divider,
      'No   : KSR-20261018-0007',
      'Tgl  : 18/10/2026 14:32',
      'Kasir: Rina',
      'Nopol: B 1234 XYZ',
      'Plg  : Pak Budi',
      'Ket  : Vario hitam',
      'Mek  : Andi',
      divider,
      'PART',
      'Kampas Rem Depan Vario · Federal',
      `  1 x 45.000${spaces(30)}45.000`,
      'Oli MPX 1L · AHM',
      `  1 x 52.000${spaces(30)}52.000`,
      `  Diskon${spaces(34)}-2.000`,
      'JASA',
      `Servis rem${spaces(32)}35.000`,
      divider,
      `Subtotal${spaces(33)}130.000`,
      `Diskon nota${spaces(31)}-5.000`,
      `TOTAL${spaces(33)}Rp 125.000`,
      `Tunai${spaces(33)}Rp 150.000`,
      `Kembali${spaces(32)}Rp 25.000`,
      divider,
      'Ganti oli berikutnya: 21.000 km',
      `${spaces(8)}Terima kasih atas kunjungan Anda`,
    ])
  })

  test('struk tersimpan sebelum ada keterangan tetap dicetak tanpa baris Ket', () => {
    const { description: _, ...old } = EXAMPLE
    expect(buildReceipt(old, 48).some((b) => b.startsWith('Ket'))).toBe(false)
  })

  test('setiap baris muat di kertas 58 mm (32 karakter)', () => {
    const lines = buildReceipt({ ...EXAMPLE, lines: [...EXAMPLE.lines, { type: 'jasa', name: 'Servis CVT lengkap dan ganti roller', brand: null, qty: 1, price: 150000, amount: 150000, discount: 0 }] }, 32)
    expect(lines.every((b) => b.length <= 32)).toBe(true)
    expect(lines).toContain(`roller${spaces(19)}150.000`)
  })

  test('baris kosong tidak dicetak, metode non-tunai tanpa kembalian', () => {
    const lines = buildReceipt({ ...EXAMPLE, plate: null, customer: null, description: null, mechanic: null, serviceNote: null, saleDiscount: 0, method: 'qris', cash: 125000, change: 0 }, 48)
    expect(lines.some((b) => b.startsWith('Nopol') || b.startsWith('Plg') || b.startsWith('Mek') || b.startsWith('Diskon nota') || b.startsWith('Kembali'))).toBe(false)
    expect(lines).toContain(`QRIS${spaces(34)}Rp 125.000`)
  })

  test('jasa dengan qty lebih dari 1 dicetak dengan rincian (R4)', () => {
    const lines = buildReceipt({ ...EXAMPLE, lines: [{ type: 'jasa', name: 'Tambal ban', brand: null, qty: 2, price: 15000, amount: 30000, discount: 0 }] }, 48)
    expect(lines).toContain('Tambal ban')
    expect(lines).toContain(`  2 x 15.000${spaces(30)}30.000`)
  })

  test('qty pecahan memakai koma', () => {
    const lines = buildReceipt({ ...EXAMPLE, lines: [{ type: 'part', name: 'Oli Curah', brand: null, qty: 1.5, price: 52000, amount: 78000, discount: 0 }] }, 48)
    expect(lines).toContain(`  1,5 x 52.000${spaces(28)}78.000`)
  })

  test('cetak ulang diberi tanda SALINAN, nota void diberi tanda VOID', () => {
    expect(buildReceipt({ ...EXAMPLE, isCopy: true }, 48)).toContain(`${spaces(16)}*** SALINAN ***`)
    expect(buildReceipt({ ...EXAMPLE, isCopy: true, void: true }, 48)).toContain(`${spaces(18)}*** VOID ***`)
  })
})

test('bungkus memecah per kata dan memotong kata yang terlalu panjang', () => {
  expect(wrap('Kampas Rem Depan Vario 125 · Federal', 32)).toEqual(['Kampas Rem Depan Vario 125 ·', 'Federal'])
  expect(wrap('ABCDEFGHIJ', 4)).toEqual(['ABCD', 'EFGH', 'IJ'])
})

test('kiriKanan menurunkan angka ke baris baru kalau tidak muat', () => {
  expect(leftRight('Servis besar mesin', 'Rp 1.250.000', 24)).toEqual(['Servis besar mesin', `${spaces(12)}Rp 1.250.000`])
})

test('labelIsi membungkus isi panjang dengan indentasi selebar label', () => {
  expect(labelValue('Plg  : ', 'Bapak Sutrisno Wijayakusuma', 20)).toEqual(['Plg  : Bapak', '       Sutrisno', '       Wijayakusuma'])
})
