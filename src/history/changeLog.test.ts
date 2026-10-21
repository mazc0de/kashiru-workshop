import { expect, test } from 'vitest'

import { ACTION_GROUPS, ACTION_LABELS, actionLabel, describeChanges } from '@/history/changeLog'

const categories = new Map([
  ['k-oli', 'Oli'],
  ['k-busi', 'Busi'],
])

test('ubah produk: setiap kolom dengan label Indonesia, nilai lama → baru', () => {
  expect(
    describeChanges(
      {
        action: 'ubah_harga_jual',
        before: { harga_jual: 50000, category_id: 'k-oli', bisa_pecahan: false, stok_min: 2 },
        after: { harga_jual: 52000, category_id: 'k-busi', bisa_pecahan: true, stok_min: 5 },
      },
      categories,
    ),
  ).toEqual(['Harga jual: Rp 50.000 → Rp 52.000', 'Kategori: Oli → Busi', 'Bisa pecahan: Tidak → Ya', 'Stok minimum: 2 → 5'])
})

test('ubah kode harga beli tampil apa adanya; kosong menjadi tanda strip (R64)', () => {
  expect(describeChanges({ action: 'ubah_produk', before: { kode_harga_beli: null }, after: { kode_harga_beli: 'ABGSK' } }, categories)).toEqual([
    'Kode harga: – → ABGSK',
  ])
})

test('void nota menampilkan alasan dan total; nomor dan status sudah tersirat', () => {
  expect(
    describeChanges({ action: 'void_nota', before: { nomor: 'KSR-20261019-0001', status: 'lunas', total: 52000 }, after: { status: 'void', alasan: 'Salah input' } }),
  ).toEqual(['Total: Rp 52.000', 'Alasan: Salah input'])
})

test('penyesuaian stok, barcode baru, dan nonaktifkan akun', () => {
  expect(
    describeChanges({ action: 'penyesuaian_stok', before: { stok: 5 }, after: { stok: 3, qty: -2, alasan: 'rusak', keterangan: null } }),
  ).toEqual(['Stok: 5 → 3', 'Qty: -2', 'Alasan: Rusak', 'Keterangan: –'])
  expect(describeChanges({ action: 'tambah_barcode', before: null, after: { id: 'x', product_id: 'p', barcode: '899000001', jenis: 'pabrik' } })).toEqual([
    'Barcode: 899000001',
    'Jenis: Pabrik',
  ])
  expect(describeChanges({ action: 'nonaktifkan_akun', before: { email: 'rina@gmail.com', aktif: true }, after: { aktif: false } })).toEqual([
    'Email: rina@gmail.com',
  ])
})

test('pengaturan: satuan dan nilai boolean', () => {
  expect(
    describeChanges({ action: 'ubah_pengaturan', before: { ukuran_kertas: 80, blind_count: true, auto_logout_jam: 12 }, after: { ukuran_kertas: 58, blind_count: false, auto_logout_jam: 8 } }),
  ).toEqual(['Ukuran kertas: 80 mm → 58 mm', 'Blind count: Ya → Tidak', 'Keluar otomatis: 12 jam → 8 jam'])
})

test('setiap aksi punya label dan masuk tepat satu kelompok filter', () => {
  const grouped = ACTION_GROUPS.flatMap((g) => g.actions)
  expect(new Set(grouped).size).toBe(grouped.length)
  expect([...grouped].sort()).toEqual(Object.keys(ACTION_LABELS).sort())
  expect(actionLabel('aksi_baru_lain')).toBe('aksi baru lain')
})
