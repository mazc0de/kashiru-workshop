import { expect, test } from 'vitest'

import { createExcel, createExcelReport, createPdf, createPdfReport, sheetNames, toTable, type ExportData } from '@/lib/export'

type Row = { name: string; qty: number; value: number }
const DATA: ExportData<Row> = {
  fileName: 'uji',
  title: 'Hasil opname OPN-20261018-01',
  note: ['Bengkel Maju Jaya', 'Dikonfirmasi 18/10/2026 16:00'],
  columns: [
    { title: 'Part', value: (b) => b.name, width: 30 },
    { title: 'Selisih', value: (b) => b.qty, kind: 'qty' },
    { title: 'Selisih (Rp)', value: (b) => b.value, kind: 'rupiah' },
  ],
  rows: [
    { name: 'Busi C7HSA · NGK', qty: -2, value: -36000 },
    { name: 'Oli Curah', qty: 0.5, value: 20000 },
  ],
  total: ['Total', null, -16000],
}

test('PDF dibuat dengan satu halaman A4', async () => {
  const doc = await createPdf(DATA)
  expect(doc.getNumberOfPages()).toBe(1)
  expect(doc.output().startsWith('%PDF-')).toBe(true)
})

test('Excel berupa arsip xlsx (zip) yang tidak kosong', async () => {
  const blob = await createExcel(DATA)
  const header = new Uint8Array(await blob.arrayBuffer()).slice(0, 2)
  expect(String.fromCharCode(...header)).toBe('PK')
  expect(blob.size).toBeGreaterThan(1000)
})

test('nama sheet Excel maksimal 31 karakter, tanpa karakter terlarang, dan unik', () => {
  expect(sheetNames(['Penjualan per hari', 'Per kategori: oli/ban [semua]', 'Penjualan per hari', 'x'.repeat(40)])).toEqual([
    'Penjualan per hari',
    'Per kategori oli ban semua',
    'Penjualan per hari 2',
    'x'.repeat(31),
  ])
})

test('laporan dengan beberapa tabel: satu sheet per tabel, PDF berisi semua bagian', async () => {
  const report = {
    fileName: 'laporan-penjualan',
    title: 'Laporan penjualan',
    note: ['01/10/2026 – 19/10/2026'],
    tables: [
      toTable('Per hari', [{ title: 'Tanggal', value: (r: { d: string; t: number }) => r.d }, { title: 'Total', value: (r) => r.t, kind: 'rupiah' }], [{ d: '19/10/2026', t: 180500 }]),
      toTable('Per metode', [{ title: 'Metode', value: (r: { m: string }) => r.m }], [{ m: 'QRIS' }]),
    ],
  }
  const zip = new TextDecoder('latin1').decode(await (await createExcelReport(report)).arrayBuffer())
  expect(zip).toContain('xl/worksheets/sheet1.xml')
  expect(zip).toContain('xl/worksheets/sheet2.xml')
  const doc = await createPdfReport(report)
  expect(doc.output()).toContain('Per metode')
})
