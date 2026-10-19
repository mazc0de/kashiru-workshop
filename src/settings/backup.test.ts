import { expect, test } from 'vitest'

import {
  BACKUP_TABLES,
  backupFileName,
  backupOverdue,
  buildBackupSql,
  daysSinceBackup,
  findInconsistency,
  insertStatements,
  sqlValue,
  type Row,
  type TableDump,
} from '@/settings/backup'

const table = (name: string) => BACKUP_TABLES.find((t) => t.name === name)!

test('nilai teks lolos tanda kutip, garis miring, dan baris baru tanpa memecah baris', () => {
  expect(sqlValue("Jl. Raya No. 5\nDepan pasar 'Baru' C:\\data\t1")).toBe("E'Jl. Raya No. 5\\nDepan pasar \\'Baru\\' C:\\\\data\\t1'")
  expect([null, true, false, 52000, 1.5].map(sqlValue)).toEqual(['null', 'true', 'false', '52000', '1.5'])
  expect(sqlValue({ harga_jual: 50000, alasan: "it's" })).toBe(`E'{"harga_jual":50000,"alasan":"it\\'s"}'`)
})

test('kolom yang dihitung database tidak ditulis, kolom identity memakai overriding system value', () => {
  const [sale] = insertStatements({ table: table('sales'), rows: [{ id: 's1', nopol: 'B 1 X', nopol_kunci: 'B1X' }] })
  expect(sale).toBe(`insert into public.sales ("id", "nopol") values (E's1', E'B 1 X');`)
  const [log] = insertStatements({ table: table('change_logs'), rows: [{ id: 7, aksi: 'void_nota' }] })
  expect(log).toBe(`insert into public.change_logs ("id", "aksi") overriding system value values (7, E'void_nota');`)
})

test('pengaturan yang sudah diisi migrasi ditimpa, bukan ditambah', () => {
  const [settings] = insertStatements({ table: table('store_settings'), rows: [{ id: 1, nama_bengkel: 'Maju Jaya', ukuran_kertas: 58 }] })
  expect(settings).toBe(
    `insert into public.store_settings ("id", "nama_bengkel", "ukuran_kertas") values (1, E'Maju Jaya', 58) on conflict ("id") do update set "nama_bengkel" = excluded."nama_bengkel", "ukuran_kertas" = excluded."ukuran_kertas";`,
  )
})

test('baris dikirim per 200, setiap pernyataan satu baris', () => {
  const rows = Array.from({ length: 450 }, (_, i) => ({ id: `k${i}`, nama: `Kategori\n${i}` }))
  const statements = insertStatements({ table: table('categories'), rows })
  expect(statements).toHaveLength(3)
  expect(statements.every((s) => !s.includes('\n'))).toBe(true)
  expect(insertStatements({ table: table('categories'), rows: [] })).toEqual([])
})

test('kepala file berisi daftar akun untuk dibuat ulang, trigger dimatikan per tabel selama pemulihan', () => {
  const sql = buildBackupSql(
    [
      { table: table('profiles'), rows: [{ id: 'u1', email: 'rina@gmail.com', nama: 'Rina', aktif: true }] },
      { table: table('change_logs'), rows: [] },
    ],
    { workshop: 'Bengkel\nMaju', createdAt: new Date('2026-10-19T16:20:00Z'), account: 'Rina' },
  )
  const lines = sql.trimEnd().split('\n')
  expect(lines.slice(0, 2)).toEqual(['-- Kashiru backup', '-- Bengkel: Bengkel Maju'])
  expect(lines).toContain('-- kashiru-accounts: [{"id":"u1","email":"rina@gmail.com"}]')
  expect(lines).toContain('-- kashiru-backup-format: 2')
  expect(lines).toContain('alter table public.profiles disable trigger user;')
  expect(lines.some((l) => l.includes('session_replication_role'))).toBe(false)
  expect(lines).toContain(
    `select setval(pg_get_serial_sequence('public.change_logs', 'id'), coalesce((select max("id") from public.change_logs), 0) + 1, false);`,
  )
  expect(lines.slice(-2)).toEqual(['alter table public.profiles enable trigger user;', 'alter table public.change_logs enable trigger user;'])
})

function dump(data: Record<string, Row[]>): TableDump[] {
  return BACKUP_TABLES.map((t) => ({ table: t, rows: data[t.name] ?? [] }))
}

const CONSISTENT = {
  products: [{ id: 'p1' }],
  sales: [{ id: 's1' }],
  sale_items: [{ id: 'i1', sale_id: 's1', product_id: 'p1' }],
  stock_movements: [
    { id: 1, product_id: 'p1', qty: 5, ref_type: null, ref_id: null },
    { id: 2, product_id: 'p1', qty: -1.5, ref_type: 'sale', ref_id: 's1' },
  ],
  stock_levels: [{ product_id: 'p1', qty_on_hand: 3.5 }],
}

test('data yang dibaca utuh lolos pemeriksaan', () => {
  expect(findInconsistency(dump(CONSISTENT))).toBeNull()
})

test('transaksi yang tersimpan di tengah pembacaan terdeteksi', () => {
  expect(findInconsistency(dump({ ...CONSISTENT, sales: [] }))).toBe('sale_items tanpa sales')
  expect(findInconsistency(dump({ ...CONSISTENT, sale_items: [] }))).toBe('sales tanpa sale_items')
  expect(findInconsistency(dump({ ...CONSISTENT, stock_levels: [{ product_id: 'p1', qty_on_hand: 5 }] }))).toBe('stok berbeda dengan kartu stok')
  expect(
    findInconsistency(dump({ ...CONSISTENT, stock_movements: [...CONSISTENT.stock_movements, { id: 3, product_id: 'p1', qty: -1, ref_type: 'sale', ref_id: 's9' }] })),
  ).toBe('kartu stok tanpa dokumennya')
})

test('nama file memuat nama bengkel dan waktu WIB', () => {
  expect(backupFileName('Bengkel Maju Jaya & Sons', new Date('2026-10-19T16:20:00Z'))).toBe('kashiru-backup-bengkel-maju-jaya-sons-20261019-2320.sql')
  expect(backupFileName('  ', new Date('2026-10-19T16:20:00Z'))).toBe('kashiru-backup-bengkel-20261019-2320.sql')
})

test('pengingat backup: lebih dari 7 hari menurut tanggal WIB, atau belum pernah (R47)', () => {
  const now = new Date('2026-10-19T16:20:00Z') // 19/10 23.20 WIB
  expect(daysSinceBackup(null, now)).toBeNull()
  // 12/10 23.00 WIB = 7 hari lalu, belum perlu diingatkan; 11/10 = 8 hari.
  expect(daysSinceBackup('2026-10-12T16:00:00Z', now)).toBe(7)
  expect(daysSinceBackup('2026-10-11T18:00:00Z', now)).toBe(7)
  expect(daysSinceBackup('2026-10-11T16:00:00Z', now)).toBe(8)
  expect([null, 0, 7, 8].map(backupOverdue)).toEqual([true, false, false, true])
})
