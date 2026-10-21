// Skenario uji database Kashiru. Angka harapan dihitung tangan dari PRD dan keputusan R2-R11.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSnapshot, freshDb, asUser, asTableOwner, rpc, ACCOUNTS } from './harness.mjs'

const { owner, cashier, former, noProfile } = ACCOUNTS
const DEVICE = '11111111-1111-1111-1111-111111111111'
const DEVICE_B = '22222222-2222-2222-2222-222222222222'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()).replaceAll('-', '')

const scenarios = []
const scenario = (name, fn) => scenarios.push({ name, fn })

async function expectFailure(promise, pattern) {
  try {
    await promise
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`Pesan error tidak sesuai: "${e.message}"`)
    return e
  }
  throw new Error(`Seharusnya gagal (${pattern})`)
}

let categoryCounter = 0
async function createCategory(db, name) {
  const r = await asUser(db, owner, 'insert into categories (nama) values ($1) returning id', [name ?? `Kategori ${++categoryCounter}`])
  return r.rows[0].id
}

async function createPart(db, o = {}) {
  return rpc(db, owner, 'create_product', {
    p_tipe: 'part',
    p_nama: o.name ?? `Part ${Math.random().toString(36).slice(2, 8)}`,
    p_merek: o.brand ?? null,
    p_category_id: o.category ?? (await createCategory(db)),
    p_harga_jual: o.price ?? 45000,
    p_bisa_pecahan: o.fractional ?? false,
    p_barcodes: o.barcodes ?? null,
    p_stok_awal: o.stock ?? null,
    p_harga_beli: o.cost ?? null,
  })
}

async function createService(db, name, price, cat) {
  return rpc(db, owner, 'create_product', {
    p_tipe: 'jasa', p_nama: name, p_category_id: cat ?? (await createCategory(db)), p_harga_jual: price,
  })
}

const num = (v) => (v === null || v === undefined ? v : Number(v))
async function stockOf(db, id) {
  return num((await db.query('select qty_on_hand from stock_levels where product_id = $1', [id])).rows[0].qty_on_hand)
}
async function avgCost(db, id) {
  return num((await db.query('select harga_beli_avg from products where id = $1', [id])).rows[0].harga_beli_avg)
}
async function registerDevice(db, device = DEVICE) {
  return rpc(db, owner, 'register_cashier_device', { p_device_id: device, p_nama: 'Laptop kasir' })
}

let sequence = 0
async function checkout(db, lines, o = {}) {
  return rpc(db, o.caller ?? cashier, 'checkout_sale', {
    p_client_id: o.clientId ?? crypto.randomUUID(),
    p_device_id: o.device ?? DEVICE,
    p_user_id: o.creator ?? cashier,
    p_awalan: 'KSR',
    p_urut: o.sequence ?? ++sequence,
    p_dibuat_pada: o.createdAt ?? new Date(),
    p_items: lines,
    p_metode_bayar: o.method ?? 'qris',
    p_total: o.total,
    p_uang_diterima: o.cash ?? null,
    p_diskon_nota_jenis: o.discountKind ?? null,
    p_diskon_nota_input: o.discountInput ?? null,
    p_nopol: o.plate ?? null,
    p_nama_pelanggan: o.customer ?? null,
    p_mechanic_id: o.mechanicId ?? null,
  })
}
const sell = (db, id, qty, price, o = {}) => checkout(db, [{ product_id: id, qty, harga: price }], { total: Math.round(qty * price), ...o })

async function receive(db, lines, o = {}) {
  return rpc(db, owner, 'create_receipt', { p_items: lines, p_tanggal_faktur: o.date ?? null })
}

// Akses --------------------------------------------------------------------

scenario('anon tidak bisa membaca data apa pun', async (db) => {
  await expectFailure(asUser(db, null, 'select * from products'), /permission denied/)
  await expectFailure(asUser(db, null, 'select * from store_settings'), /permission denied/)
})

scenario('anon tidak bisa memanggil RPC', async (db) => {
  await expectFailure(rpc(db, null, 'touch_last_login'), /permission denied/)
})

scenario('user login tanpa profil tidak melihat data dan ditolak RPC', async (db) => {
  await createPart(db)
  const r = await asUser(db, noProfile, 'select * from products')
  assert.equal(r.rows.length, 0)
  await expectFailure(rpc(db, noProfile, 'touch_last_login'), /Akun belum login atau sudah nonaktif/)
})

scenario('akun nonaktif hanya bisa membaca profilnya sendiri', async (db) => {
  await createPart(db)
  assert.equal((await asUser(db, former, 'select * from products')).rows.length, 0)
  const profiles = await asUser(db, former, 'select id from profiles')
  assert.deepEqual(profiles.rows.map((x) => x.id), [former])
  await expectFailure(rpc(db, former, 'touch_last_login'), /nonaktif/)
})

scenario('akun aktif melihat semua profil dan bisa mencatat login', async (db) => {
  assert.equal((await asUser(db, cashier, 'select * from profiles')).rows.length, 3)
  await rpc(db, cashier, 'touch_last_login')
  const r = await db.query('select terakhir_login from profiles where id = $1', [cashier])
  assert.ok(r.rows[0].terakhir_login)
})

scenario('dokumen dan stok tidak bisa ditulis langsung tanpa RPC', async (db) => {
  const id = await createPart(db, { stock: 1, cost: 1000 })
  await expectFailure(asUser(db, cashier, `insert into stock_movements (product_id, jenis, qty, hpp_satuan, user_id) values ($1, 'beli', 5, 1, $2)`, [id, cashier]), /permission denied/)
  await expectFailure(asUser(db, cashier, `update stock_levels set qty_on_hand = 100`), /permission denied/)
  await expectFailure(asUser(db, cashier, `update products set harga_beli_avg = 1`), /permission denied/)
  await expectFailure(asUser(db, cashier, `update products set tipe = 'jasa'`), /permission denied/)
  await expectFailure(asUser(db, cashier, `insert into products (tipe, nama, category_id, satuan, harga_jual) values ('part', 'x', (select id from categories limit 1), 'pcs', 1)`), /permission denied/)
  await expectFailure(asUser(db, cashier, `delete from sales`), /permission denied/)
  await expectFailure(asUser(db, cashier, `insert into product_barcodes (product_id, barcode, jenis) values ($1, '200999', 'internal')`, [id]), /row-level security/)
})

scenario('service_role (Edge Function manage-accounts) bisa membuat profil dan mencatat riwayat', async (db) => {
  const newId = '00000000-0000-0000-0000-000000000009'
  await db.query(`insert into auth.users (id, email) values ($1, 'andi@gmail.com')`, [newId])
  await asUser(db, 'service_role', `insert into profiles (id, email, nama) values ($1, 'andi@gmail.com', 'Andi')`, [newId])
  await asUser(db, 'service_role', `update profiles set aktif = false where id = $1`, [newId])
  await asUser(db, 'service_role', `insert into change_logs (user_id, aksi, entitas, entitas_id, data_baru) values ($1, 'buat_akun', 'profiles', $2, '{}')`, [owner, newId])
  const r = await asUser(db, 'service_role', 'select nama, aktif from profiles where id = $1', [newId])
  assert.deepEqual(r.rows, [{ nama: 'Andi', aktif: false }])
  assert.equal((await asUser(db, 'service_role', 'select count(*)::int as n from stock_card')).rows[0].n, 0)
})

scenario('kartu stok dan riwayat tidak bisa diubah, bahkan oleh admin', async (db) => {
  await createPart(db, { stock: 1, cost: 1000 })
  await expectFailure(db.query('update stock_movements set qty = 99'), /hanya boleh ditambah/)
  await expectFailure(db.query('delete from stock_movements'), /hanya boleh ditambah/)
  await expectFailure(db.query('truncate stock_movements'), /hanya boleh ditambah/)
  await asUser(db, owner, `update store_settings set nama_bengkel = 'Maju Jaya'`)
  await expectFailure(db.query('delete from change_logs'), /hanya boleh ditambah/)
})

scenario('logo hanya bisa diunggah akun aktif', async (db) => {
  await asUser(db, cashier, `insert into storage.objects (bucket_id, name) values ('logo', 'logo.png')`)
  await expectFailure(asUser(db, former, `insert into storage.objects (bucket_id, name) values ('logo', 'x.png')`), /row-level security/)
  await expectFailure(asUser(db, null, `insert into storage.objects (bucket_id, name) values ('logo', 'x.png')`), /row-level security/)
  assert.equal((await asUser(db, former, 'select * from storage.objects')).rows.length, 0)
  assert.equal((await asUser(db, cashier, 'select * from storage.objects')).rows.length, 1)
})

// Produk -------------------------------------------------------------------

scenario('part baru dengan stok awal membuat mutasi stok awal dan rata-rata pertama', async (db) => {
  const id = await createPart(db, { stock: 10, cost: 10000 })
  assert.equal(await stockOf(db, id), 10)
  assert.equal(await avgCost(db, id), 10000)
  const card = await asUser(db, cashier, 'select jenis, qty_masuk, saldo, hpp_satuan, nama_akun from stock_card where product_id = $1', [id])
  assert.deepEqual(card.rows.map((x) => [x.jenis, num(x.qty_masuk), num(x.saldo), num(x.hpp_satuan), x.nama_akun]), [['stok_awal', 10, 10, 10000, 'Pak Budi']])
})

scenario('stok awal tanpa harga beli memakai 0 (R64); harga beli tetap hanya bersama stok awal', async (db) => {
  const id = await createPart(db, { stock: 5 })
  assert.equal(await stockOf(db, id), 5)
  assert.equal(await avgCost(db, id), 0)
  const card = await db.query(`select jenis, hpp_satuan from stock_movements where product_id = $1`, [id])
  assert.deepEqual(card.rows.map((r) => [r.jenis, num(r.hpp_satuan)]), [['stok_awal', 0]])
  await expectFailure(createPart(db, { stock: 5, cost: -1 }), /tidak boleh negatif/)
  await expectFailure(createPart(db, { cost: 5000 }), /hanya diisi bersama stok awal/)
})

scenario('part tanpa stok awal mulai dengan stok 0 dan rata-rata 0', async (db) => {
  const id = await createPart(db)
  assert.equal(await stockOf(db, id), 0)
  assert.equal(await avgCost(db, id), 0)
})

scenario('nama + merek unik tanpa membedakan huruf besar-kecil dan spasi', async (db) => {
  const cat = await createCategory(db)
  await createPart(db, { name: 'Kampas Rem Depan Vario', brand: 'Federal', category: cat })
  await expectFailure(createPart(db, { name: '  kampas rem   depan vario ', brand: 'FEDERAL', category: cat }), /sudah ada/)
  await createPart(db, { name: 'Kampas Rem Depan Vario', brand: 'AHM', category: cat })
  const r = await db.query(`select nama from products where merek = 'AHM'`)
  assert.equal(r.rows[0].nama, 'Kampas Rem Depan Vario')
})

scenario('tarif jasa boleh Rp 0, harga jual part wajib > Rp 0 (R5)', async (db) => {
  const service = await createService(db, 'Cek kendaraan', 0)
  const r = await db.query('select satuan, merek from products where id = $1', [service])
  assert.deepEqual(r.rows[0], { satuan: null, merek: null })
  assert.equal((await db.query('select count(*)::int as n from stock_levels where product_id = $1', [service])).rows[0].n, 0)
  await expectFailure(createPart(db, { price: 0 }), /Harga jual part wajib lebih dari Rp 0/)
  const part = await createPart(db, { price: 1 })
  await expectFailure(asUser(db, owner, 'update products set harga_jual = 0 where id = $1', [part]), /harga_jual_valid/)
  await asUser(db, owner, 'update products set harga_jual = 0 where id = $1', [service])
})

scenario('jasa tidak bisa punya stok, merek, atau barcode', async (db) => {
  const cat = await createCategory(db)
  await expectFailure(rpc(db, owner, 'create_product', { p_tipe: 'jasa', p_nama: 'Servis', p_category_id: cat, p_harga_jual: 1, p_stok_awal: 1, p_harga_beli: 1 }), /Jasa tidak punya/)
  await expectFailure(rpc(db, owner, 'create_product', { p_tipe: 'jasa', p_nama: 'Servis', p_category_id: cat, p_harga_jual: 1, p_barcodes: ['123'] }), /Jasa tidak punya/)
})

scenario('barcode unik di seluruh produk', async (db) => {
  await createPart(db, { barcodes: ['8991234567890'] })
  await expectFailure(createPart(db, { barcodes: ['8991234567890'] }), /sudah dipakai produk lain/)
})

scenario('barcode internal berupa angka urut mulai 200001 dan melompati angka yang sudah dipakai', async (db) => {
  const a = await createPart(db, { barcodes: ['200002'] })
  const b = await createPart(db)
  assert.equal(await rpc(db, cashier, 'create_internal_barcode', { p_product_id: b }), '200001')
  assert.equal(await rpc(db, cashier, 'create_internal_barcode', { p_product_id: b }), '200003')
  const r = await db.query(`select barcode, jenis from product_barcodes where product_id = $1 order by barcode`, [b])
  assert.deepEqual(r.rows, [{ barcode: '200001', jenis: 'internal' }, { barcode: '200003', jenis: 'internal' }])
  assert.ok(a)
})

scenario('kode part bisa ditambahkan dan dicari', async (db) => {
  const cat = await createCategory(db)
  const id = await rpc(db, owner, 'create_product', {
    p_tipe: 'part', p_nama: 'Kampas Rem', p_category_id: cat, p_harga_jual: 45000,
    p_kode_part: [{ kode_part: '06455-KVB-305', jenis: 'oem' }, { kode_part: 'FDB2088', jenis: 'alt' }],
  })
  const r = await asUser(db, cashier, `select product_id from product_part_numbers where kode_part ilike '%kvb%'`)
  assert.deepEqual(r.rows.map((x) => x.product_id), [id])
})

// Harga rata-rata ------------------------------------------------------------

scenario('penerimaan saat stok > 0 memakai rata-rata tertimbang', async (db) => {
  const id = await createPart(db, { stock: 10, cost: 10000 })
  await receive(db, [{ product_id: id, qty: 10, harga_beli: 20000 }])
  assert.equal(await stockOf(db, id), 20)
  assert.equal(await avgCost(db, id), 15000)
})

scenario('penerimaan saat stok minus memakai harga penerimaan itu', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 2, cost: 10000, price: 15000 })
  await sell(db, id, 4, 15000)
  assert.equal(await stockOf(db, id), -2)
  assert.equal(await avgCost(db, id), 10000)
  await receive(db, [{ product_id: id, qty: 5, harga_beli: 12000 }])
  assert.equal(await stockOf(db, id), 3)
  assert.equal(await avgCost(db, id), 12000)
})

scenario('barang bonus Rp 0 ikut rata-rata tertimbang, urutan scan tidak berpengaruh (R6)', async (db) => {
  const a = await createPart(db)
  const b = await createPart(db)
  await receive(db, [{ product_id: a, qty: 1, harga_beli: 0 }, { product_id: a, qty: 12, harga_beli: 45000 }])
  await receive(db, [{ product_id: b, qty: 12, harga_beli: 45000 }, { product_id: b, qty: 1, harga_beli: 0 }])
  assert.equal(await avgCost(db, a), 41538.46)
  assert.equal(await avgCost(db, b), 41538.46)
  assert.equal(await stockOf(db, a), 13)
})

scenario('barang bonus Rp 0 saat stok <= 0 tidak mengubah rata-rata (R6)', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 1, cost: 10000, price: 15000 })
  await sell(db, id, 3, 15000)
  await receive(db, [{ product_id: id, qty: 1, harga_beli: 0 }])
  assert.equal(await stockOf(db, id), -1)
  assert.equal(await avgCost(db, id), 10000)
})

scenario('void penerimaan menghitung ulang rata-rata dari kartu stok (contoh R7)', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 10, cost: 10000, price: 25000 })
  const receipt = await receive(db, [{ product_id: id, qty: 10, harga_beli: 20000 }])
  assert.equal(await avgCost(db, id), 15000)
  await sell(db, id, 8, 25000)
  assert.equal(await stockOf(db, id), 12)
  await rpc(db, owner, 'void_receipt', { p_receipt_id: receipt.id, p_alasan: 'Salah ketik harga' })
  assert.equal(await stockOf(db, id), 2)
  assert.equal(await avgCost(db, id), 10000)
  // HPP nota yang sudah dibuat tidak berubah.
  const cogs = await db.query('select hpp_satuan from sale_items where product_id = $1', [id])
  assert.equal(num(cogs.rows[0].hpp_satuan), 15000)
  await expectFailure(rpc(db, owner, 'void_receipt', { p_receipt_id: receipt.id, p_alasan: 'lagi' }), /sudah di-void/)
})

scenario('void penerimaan yang membuat stok <= 0 tidak mengubah rata-rata', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 2, cost: 10000, price: 25000 })
  const receipt = await receive(db, [{ product_id: id, qty: 10, harga_beli: 20000 }])
  assert.equal(await avgCost(db, id), 18333.33)
  await sell(db, id, 12, 25000)
  await rpc(db, owner, 'void_receipt', { p_receipt_id: receipt.id, p_alasan: 'Barang dikembalikan' })
  assert.equal(await stockOf(db, id), -10)
  assert.equal(await avgCost(db, id), 18333.33)
})

scenario('void penerimaan dengan part yang sama di dua baris', async (db) => {
  const id = await createPart(db, { stock: 4, cost: 10000 })
  const receipt = await receive(db, [{ product_id: id, qty: 2, harga_beli: 16000 }, { product_id: id, qty: 2, harga_beli: 22000 }])
  await rpc(db, owner, 'void_receipt', { p_receipt_id: receipt.id, p_alasan: 'Faktur salah' })
  assert.equal(await stockOf(db, id), 4)
  assert.equal(await avgCost(db, id), 10000)
})

scenario('void nota mengembalikan stok dengan HPP asal dan dihitung seperti penerimaan', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 10, cost: 10000, price: 25000 })
  const n = await sell(db, id, 4, 25000)
  await receive(db, [{ product_id: id, qty: 4, harga_beli: 20000 }])
  assert.equal(await avgCost(db, id), 14000)
  await rpc(db, owner, 'void_sale', { p_sale_id: n.id, p_alasan: 'Salah input' })
  assert.equal(await stockOf(db, id), 14)
  assert.equal(await avgCost(db, id), 12857.14)
  const s = await db.query('select status, void_alasan, void_oleh from sales where id = $1', [n.id])
  assert.deepEqual(s.rows[0], { status: 'void', void_alasan: 'Salah input', void_oleh: owner })
  await expectFailure(rpc(db, owner, 'void_sale', { p_sale_id: n.id, p_alasan: 'lagi' }), /sudah di-void/)
  await expectFailure(rpc(db, owner, 'void_sale', { p_sale_id: n.id, p_alasan: '  ' }), /Alasan void wajib/)
})

// Kasir ----------------------------------------------------------------------

scenario('nota contoh struk PRD 4.10: diskon baris, diskon nota, tunai, alokasi diskon', async (db) => {
  await registerDevice(db)
  const cat = await createCategory(db, 'Rem')
  const brakePad = await createPart(db, { name: 'Kampas Rem Depan Vario', brand: 'Federal', price: 45000, stock: 5, cost: 30000, category: cat })
  const oil = await createPart(db, { name: 'Oli MPX 1L', brand: 'AHM', price: 52000, stock: 5, cost: 40000 })
  const service = await createService(db, 'Servis rem', 35000)
  const result = await checkout(db, [
    { product_id: brakePad, qty: 1, harga: 45000 },
    { product_id: oil, qty: 1, harga: 52000, diskon_jenis: 'nominal', diskon_input: 2000 },
    { product_id: service, qty: 1, harga: 35000 },
  ], { sequence: 7, total: 125000, method: 'tunai', cash: 150000, discountKind: 'nominal', discountInput: 5000, plate: 'b 1234 xyz', customer: 'Pak Budi' })
  assert.equal(result.nomor, `KSR-${TODAY}-0007`)
  assert.equal(result.nomor_asli, null)
  const s = (await db.query('select subtotal, diskon_nota, total, uang_diterima, kembalian, nopol, nopol_kunci, user_id from sales where id = $1', [result.id])).rows[0]
  assert.deepEqual(
    [num(s.subtotal), num(s.diskon_nota), num(s.total), num(s.uang_diterima), num(s.kembalian), s.nopol, s.nopol_kunci, s.user_id],
    [130000, 5000, 125000, 150000, 25000, 'B 1234 XYZ', 'B1234XYZ', cashier],
  )
  const lines = (await db.query('select nama_snapshot, merek_snapshot, jumlah, diskon, alokasi_diskon_nota, hpp_satuan from sale_items where sale_id = $1 order by urutan', [result.id])).rows
  assert.deepEqual(lines.map((b) => [b.nama_snapshot, b.merek_snapshot, num(b.jumlah), num(b.diskon), num(b.alokasi_diskon_nota), num(b.hpp_satuan)]), [
    ['Kampas Rem Depan Vario', 'Federal', 45000, 0, 1731, 30000],
    ['Oli MPX 1L', 'AHM', 52000, 2000, 1923, 40000],
    ['Servis rem', null, 35000, 0, 1346, null],
  ])
  assert.equal(await stockOf(db, brakePad), 4)
  assert.equal(await stockOf(db, oil), 4)
  assert.equal(await avgCost(db, brakePad), 30000)
})

scenario('pembulatan rupiah terdekat untuk diskon persen dan qty pecahan (R2)', async (db) => {
  await registerDevice(db)
  const a = await createPart(db, { price: 45250 })
  const b = await createPart(db, { price: 12750, fractional: true })
  const result = await checkout(db, [
    { product_id: a, qty: 1, harga: 45250, diskon_jenis: 'persen', diskon_input: 12.5 },
    { product_id: b, qty: 0.33, harga: 12750 },
  ], { total: 43802 })
  const lines = (await db.query('select jumlah, diskon from sale_items where sale_id = $1 order by urutan', [result.id])).rows
  assert.deepEqual(lines.map((x) => [num(x.jumlah), num(x.diskon)]), [[45250, 5656], [4208, 0]])
})

scenario('diskon nominal baris berlaku untuk total baris (R3)', async (db) => {
  await registerDevice(db)
  const oil = await createPart(db, { price: 52000 })
  const result = await checkout(db, [{ product_id: oil, qty: 3, harga: 52000, diskon_jenis: 'nominal', diskon_input: 2000 }], { total: 154000 })
  assert.equal(result.total, 154000)
})

scenario('alokasi diskon nota hampir 100% tidak melebihi nilai baris', async (db) => {
  await registerDevice(db)
  const cat = await createCategory(db)
  const j1 = await createService(db, 'Jasa A', 100, cat)
  const j2 = await createService(db, 'Jasa B', 1, cat)
  const j3 = await createService(db, 'Jasa C', 1, cat)
  const result = await checkout(db, [
    { product_id: j1, qty: 1, harga: 100 },
    { product_id: j2, qty: 1, harga: 1 },
    { product_id: j3, qty: 1, harga: 1 },
  ], { total: 1, discountKind: 'nominal', discountInput: 101 })
  const lines = (await db.query('select alokasi_diskon_nota as a from sale_items where sale_id = $1 order by urutan', [result.id])).rows
  assert.deepEqual(lines.map((x) => num(x.a)), [99, 1, 1])
})

scenario('total nota yang tidak cocok ditolak', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 10000 })
  await expectFailure(checkout(db, [{ product_id: id, qty: 2, harga: 10000 }], { total: 19000 }), /Total nota tidak cocok: perangkat Rp 19000, server Rp 20000/)
})

scenario('diskon tidak boleh membuat harga di bawah Rp 0', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 10000 })
  await expectFailure(checkout(db, [{ product_id: id, qty: 1, harga: 10000, diskon_jenis: 'nominal', diskon_input: 10001 }], { total: 0 }), /di bawah Rp 0/)
  await expectFailure(checkout(db, [{ product_id: id, qty: 1, harga: 10000, diskon_jenis: 'persen', diskon_input: 101 }], { total: 0 }), /0 sampai 100/)
  const free = await checkout(db, [{ product_id: id, qty: 1, harga: 10000, diskon_jenis: 'persen', diskon_input: 100 }], { total: 0 })
  assert.equal(free.total, 0)
})

scenario('nota yang dikirim ulang dengan client_id sama tidak tercatat dua kali', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 5, cost: 1000, price: 2000 })
  const clientId = crypto.randomUUID()
  const a = await sell(db, id, 1, 2000, { clientId })
  const b = await sell(db, id, 1, 2000, { clientId })
  assert.equal(a.id, b.id)
  assert.equal(b.sudah_ada, true)
  assert.equal(await stockOf(db, id), 4)
})

scenario('nomor urut yang sudah terpakai diganti dengan nomor kosong berikutnya', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 2000 })
  await sell(db, id, 1, 2000, { sequence: 1 })
  await sell(db, id, 1, 2000, { sequence: 2 })
  const c = await sell(db, id, 1, 2000, { sequence: 1 })
  assert.equal(c.nomor, `KSR-${TODAY}-0003`)
  assert.equal(c.nomor_asli, `KSR-${TODAY}-0001`)
  const tanggal = `${TODAY.slice(0, 4)}-${TODAY.slice(4, 6)}-${TODAY.slice(6)}`
  assert.equal(await rpc(db, cashier, 'get_last_sale_urut', { p_tanggal: tanggal }), 3)
  assert.equal(await rpc(db, cashier, 'get_last_sale_urut', { p_tanggal: '2020-01-01' }), 0)
})

scenario('nota diterima dari laptop mana pun tanpa pendaftaran perangkat (R50)', async (db) => {
  const id = await createPart(db, { price: 2000 })
  // Tidak ada Perangkat Kasir yang terdaftar sama sekali.
  const a = await sell(db, id, 1, 2000, { device: DEVICE, sequence: 1 })
  const b = await sell(db, id, 1, 2000, { device: DEVICE_B, sequence: 2, caller: owner, creator: owner })
  const r = await db.query('select device_id, user_id from sales where id in ($1, $2) order by urut', [a.id, b.id])
  assert.deepEqual(r.rows.map((x) => [x.device_id, x.user_id]), [[DEVICE, cashier], [DEVICE_B, owner]])
  // Dua laptop yang sama-sama offline memakai urut yang sama: nota kedua mendapat nomor kosong berikutnya.
  const c = await sell(db, id, 1, 2000, { device: DEVICE_B, sequence: 2 })
  assert.equal(c.nomor_asli, `KSR-${TODAY}-0002`)
  assert.equal(c.nomor, `KSR-${TODAY}-0003`)
})

scenario('nota offline dari akun yang sekarang nonaktif tetap diterima', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 2000 })
  const n = await sell(db, id, 1, 2000, { creator: former })
  const r = await db.query('select user_id from sales where id = $1', [n.id])
  assert.equal(r.rows[0].user_id, former)
  await expectFailure(sell(db, id, 1, 2000, { creator: noProfile }), /Akun pembuat nota tidak dikenal/)
})

scenario('stok boleh minus', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 1, cost: 1000, price: 2000 })
  await sell(db, id, 3, 2000)
  assert.equal(await stockOf(db, id), -2)
})

scenario('qty: bulat untuk part biasa dan jasa, maksimal 2 desimal untuk part bisa pecahan (R4)', async (db) => {
  await registerDevice(db)
  const regular = await createPart(db, { price: 2000 })
  const pecahan = await createPart(db, { price: 52000, fractional: true })
  const service = await createService(db, 'Tambal ban', 15000)
  await expectFailure(sell(db, regular, 1.5, 2000), /harus bilangan bulat/)
  await expectFailure(sell(db, service, 1.5, 15000), /harus bilangan bulat/)
  await expectFailure(sell(db, pecahan, 1.555, 52000, { total: 80860 }), /2 angka di belakang koma/)
  const n = await sell(db, service, 2, 15000)
  assert.equal(n.total, 30000)
  const m = await sell(db, pecahan, 1.5, 52000)
  assert.equal(m.total, 78000)
  assert.equal(await stockOf(db, pecahan), -1.5)
})

scenario('metode non-tunai: uang diterima = total, kembalian 0; tunai kurang ditolak', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 20000 })
  const n = await sell(db, id, 1, 20000, { method: 'transfer', cash: 999999 })
  const s = (await db.query('select uang_diterima, kembalian from sales where id = $1', [n.id])).rows[0]
  assert.deepEqual([num(s.uang_diterima), num(s.kembalian)], [20000, 0])
  await expectFailure(sell(db, id, 1, 20000, { method: 'tunai', cash: 10000 }), /Uang diterima kurang/)
  await expectFailure(sell(db, id, 1, 20000, { method: 'tempo' }), /Metode bayar tidak dikenal/)
})

scenario('nama pelanggan terakhir per nopol untuk isian otomatis', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { price: 2000 })
  await sell(db, id, 1, 2000, { plate: 'b 1234 xyz', customer: 'Pak Budi' })
  await sell(db, id, 1, 2000, { plate: 'B1234XYZ', customer: 'Bu Sari' })
  const r = await asUser(db, cashier, 'select nopol_kunci, nama_pelanggan from nopol_last_customer')
  assert.deepEqual(r.rows, [{ nopol_kunci: 'B1234XYZ', nama_pelanggan: 'Bu Sari' }])
})

// Penerimaan & nomor dokumen ---------------------------------------------------

scenario('nomor penerimaan dan opname, awalan diubah tidak mengulang urut', async (db) => {
  const id = await createPart(db)
  const a = await receive(db, [{ product_id: id, qty: 1, harga_beli: 1000 }])
  const b = await receive(db, [{ product_id: id, qty: 1, harga_beli: 1000 }])
  assert.equal(a.nomor, `TRM-${TODAY}-0001`)
  assert.equal(b.nomor, `TRM-${TODAY}-0002`)
  await asUser(db, owner, `update store_settings set awalan_penerimaan = ' tb '`)
  const c = await receive(db, [{ product_id: id, qty: 1, harga_beli: 1000 }])
  assert.equal(c.nomor, `TB-${TODAY}-0003`)
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  assert.equal(o.nomor, `OPN-${TODAY}-01`)
})

scenario('harga beli terakhir mengabaikan penerimaan void dan barang bonus', async (db) => {
  const id = await createPart(db)
  const supplier = (await asUser(db, owner, `insert into suppliers (nama) values ('Sumber Jaya') returning id`)).rows[0].id
  await rpc(db, owner, 'create_receipt', { p_items: [{ product_id: id, qty: 5, harga_beli: 10000 }], p_supplier_id: supplier })
  const second = await receive(db, [{ product_id: id, qty: 5, harga_beli: 12000 }, { product_id: id, qty: 1, harga_beli: 0 }])
  let r = await asUser(db, cashier, 'select harga_beli, supplier from last_purchase where product_id = $1', [id])
  assert.deepEqual(r.rows.map((x) => [num(x.harga_beli), x.supplier]), [[12000, null]])
  await rpc(db, owner, 'void_receipt', { p_receipt_id: second.id, p_alasan: 'Salah' })
  r = await asUser(db, cashier, 'select harga_beli, supplier from last_purchase where product_id = $1', [id])
  assert.deepEqual(r.rows.map((x) => [num(x.harga_beli), x.supplier]), [[10000, 'Sumber Jaya']])
  assert.equal((await asUser(db, former, 'select * from last_purchase')).rows.length, 0)
})

scenario('tanggal faktur boleh mundur tetapi tidak boleh setelah hari ini', async (db) => {
  const id = await createPart(db)
  const a = await receive(db, [{ product_id: id, qty: 1, harga_beli: 1000 }], { date: '2026-01-15' })
  const r = await db.query('select tanggal_faktur::text as t from receipts where id = $1', [a.id])
  assert.equal(r.rows[0].t, '2026-01-15')
  await expectFailure(receive(db, [{ product_id: id, qty: 1, harga_beli: 1000 }], { date: '2099-01-01' }), /tidak boleh setelah hari ini/)
})

scenario('penerimaan hanya untuk part dan harga beli tidak negatif', async (db) => {
  const service = await createService(db, 'Servis', 1000)
  await expectFailure(receive(db, [{ product_id: service, qty: 1, harga_beli: 1000 }]), /bukan part/)
  const id = await createPart(db)
  await expectFailure(receive(db, [{ product_id: id, qty: 1, harga_beli: -1 }]), /Harga beli .* tidak valid/)
  await expectFailure(receive(db, []), /tidak punya baris/)
})

// Penyesuaian stok -------------------------------------------------------------

scenario('penyesuaian stok: alasan wajib, Lainnya wajib keterangan, part tanpa rata-rata tidak wajib harga (R8, R64)', async (db) => {
  const id = await createPart(db)
  await expectFailure(rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 2, p_alasan: null }), /Alasan wajib dipilih/)
  await expectFailure(rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 2, p_alasan: 'lainnya' }), /Keterangan wajib/)
  await expectFailure(rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 2, p_alasan: 'ketemu', p_harga_beli: -1 }), /tidak boleh negatif/)
  assert.equal(await rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 1, p_alasan: 'ketemu' }), '1.00')
  assert.equal(await avgCost(db, id), 0)
  // Harga beli yang masih dikirim (aplikasi lama) tetap dipakai.
  assert.equal(await rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 1, p_alasan: 'ketemu', p_harga_beli: 20000 }), '2.00')
  assert.equal(await avgCost(db, id), 20000)
  await rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: -1, p_alasan: 'rusak', p_keterangan: 'Pecah' })
  assert.equal(await stockOf(db, id), 1)
  assert.equal(await avgCost(db, id), 20000)
  const log = await db.query(`select data_lama, data_baru, user_id from change_logs where aksi = 'penyesuaian_stok' order by id`)
  assert.equal(log.rows.length, 3)
  assert.deepEqual(log.rows[2].data_baru, { stok: 1, qty: -1, alasan: 'rusak', keterangan: 'Pecah' })
  assert.equal(log.rows[2].user_id, cashier)
  const card = await asUser(db, cashier, 'select alasan, keterangan, qty_keluar from stock_card where product_id = $1 order by id', [id])
  assert.deepEqual(card.rows.map((x) => [x.alasan, x.keterangan, num(x.qty_keluar)]), [['ketemu', null, null], ['ketemu', null, null], ['rusak', 'Pecah', 1]])
})

scenario('penyesuaian tambah pada part yang punya rata-rata memakai rata-rata saat itu', async (db) => {
  const id = await createPart(db, { stock: 4, cost: 10000 })
  await rpc(db, cashier, 'adjust_stock', { p_product_id: id, p_qty: 2, p_alasan: 'ketemu', p_harga_beli: 99999 })
  assert.equal(await avgCost(db, id), 10000)
  const r = await db.query(`select hpp_satuan from stock_movements where jenis = 'penyesuaian'`)
  assert.equal(num(r.rows[0].hpp_satuan), 10000)
})

// Opname -----------------------------------------------------------------------

scenario('contoh opname PRD 4.5: penjualan setelah dihitung tidak membuat selisih', async (db) => {
  await registerDevice(db)
  const cat = await createCategory(db, 'Oli')
  const oil = await createPart(db, { name: 'Oli MPX', category: cat, stock: 10, cost: 40000, price: 52000 })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'kategori', p_category_id: cat })
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: oil, p_qty: 10 })
  await sell(db, oil, 2, 52000)
  assert.equal(await stockOf(db, oil), 8)
  const review = await asUser(db, cashier, 'select selisih, stok_sekarang from review_opname($1)', [o.id])
  assert.deepEqual(review.rows.map((x) => [num(x.selisih), num(x.stok_sekarang)]), [[0, 8]])
  const result = await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  assert.equal(result.part_selisih, 0)
  assert.equal(await stockOf(db, oil), 8)
})

scenario('opname: part belum dihitung harus diputuskan, alasan wajib untuk selisih (R8)', async (db) => {
  const cat = await createCategory(db, 'Busi')
  const a = await createPart(db, { name: 'Busi A', category: cat, stock: 3, cost: 10000 })
  const b = await createPart(db, { name: 'Busi B', category: cat, stock: 5, cost: 10000 })
  const c = await createPart(db, { name: 'Busi C', category: cat, stock: 7, cost: 10000 })
  const other = await createPart(db, { name: 'Oli', stock: 1, cost: 1000 })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'kategori', p_category_id: cat })
  await expectFailure(rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: other, p_qty: 1 }), /di luar cakupan/)
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: a, p_qty: 3 })
  await expectFailure(rpc(db, owner, 'confirm_opname', { p_opname_id: o.id }), /Masih ada 2 part yang belum dihitung/)
  await rpc(db, cashier, 'set_opname_decision', { p_opname_id: o.id, p_product_ids: [b], p_keputusan: 'dianggap_nol' })
  await rpc(db, cashier, 'set_opname_decision', { p_opname_id: o.id, p_product_ids: [a, c], p_keputusan: 'dilewati' })
  const review = await asUser(db, cashier, 'select nama, keputusan, selisih, selisih_rupiah from review_opname($1)', [o.id])
  assert.deepEqual(review.rows.map((x) => [x.nama, x.keputusan, num(x.selisih), num(x.selisih_rupiah)]), [
    ['Busi A', 'dihitung', 0, 0],
    ['Busi B', 'dianggap_nol', -5, -50000],
    ['Busi C', 'dilewati', null, null],
  ])
  await expectFailure(rpc(db, owner, 'confirm_opname', { p_opname_id: o.id }), /Alasan selisih belum diisi: Busi B/)
  await expectFailure(rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [b], p_alasan: 'lainnya' }), /Keterangan wajib/)
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [b], p_alasan: 'hilang' })
  await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  assert.equal(await stockOf(db, a), 3)
  assert.equal(await stockOf(db, b), 0)
  assert.equal(await stockOf(db, c), 7)
  const m = await db.query(`select qty, hpp_satuan, alasan from stock_movements where jenis = 'opname'`)
  assert.deepEqual(m.rows.map((x) => [num(x.qty), num(x.hpp_satuan), x.alasan]), [[-5, 10000, 'hilang']])
  const s = await db.query('select status, dikonfirmasi_oleh from stock_opnames where id = $1', [o.id])
  assert.deepEqual(s.rows[0], { status: 'dikonfirmasi', dikonfirmasi_oleh: owner })
  await expectFailure(rpc(db, owner, 'cancel_opname', { p_opname_id: o.id }), /tidak terbuka/)
})

scenario('opname: hasil sesi dikonfirmasi hanya berisi part yang tercatat, HPP tetap dari mutasinya', async (db) => {
  const cat = await createCategory(db, 'Busi')
  const a = await createPart(db, { name: 'Busi A', category: cat, stock: 5, cost: 10000 })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'kategori', p_category_id: cat })
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: a, p_qty: 3 })
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [a], p_alasan: 'rusak' })
  await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  // Sesudah konfirmasi: part baru di kategori yang sama dan harga rata-rata yang berubah tidak mengubah hasil.
  await createPart(db, { name: 'Busi B', category: cat, stock: 2, cost: 9000 })
  await receive(db, [{ product_id: a, qty: 3, harga_beli: 20000 }])
  const result = await asUser(db, cashier, 'select nama, keputusan, qty_hitung, stok_sistem_saat_hitung, selisih from review_opname($1)', [o.id])
  assert.deepEqual(result.rows.map((x) => [x.nama, x.keputusan, num(x.qty_hitung), num(x.stok_sistem_saat_hitung), num(x.selisih)]), [
    ['Busi A', 'dihitung', 3, 5, -2],
  ])
  const m = await asUser(db, cashier, `select product_id, hpp_satuan from stock_movements where ref_type = 'opname' and ref_id = $1`, [o.id])
  assert.deepEqual(m.rows.map((x) => [x.product_id, num(x.hpp_satuan)]), [[a, 10000]])
})

scenario('opname: selisih lebih pada part tanpa rata-rata tidak wajib harga beli (R64)', async (db) => {
  const id = await createPart(db, { name: 'Baut' })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 3 })
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [id], p_alasan: 'ketemu' })
  const t = await asUser(db, cashier, 'select perlu_harga_beli from review_opname($1)', [o.id])
  assert.equal(t.rows[0].perlu_harga_beli, false)
  await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  assert.equal(await stockOf(db, id), 3)
  assert.equal(await avgCost(db, id), 0)
})

scenario('opname: scan menambah hitungan, ketik qty mengganti hitungan', async (db) => {
  const id = await createPart(db)
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  const scan = () => rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 1, p_tambah: true })
  await scan()
  await scan()
  assert.equal(num(await scan()), 3)
  assert.equal(num(await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 10 })), 10)
  assert.equal(num(await scan()), 11)
  await expectFailure(rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 1.5 }), /tidak valid/)
})

scenario('opname: hanya satu sesi terbuka; batalkan tidak mengubah stok', async (db) => {
  const id = await createPart(db, { stock: 5, cost: 1000 })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  await expectFailure(rpc(db, owner, 'open_opname', { p_jenis: 'penuh' }), /Masih ada sesi opname yang terbuka/)
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 1 })
  await rpc(db, owner, 'cancel_opname', { p_opname_id: o.id })
  assert.equal(await stockOf(db, id), 5)
  const r = await db.query('select status from stock_opnames where id = $1', [o.id])
  assert.equal(r.rows[0].status, 'dibatalkan')
  assert.equal((await db.query('select count(*)::int as n from stock_opname_items')).rows[0].n, 1)
  const o2 = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  assert.equal(o2.nomor, `OPN-${TODAY}-02`)
  await expectFailure(rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: id, p_qty: 1 }), /tidak terbuka/)
})

scenario('opname: dianggap 0 pada stok minus menjadi selisih lebih', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { stock: 1, cost: 8000, price: 10000 })
  await sell(db, id, 3, 10000)
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  await rpc(db, cashier, 'set_opname_decision', { p_opname_id: o.id, p_product_ids: [id], p_keputusan: 'dianggap_nol' })
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [id], p_alasan: 'salah_input' })
  await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  assert.equal(await stockOf(db, id), 0)
  assert.equal(await avgCost(db, id), 8000)
})

scenario('tinjau opname tidak terlihat oleh akun nonaktif', async (db) => {
  await createPart(db)
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  assert.equal((await asUser(db, former, 'select * from review_opname($1)', [o.id])).rows.length, 0)
  assert.equal((await asUser(db, cashier, 'select * from review_opname($1)', [o.id])).rows.length, 1)
})

// Riwayat perubahan --------------------------------------------------------------

scenario('ubah harga jual tercatat dengan data lama dan baru (R10)', async (db) => {
  const id = await createPart(db, { price: 45000 })
  await asUser(db, cashier, 'update products set harga_jual = 47000 where id = $1', [id])
  const r = await db.query(`select user_id, aksi, entitas, entitas_id, data_lama, data_baru from change_logs`)
  assert.deepEqual(r.rows, [{ user_id: cashier, aksi: 'ubah_harga_jual', entitas: 'products', entitas_id: id, data_lama: { harga_jual: 45000 }, data_baru: { harga_jual: 47000 } }])
})

scenario('perubahan rata-rata oleh sistem dan pembuatan data tidak dicatat', async (db) => {
  const id = await createPart(db, { stock: 1, cost: 1000, barcodes: ['8990001'] })
  await receive(db, [{ product_id: id, qty: 1, harga_beli: 3000 }])
  await createCategory(db, 'Baru')
  assert.equal((await db.query('select count(*)::int as n from change_logs')).rows[0].n, 0)
})

scenario('tambah dan hapus barcode serta kode part tercatat di produknya', async (db) => {
  const id = await createPart(db)
  await asUser(db, cashier, `insert into product_barcodes (product_id, barcode, jenis) values ($1, '899123', 'pabrik')`, [id])
  await asUser(db, cashier, `delete from product_barcodes where barcode = '899123'`)
  await rpc(db, cashier, 'create_internal_barcode', { p_product_id: id })
  await asUser(db, cashier, `insert into product_part_numbers (product_id, kode_part, jenis) values ($1, 'ABC-1', 'oem')`, [id])
  const r = await db.query(`select aksi, entitas, entitas_id from change_logs order by id`)
  assert.deepEqual(r.rows.map((x) => [x.aksi, x.entitas, x.entitas_id]), [
    ['tambah_barcode', 'products', id],
    ['hapus_barcode', 'products', id],
    ['tambah_barcode', 'products', id],
    ['tambah_kode_part', 'products', id],
  ])
})

scenario('pengaturan: semua perubahan tercatat, awalan dirapikan dan harus berbeda', async (db) => {
  await asUser(db, cashier, `update store_settings set awalan_nota = 'ks', blind_count = false`)
  const s = (await db.query('select awalan_nota from store_settings')).rows[0]
  assert.equal(s.awalan_nota, 'KS')
  const r = await db.query(`select aksi, data_lama, data_baru from change_logs`)
  assert.deepEqual(r.rows, [{ aksi: 'ubah_pengaturan', data_lama: { awalan_nota: 'KSR', blind_count: true }, data_baru: { awalan_nota: 'KS', blind_count: false } }])
  await expectFailure(asUser(db, cashier, `update store_settings set awalan_nota = 'TRM'`), /awalan_berbeda/)
  await expectFailure(asUser(db, cashier, `update store_settings set awalan_nota = 'KS-1'`), /awalan_format/)
  await expectFailure(asUser(db, cashier, `update store_settings set ukuran_kertas = 70`), /check/)
})

scenario('nonaktifkan dan aktifkan kategori, mekanik, supplier tercatat', async (db) => {
  const cat = await createCategory(db, 'Aki')
  await asUser(db, cashier, 'update categories set aktif = false where id = $1', [cat])
  await asUser(db, cashier, 'update categories set aktif = true where id = $1', [cat])
  const m = (await asUser(db, cashier, `insert into mechanics (nama) values (' Andi ') returning id, nama`)).rows[0]
  assert.equal(m.nama, 'Andi')
  await asUser(db, cashier, `update mechanics set nama = 'Andi S' where id = $1`, [m.id])
  await expectFailure(asUser(db, cashier, `insert into mechanics (nama) values ('andi s')`), /mechanics_nama_unik/)
  const r = await db.query(`select aksi from change_logs order by id`)
  assert.deepEqual(r.rows.map((x) => x.aksi), ['nonaktifkan_kategori', 'aktifkan_kategori', 'ubah_mekanik'])
})

// Laporan (PRD 4.11, R28-R34) ------------------------------------------------------

const TODAY_ISO = `${TODAY.slice(0, 4)}-${TODAY.slice(4, 6)}-${TODAY.slice(6)}`
const daysAgo = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() - n * 86400000))
const report = async (db, user, fn, args = []) =>
  (await asUser(db, user, `select * from ${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')})`, args)).rows

async function salesSetup(db) {
  await registerDevice(db)
  const catOil = await createCategory(db, 'Oli')
  const catService = await createCategory(db, 'Jasa')
  const oil = await createPart(db, { name: 'Oli MPX', category: catOil, price: 52000, stock: 10, cost: 40000 })
  const service = await createService(db, 'Servis rem', 35000, catService)
  const mechanic = (await asUser(db, owner, `insert into mechanics (nama) values ('Andi') returning id`)).rows[0].id
  // Diskon baris 2.000 di oli, diskon nota 10% dari 85.000: oli 50.000 - 5.000, jasa 35.000 - 3.500.
  await checkout(
    db,
    [
      { product_id: oil, qty: 1, harga: 52000, diskon_jenis: 'nominal', diskon_input: 2000 },
      { product_id: service, qty: 1, harga: 35000 },
    ],
    { total: 76500, discountKind: 'persen', discountInput: 10, plate: 'B 1234 XYZ', mechanicId: mechanic, method: 'qris' },
  )
  await sell(db, oil, 2, 52000, { method: 'tunai', cash: 104000, plate: 'b1234xyz' })
  const voided = await sell(db, service, 1, 35000, { method: 'tunai', cash: 35000 })
  await rpc(db, owner, 'void_sale', { p_sale_id: voided.id, p_alasan: 'Salah input' })
  return { oil, service, mechanic }
}

scenario('laporan penjualan: omzet setelah diskon, part/jasa terpisah, void tidak dihitung (R28)', async (db) => {
  await salesSetup(db)
  const [s] = await report(db, cashier, 'report_sales_summary', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(
    [s.nota, s.kendaraan, num(s.omzet_part), num(s.omzet_jasa), num(s.diskon), num(s.total), num(s.hpp), s.void_nota, num(s.void_total)],
    [2, 1, 149000, 31500, 10500, 180500, 120000, 1, 35000],
  )
  const method = await report(db, cashier, 'report_sales_by_method', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(method.map((r) => [r.metode_bayar, r.nota, num(r.total)]), [['qris', 1, 76500], ['tunai', 1, 104000]])
  const category = await report(db, cashier, 'report_sales_by_category', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(category.map((r) => [r.kategori, num(r.omzet), num(r.hpp)]), [['Oli', 149000, 120000], ['Jasa', 31500, 0]])
  const product = await report(db, cashier, 'report_sales_by_product', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(product.map((r) => [r.nama, r.tipe, num(r.qty), num(r.omzet), num(r.hpp), num(r.stok)]), [
    // Urut laba kotor terbesar (R34): jasa 31.500, oli 149.000 - 120.000 = 29.000.
    ['Servis rem', 'jasa', 1, 31500, 0, null],
    ['Oli MPX', 'part', 3, 149000, 120000, 7],
  ])
  const day = await report(db, cashier, 'report_sales_by_day', [daysAgo(2), TODAY_ISO])
  assert.deepEqual(day.map((r) => [r.nota, num(r.omzet_part), num(r.omzet_jasa), num(r.diskon), num(r.hpp)]), [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [2, 149000, 31500, 10500, 120000],
  ])
  assert.equal(new Intl.DateTimeFormat('en-CA').format(day[2].tanggal), TODAY_ISO)
  // Nota kemarin tidak masuk periode hari ini.
  const [yesterday] = await report(db, cashier, 'report_sales_summary', [daysAgo(1), daysAgo(1)])
  assert.equal(yesterday.nota, 0)
})

scenario('kode harga beli: dirapikan jadi kapital, hanya huruf, hanya untuk part (R64)', async (db) => {
  const cat = await createCategory(db)
  const id = await rpc(db, owner, 'create_product', {
    p_tipe: 'part', p_nama: 'Oli MPX', p_category_id: cat, p_harga_jual: 50000, p_stok_awal: 4, p_kode_harga_beli: ' abgsk ',
  })
  assert.equal((await db.query('select kode_harga_beli from products where id = $1', [id])).rows[0].kode_harga_beli, 'ABGSK')
  assert.equal(await stockOf(db, id), 4)
  const blank = await createPart(db)
  assert.equal((await db.query('select kode_harga_beli from products where id = $1', [blank])).rows[0].kode_harga_beli, null)
  await expectFailure(
    rpc(db, owner, 'create_product', { p_tipe: 'part', p_nama: 'Busi', p_category_id: cat, p_harga_jual: 20000, p_kode_harga_beli: '45000' }),
    /hanya boleh huruf A-Z/,
  )
  await expectFailure(
    rpc(db, owner, 'create_product', { p_tipe: 'part', p_nama: 'Busi', p_category_id: cat, p_harga_jual: 20000, p_kode_harga_beli: 'AB GS' }),
    /hanya boleh huruf A-Z/,
  )
  await expectFailure(
    rpc(db, owner, 'create_product', { p_tipe: 'jasa', p_nama: 'Servis', p_category_id: cat, p_harga_jual: 20000, p_kode_harga_beli: 'AB' }),
    /kode harga beli/,
  )
  // Diubah langsung dari form produk: tercatat di riwayat; huruf kecil dan angka ditolak database.
  await asUser(db, cashier, `update products set kode_harga_beli = 'ACDTK' where id = $1`, [id])
  const log = await db.query(`select aksi, data_lama, data_baru, user_id from change_logs where entitas_id = $1 order by id`, [id])
  assert.deepEqual(log.rows.map((r) => [r.aksi, r.data_lama, r.data_baru, r.user_id]), [
    ['ubah_produk', { kode_harga_beli: 'ABGSK' }, { kode_harga_beli: 'ACDTK' }, cashier],
  ])
  await expectFailure(asUser(db, cashier, `update products set kode_harga_beli = 'acd' where id = $1`, [id]), /kode_harga_beli_valid/)
  await expectFailure(asUser(db, cashier, `update products set kode_harga_beli = 'A1' where id = $1`, [id]), /kode_harga_beli_valid/)
})

scenario('kode harga beli dari penerimaan: memperbarui kode part, kosong tidak mengubah, void tidak mengembalikan (R64)', async (db) => {
  const a = await createPart(db, { name: 'Oli A' })
  const b = await createPart(db, { name: 'Oli B' })
  await asUser(db, owner, `update products set kode_harga_beli = 'ABGSK' where id = $1`, [b])
  const r = await receive(db, [
    { product_id: a, qty: 5, harga_beli: 0, kode_harga_beli: 'kmt' },
    { product_id: b, qty: 2, harga_beli: 0, kode_harga_beli: '' },
  ])
  const code = async (id) => (await db.query('select kode_harga_beli from products where id = $1', [id])).rows[0].kode_harga_beli
  assert.equal(await code(a), 'KMT')
  assert.equal(await code(b), 'ABGSK')
  assert.deepEqual([await stockOf(db, a), await stockOf(db, b)], [5, 2])
  // Kode yang sama tidak membuat catatan riwayat baru.
  await receive(db, [{ product_id: a, qty: 1, harga_beli: 0, kode_harga_beli: 'KMT' }])
  const logs = await db.query(`select count(*) from change_logs where aksi = 'ubah_produk' and entitas_id = $1`, [a])
  assert.equal(num(logs.rows[0].count), 1)
  await rpc(db, owner, 'void_receipt', { p_receipt_id: r.id, p_alasan: 'Salah input' })
  assert.equal(await code(a), 'KMT')
  await expectFailure(receive(db, [{ product_id: a, qty: 1, harga_beli: 0, kode_harga_beli: '12' }]), /hanya boleh huruf A-Z/)
  // Aplikasi tanpa harga beli: dianggap 0.
  await receive(db, [{ product_id: a, qty: 1 }])
  assert.equal(await stockOf(db, a), 2) // 5 + 1, void -5, lalu +1
})

scenario('jasa manual: tercatat di nota tanpa produk, tanpa stok, dan masuk laporan sebagai Jasa manual', async (db) => {
  await registerDevice(db)
  const cat = await createCategory(db, 'Oli')
  const oil = await createPart(db, { name: 'Oli MPX', category: cat, price: 50000, stock: 5, cost: 40000 })
  const movementsBefore = num((await db.query('select count(*) from stock_movements')).rows[0].count)
  const sale = await checkout(
    db,
    [
      { product_id: oil, qty: 1, harga: 50000 },
      { product_id: null, nama: '  Las  knalpot ', qty: 2, harga: 15000, diskon_jenis: 'nominal', diskon_input: 5000 },
      { product_id: null, nama: 'Cuci motor', qty: 1, harga: 0 },
    ],
    { total: 75000 },
  )
  const lines = (await db.query('select product_id, nama_snapshot, merek_snapshot, tipe, qty, jumlah, diskon, hpp_satuan from sale_items where sale_id = $1 order by urutan', [sale.id])).rows
  assert.deepEqual(
    lines.slice(1).map((r) => [r.product_id, r.nama_snapshot, r.merek_snapshot, r.tipe, num(r.qty), num(r.jumlah), num(r.diskon), r.hpp_satuan]),
    [
      [null, 'Las knalpot', null, 'jasa', 2, 30000, 5000, null],
      [null, 'Cuci motor', null, 'jasa', 1, 0, 0, null],
    ],
  )
  // Hanya part yang membuat mutasi stok.
  assert.equal(num((await db.query('select count(*) from stock_movements')).rows[0].count), movementsBefore + 1)
  await checkout(db, [{ product_id: null, nama: 'LAS KNALPOT', qty: 1, harga: 20000 }], { total: 20000 })

  const [s] = await report(db, cashier, 'report_sales_summary', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual([num(s.omzet_part), num(s.omzet_jasa)], [50000, 45000])
  const category = await report(db, cashier, 'report_sales_by_category', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(category.map((r) => [r.category_id === null, r.kategori, num(r.omzet)]), [[false, 'Oli', 50000], [true, 'Jasa manual', 45000]])
  const product = await report(db, cashier, 'report_sales_by_product', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(product.map((r) => [r.product_id === null, r.tipe, r.kategori, num(r.qty), num(r.omzet), num(r.hpp)]), [
    [true, 'jasa', 'Jasa manual', 3, 45000, 0],
    [false, 'part', 'Oli', 1, 50000, 40000],
    [true, 'jasa', 'Jasa manual', 1, 0, 0],
  ])
})

scenario('jasa manual wajib bernama, qty bulat, dan tidak bisa langsung ditulis sebagai part tanpa produk', async (db) => {
  await registerDevice(db)
  await expectFailure(checkout(db, [{ product_id: null, nama: '   ', qty: 1, harga: 10000 }], { total: 10000 }), /Nama jasa manual di baris 1 kosong/)
  await expectFailure(checkout(db, [{ product_id: null, qty: 1, harga: 10000 }], { total: 10000 }), /Nama jasa manual/)
  await expectFailure(checkout(db, [{ product_id: null, nama: 'x'.repeat(101), qty: 1, harga: 10000 }], { total: 10000 }), /lebih dari 100 huruf/)
  await expectFailure(checkout(db, [{ product_id: null, nama: 'Las', qty: 1.5, harga: 10000 }], { total: 15000 }))
  await expectFailure(checkout(db, [{ product_id: null, nama: 'Las', qty: 1, harga: -1 }], { total: -1 }), /Harga Las tidak valid/)
  const sale = await checkout(db, [{ product_id: null, nama: 'Las', qty: 1, harga: 10000 }], { total: 10000 })
  await expectFailure(db.query("update sale_items set tipe = 'part', hpp_satuan = 0 where sale_id = $1", [sale.id]), /jasa_manual/)
})

scenario('laporan jasa per mekanik, dengan baris tanpa mekanik', async (db) => {
  await salesSetup(db)
  const rows = await report(db, cashier, 'report_services_by_mechanic', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(rows.map((r) => [r.mekanik, r.nota, num(r.omzet_jasa)]), [['Andi', 1, 31500], [null, 1, 0]])
})

scenario('laporan hanya untuk akun aktif; anon tidak bisa memanggil', async (db) => {
  await salesSetup(db)
  const [s] = await report(db, former, 'report_sales_summary', [TODAY_ISO, TODAY_ISO])
  assert.equal(s.nota, 0)
  await expectFailure(report(db, null, 'report_sales_summary', [TODAY_ISO, TODAY_ISO]), /permission denied/)
  await expectFailure(asUser(db, null, 'select * from change_log_entries'), /permission denied/)
})

scenario('laporan stok: nilai persediaan, stok minus dihitung 0, tanpa harga beli, terakhir terjual (R29, R30)', async (db) => {
  await registerDevice(db)
  const cat = await createCategory(db, 'Busi')
  await createPart(db, { name: 'A', category: cat, stock: 5, cost: 10000 })
  const b = await createPart(db, { name: 'B', category: cat, price: 25000, stock: 1, cost: 20000 })
  await sell(db, b, 4, 25000)
  const c = await createPart(db, { name: 'C', category: cat })
  await receive(db, [{ product_id: c, qty: 2, harga_beli: 0 }])
  const d = await createPart(db, { name: 'D', category: cat, stock: 1, cost: 1000 })
  await asUser(db, owner, 'update products set aktif = false where id = $1', [d])
  await createService(db, 'Jasa X', 10000, cat)
  const rows = await report(db, cashier, 'report_stock_value')
  assert.deepEqual(
    rows.map((r) => [r.nama, num(r.stok), num(r.harga_beli_avg), num(r.nilai), r.terakhir_terjual && new Intl.DateTimeFormat('en-CA').format(r.terakhir_terjual)]),
    [
      ['A', 5, 10000, 50000, null],
      ['B', -3, 20000, 0, TODAY_ISO],
      ['C', 2, 0, 0, null],
    ],
  )
  assert.ok(rows.every((r) => r.terdaftar_pada))
})

scenario('laporan penerimaan per supplier: periode tanggal faktur, void tidak dihitung', async (db) => {
  const id = await createPart(db, { name: 'Oli' })
  const s1 = (await asUser(db, owner, `insert into suppliers (nama) values ('Sumber Jaya') returning id`)).rows[0].id
  const s2 = (await asUser(db, owner, `insert into suppliers (nama) values ('Maju Motor') returning id`)).rows[0].id
  await rpc(db, owner, 'create_receipt', { p_items: [{ product_id: id, qty: 10, harga_beli: 10000 }], p_supplier_id: s1, p_tanggal_faktur: TODAY_ISO })
  await rpc(db, owner, 'create_receipt', { p_items: [{ product_id: id, qty: 1, harga_beli: 9000 }], p_supplier_id: s1, p_tanggal_faktur: daysAgo(1) })
  const voided = await rpc(db, owner, 'create_receipt', { p_items: [{ product_id: id, qty: 5, harga_beli: 2000 }], p_supplier_id: s2, p_tanggal_faktur: TODAY_ISO })
  await rpc(db, owner, 'void_receipt', { p_receipt_id: voided.id, p_alasan: 'Salah supplier' })
  await rpc(db, owner, 'create_receipt', { p_items: [{ product_id: id, qty: 1, harga_beli: 5000 }], p_tanggal_faktur: TODAY_ISO })
  const rows = await report(db, cashier, 'report_receiving_by_supplier', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(rows.map((r) => [r.supplier, r.penerimaan, num(r.total)]), [['Sumber Jaya', 1, 100000], [null, 1, 5000]])
})

scenario('laporan opname: selisih per sesi dan per alasan, sesi batal tidak dihitung', async (db) => {
  const cat = await createCategory(db, 'Busi')
  const p = await createPart(db, { name: 'P', category: cat, stock: 5, cost: 10000 })
  const q = await createPart(db, { name: 'Q', category: cat, stock: 4, cost: 2000 })
  const o = await rpc(db, owner, 'open_opname', { p_jenis: 'kategori', p_category_id: cat })
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: p, p_qty: 3 })
  await rpc(db, cashier, 'record_opname_count', { p_opname_id: o.id, p_product_id: q, p_qty: 6 })
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [p], p_alasan: 'hilang' })
  await rpc(db, cashier, 'set_opname_reason', { p_opname_id: o.id, p_product_ids: [q], p_alasan: 'ketemu' })
  await rpc(db, owner, 'confirm_opname', { p_opname_id: o.id })
  const batal = await rpc(db, owner, 'open_opname', { p_jenis: 'penuh' })
  await rpc(db, owner, 'cancel_opname', { p_opname_id: batal.id })
  const sessions = await report(db, cashier, 'report_stocktake_sessions', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(sessions.map((r) => [r.nomor, r.kategori, r.part_selisih, num(r.lebih), num(r.kurang)]), [[o.nomor, 'Busi', 2, 4000, -20000]])
  const reasons = await report(db, cashier, 'report_stocktake_by_reason', [TODAY_ISO, TODAY_ISO])
  assert.deepEqual(reasons.map((r) => [r.alasan, num(r.qty), num(r.nilai)]), [['hilang', -2, -20000], ['ketemu', 2, 4000]])
})

scenario('riwayat perubahan menampilkan nama objek dan akun', async (db) => {
  await registerDevice(db)
  const id = await createPart(db, { name: 'Oli MPX', brand: 'AHM', price: 52000, stock: 3, cost: 40000 })
  await asUser(db, owner, 'update products set harga_jual = 55000 where id = $1', [id])
  const sale = await sell(db, id, 1, 55000)
  await rpc(db, cashier, 'void_sale', { p_sale_id: sale.id, p_alasan: 'Batal' })
  await asUser(db, owner, `update store_settings set ukuran_kertas = 58 where id = 1`)
  const rows = (await asUser(db, cashier, `select aksi, objek, akun from change_log_entries where aksi <> 'ganti_perangkat_kasir' order by id`)).rows
  assert.deepEqual(rows.map((r) => [r.aksi, r.objek, r.akun]), [
    ['ubah_harga_jual', 'Oli MPX · AHM', 'Pak Budi'],
    ['void_nota', sale.nomor, 'Rina'],
    ['ubah_pengaturan', 'Pengaturan bengkel', 'Pak Budi'],
  ])
})

// Perangkat Kasir ------------------------------------------------------------------

scenario('jadikan Perangkat Kasir: perangkat lama ditutup, tercatat di riwayat', async (db) => {
  const a = await registerDevice(db, DEVICE)
  assert.equal(await registerDevice(db, DEVICE), a)
  await registerDevice(db, DEVICE_B)
  const r = await db.query('select device_id, selesai is null as aktif from cashier_devices order by mulai, aktif')
  assert.deepEqual(r.rows.map((x) => [x.device_id, x.aktif]), [[DEVICE, false], [DEVICE_B, true]])
  const log = await db.query(`select data_lama, data_baru from change_logs where aksi = 'ganti_perangkat_kasir' order by id`)
  assert.equal(log.rows.length, 2)
  assert.equal(log.rows[0].data_lama, null)
  assert.equal(log.rows[1].data_lama.device_id, DEVICE)
})

// Backup manual (R45, R47) ---------------------------------------------------------

scenario('unduh backup dicatat lewat RPC oleh akun aktif, tidak bisa diisi langsung', async (db) => {
  const waktu = await rpc(db, cashier, 'record_backup')
  const r = await asUser(db, owner, 'select user_id, created_at from backup_logs')
  assert.deepEqual(r.rows.map((x) => [x.user_id, x.created_at.getTime()]), [[cashier, waktu.getTime()]])
  await expectFailure(rpc(db, former, 'record_backup'), /tidak aktif|nonaktif|akses/i)
  await expectFailure(rpc(db, null, 'record_backup'), /permission denied/)
  await expectFailure(asUser(db, owner, `insert into backup_logs (user_id) values ('${owner}')`), /permission denied/)
  // Mengunduh backup bukan perubahan data.
  assert.equal((await db.query(`select count(*)::int as n from change_logs`)).rows[0].n, 0)
})

// Data contoh (supabase/seed) ------------------------------------------------------------

const SEED = (name) => readFileSync(new URL(`../seed/${name}`, import.meta.url), 'utf8')

scenario('data contoh mengisi semua fitur dengan data yang utuh, lalu bisa dikosongkan lagi', async (db) => {
  // Dijalankan dengan hak seperti SQL Editor Supabase (pemilik tabel, bukan superuser).
  await asTableOwner(db, () => db.exec(SEED('dummy-data.sql')))
  const one = async (sql) => (await db.query(sql)).rows[0]
  const product = (name) => `(select id from products where nama = '${name}')`

  const c = await one(`select (select count(*)::int from products) as products, (select count(*)::int from sales) as sales,
    (select count(*)::int from sales where status = 'void') as void_sales, (select count(*)::int from receipts) as receipts,
    (select count(*)::int from receipts where status = 'void') as void_receipts,
    (select count(distinct tanggal_nota)::int from sales) as days`)
  assert.equal(c.products, 29)
  assert.ok(c.sales >= 60, `nota ${c.sales}`)
  assert.equal(c.void_sales, 2)
  assert.equal(c.receipts, 5)
  assert.equal(c.void_receipts, 1)
  assert.ok(c.days >= 24, `hari ${c.days}`)

  // Saldo stok sama dengan jumlah kartu stok, dan setiap mutasi nota punya notanya.
  assert.equal((await one(`select count(*)::int as n from stock_levels l
    where qty_on_hand <> (select coalesce(sum(qty), 0) from stock_movements m where m.product_id = l.product_id)`)).n, 0)
  assert.equal((await one(`select count(*)::int as n from stock_movements m
    where m.ref_type = 'sale' and not exists (select 1 from sales s where s.id = m.ref_id)`)).n, 0)

  // Status stok dan penanda laporan stok.
  assert.ok(num((await one(`select qty_on_hand from stock_levels where product_id = ${product('Aki GTZ5S')}`)).qty_on_hand) < 0, 'aki minus')
  assert.equal(num((await one(`select qty_on_hand from stock_levels where product_id = ${product('Busi U20EPR9')}`)).qty_on_hand), 0)
  assert.ok((await one(`select count(*)::int as n from products p join stock_levels l on l.product_id = p.id
    where p.aktif and p.stok_min > 0 and l.qty_on_hand > 0 and l.qty_on_hand <= p.stok_min`)).n > 0, 'ada part menipis')
  const spion = await one(`select l.qty_on_hand, p.harga_beli_avg from products p join stock_levels l on l.product_id = p.id where p.nama = 'Spion Standar Beat'`)
  assert.deepEqual([num(spion.qty_on_hand), num(spion.harga_beli_avg)], [2, 0])
  const slow = await report(db, owner, 'report_stock_value')
  const old = slow.filter((r) => ['Roller Set 9 gr', 'Kabel Gas Beat'].includes(r.nama))
  assert.equal(old.length, 2)
  assert.ok(old.every((r) => r.terakhir_terjual === null && Date.now() - r.terdaftar_pada.getTime() > 100 * 86400000), `slow-moving ${JSON.stringify(old)}`)
  assert.equal((await one(`select aktif from products where nama = 'Oli Lama 1L'`)).aktif, false)

  // Laporan 30 hari terisi, waktu kejadian tersebar, opname dan riwayat lengkap.
  const days = await report(db, owner, 'report_sales_by_day', [daysAgo(29), TODAY_ISO])
  assert.equal(days.length, 30)
  assert.ok(days.filter((d) => d.nota > 0).length >= 20, 'hari berisi nota')
  assert.ok((await one(`select min(created_at) < now() - interval '100 days' as ok from stock_movements`)).ok, 'waktu kartu stok')
  const sessions = await one(`select count(*) filter (where status = 'dikonfirmasi')::int as ok, count(*) filter (where status = 'dibatalkan')::int as batal from stock_opnames`)
  assert.deepEqual([sessions.ok, sessions.batal], [1, 1])
  const actions = (await db.query(`select distinct aksi from change_logs`)).rows.map((r) => r.aksi).sort()
  for (const a of ['ubah_harga_jual', 'ubah_produk', 'nonaktifkan_produk', 'void_nota', 'void_penerimaan', 'penyesuaian_stok', 'konfirmasi_opname', 'batalkan_opname', 'nonaktifkan_mekanik']) {
    assert.ok(actions.includes(a), `riwayat ${a} ada (${actions.join(', ')})`)
  }
  assert.ok((await one(`select bool_and(user_id = '${owner}') as ok from change_logs`)).ok, 'riwayat atas nama pemilik')

  // Pengunci kartu stok dan riwayat menyala lagi setelah data contoh dimuat.
  await expectFailure(db.query('update stock_movements set qty = qty'), /hanya boleh ditambah/)
  await expectFailure(db.query('delete from change_logs'), /hanya boleh ditambah/)
  await expectFailure(asTableOwner(db, () => db.exec(SEED('dummy-data.sql'))), /sudah pernah dimuat/)

  await asTableOwner(db, () => db.exec(SEED('reset-data.sql')))
  const after = await one(`select (select count(*)::int from products) as products, (select count(*)::int from stock_movements) as movements,
    (select count(*)::int from change_logs) as logs, (select count(*)::int from profiles) as profiles, (select count(*)::int from store_settings) as settings`)
  assert.deepEqual(after, { products: 0, movements: 0, logs: 0, profiles: 3, settings: 1 })
  // Setelah dikosongkan, data contoh bisa dimuat lagi.
  await asTableOwner(db, () => db.exec(SEED('dummy-data.sql')))
})

// Jalankan --------------------------------------------------------------------------

await createSnapshot()
let passed = 0
const failures = []
for (const t of scenarios) {
  const db = await freshDb()
  try {
    await t.fn(db)
    passed++
    console.log(`  ok   ${t.name}`)
  } catch (e) {
    failures.push(t.name)
    console.log(`  GAGAL ${t.name}\n        ${e.message.split('\n').join('\n        ')}`)
  } finally {
    await db.close()
  }
}
console.log(`\n${passed} lulus, ${failures.length} gagal dari ${scenarios.length} skenario`)
process.exit(failures.length ? 1 : 0)
