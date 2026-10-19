// Backup lalu pulihkan dengan skema asli (PGlite): data hasil pemulihan harus sama persis dengan aslinya,
// dan aplikasi tetap bisa menulis data baru sesudahnya (R45).
import { afterAll, beforeAll, expect, test } from 'vitest'

// @ts-expect-error modul JS uji database tanpa deklarasi tipe
import { ACCOUNTS, asTableOwner, asUser, createSnapshot, freshDb, migratedDb, rpc } from '../../supabase/tests/harness.mjs'
// @ts-expect-error modul JS skrip pemulihan tanpa deklarasi tipe
import { readHeader, statementsOf } from '../../scripts/backup-file.mjs'
import { BACKUP_TABLES, buildBackupSql, findInconsistency, type Row, type TableDump } from '@/settings/backup'

type Db = Awaited<ReturnType<typeof freshDb>>
let source: Db
let target: Db

const { owner, cashier } = ACCOUNTS
const DEVICE = '44444444-4444-4444-4444-444444444444'

/** Isi tabel seperti yang dikembalikan Data API: JSON per baris, urut kunci utama. */
async function read(db: Db): Promise<TableDump[]> {
  const result: TableDump[] = []
  for (const t of BACKUP_TABLES) {
    const r = await db.query(`select coalesce(json_agg(t order by ${t.key.join(', ')}), '[]'::json) as rows from public.${t.name} t`)
    result.push({ table: t, rows: (r.rows[0] as { rows: Row[] }).rows })
  }
  return result
}

beforeAll(async () => {
  await createSnapshot()
  source = await freshDb()
  const id = async (sql: string) => ((await asUser(source, owner, sql)).rows[0] as { id: string }).id
  const cat = await id(`insert into categories (nama) values ('Oli') returning id`)
  const supplier = await id(`insert into suppliers (nama, telepon) values ('PT Sinar', '0812') returning id`)
  const mechanic = await id(`insert into mechanics (nama) values ('Andi') returning id`)
  const oil = await rpc(source, owner, 'create_product', {
    p_tipe: 'part', p_nama: "Oli 'MPX'", p_merek: 'AHM', p_category_id: cat, p_harga_jual: 52000, p_stok_awal: 10, p_harga_beli: 40000,
    p_barcodes: ['899000001'], p_kode_part: JSON.stringify([{ kode_part: '08232-P99', jenis: 'oem' }]),
  })
  await rpc(source, owner, 'create_internal_barcode', { p_product_id: oil })
  const service = await rpc(source, owner, 'create_product', { p_tipe: 'jasa', p_nama: 'Servis', p_category_id: cat, p_harga_jual: 35000 })
  await asUser(source, owner, `update products set harga_jual = 53000 where id = $1`, [oil])
  // Catatan bawah struk boleh berisi baris baru dan tanda kutip.
  await asUser(source, owner, `update store_settings set nama_bengkel = 'Maju Jaya', ukuran_kertas = 58, footer_struk = $1`, ["Terima kasih\nGaransi 1 minggu, \\ 'oli'"])
  await rpc(source, owner, 'register_cashier_device', { p_device_id: DEVICE, p_nama: 'Laptop' })
  const sell = (urut: number) =>
    rpc(source, cashier, 'checkout_sale', {
      p_client_id: crypto.randomUUID(), p_device_id: DEVICE, p_user_id: cashier, p_awalan: 'KSR', p_urut: urut, p_dibuat_pada: new Date(),
      p_items: [{ product_id: oil, qty: 2, harga: 53000 }, { product_id: service, qty: 1, harga: 35000 }], p_metode_bayar: 'tunai',
      p_total: 141000, p_uang_diterima: 150000, p_nopol: 'b1234xyz', p_nama_pelanggan: 'Pak Budi\nRT 3', p_mechanic_id: mechanic,
    })
  await sell(1)
  const second = (await sell(2)) as { id: string }
  await rpc(source, owner, 'void_sale', { p_sale_id: second.id, p_alasan: 'Salah input' })
  await rpc(source, owner, 'create_receipt', { p_items: [{ product_id: oil, qty: 6, harga_beli: 41000 }], p_supplier_id: supplier })
  await rpc(source, owner, 'adjust_stock', { p_product_id: oil, p_qty: -1, p_alasan: 'rusak', p_keterangan: 'Bocor' })
  const o = (await rpc(source, owner, 'open_opname', { p_jenis: 'penuh' })) as { id: string }
  await rpc(source, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: oil, p_qty: 12 })
  await rpc(source, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [oil], p_alasan: 'ketemu' })
  await rpc(source, owner, 'confirm_opname', { p_opname_id: o.id })
  await rpc(source, cashier, 'record_backup')

  // Pemulihan seperti `npm run restore`: project baru dengan migrasi, akun dibuat ulang, lalu isi file.
  const sql = buildBackupSql(await read(source), { workshop: 'Maju Jaya', createdAt: new Date(), account: 'Rina' })
  target = await migratedDb()
  for (const a of readHeader(sql).accounts as { id: string; email: string }[]) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [a.id, a.email])
  }
  // Dijalankan dengan hak seperti di Supabase: pemilik tabel, bukan superuser.
  await asTableOwner(target, () =>
    target.transaction(async (tx: Db) => {
      for (const statement of statementsOf(sql)) await tx.query(statement)
    }),
  )
}, 120_000)

afterAll(async () => {
  await source?.close()
  await target?.close()
})

test('daftar tabel backup mencakup semua tabel, kolom terhitung, dan identity di skema', async () => {
  const tables = await source.query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)
  expect((tables.rows as { table_name: string }[]).map((r) => r.table_name).sort()).toEqual(BACKUP_TABLES.map((t) => t.name).sort())
  const columns = await source.query(
    `select table_name, column_name, is_generated, is_identity from information_schema.columns
     where table_schema = 'public' and (is_generated = 'ALWAYS' or is_identity = 'YES') order by 1, 2`,
  )
  const rows = columns.rows as { table_name: string; column_name: string; is_generated: string; is_identity: string }[]
  expect(rows.filter((r) => r.is_generated === 'ALWAYS').map((r) => `${r.table_name}.${r.column_name}`)).toEqual(
    BACKUP_TABLES.flatMap((t) => (t.generated ?? []).map((c) => `${t.name}.${c}`)).sort(),
  )
  expect(rows.filter((r) => r.is_identity === 'YES').map((r) => `${r.table_name}.${r.column_name}`)).toEqual(
    BACKUP_TABLES.filter((t) => t.identity).map((t) => `${t.name}.${t.identity}`).sort(),
  )
})

test('data asli utuh dan setiap tabel berisi', async () => {
  const data = await read(source)
  expect(findInconsistency(data)).toBeNull()
  const empty = data.filter((d) => d.rows.length === 0).map((d) => d.table.name)
  expect(empty).toEqual([])
})

test('hasil pemulihan sama persis dengan data asli, termasuk kolom terhitung', async () => {
  expect(await read(target)).toEqual(await read(source))
  const sale = await target.query(`select nopol_kunci from sales limit 1`)
  expect((sale.rows[0] as { nopol_kunci: string }).nopol_kunci).toBe('B1234XYZ')
})

test('setelah pemulihan trigger aktif lagi dan data baru tidak bentrok dengan nomor lama', async () => {
  const cat = ((await target.query(`select id from categories limit 1`)).rows[0] as { id: string }).id
  const before = (await target.query(`select max(id)::int as m from stock_movements`)).rows[0] as { m: number }
  const p = await rpc(target, owner, 'create_product', { p_tipe: 'part', p_nama: 'Busi', p_category_id: cat, p_harga_jual: 15000, p_stok_awal: 3, p_harga_beli: 9000 })
  const movement = (await target.query(`select id::int, qty::int from stock_movements where product_id = $1`, [p])).rows[0] as { id: number; qty: number }
  expect(movement.id).toBe(before.m + 1)
  const level = (await target.query(`select qty_on_hand::int as q from stock_levels where product_id = $1`, [p])).rows[0] as { q: number }
  expect(level.q).toBe(3)
  await asUser(target, owner, `update products set harga_jual = 16000 where id = $1`, [p])
  const log = await target.query(`select count(*)::int as n from change_logs where entitas_id = $1`, [p])
  expect((log.rows[0] as { n: number }).n).toBe(1)
  await rpc(target, cashier, 'record_backup')
})
