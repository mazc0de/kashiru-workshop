import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, test } from 'vitest'

import { db } from '@/lib/localCopy'
import { migrateLocalStorage } from '@/lib/localMigration'

const STRUK_LAMA = {
  bengkel: { nama: 'Bengkel Maju Jaya', alamat: null, telepon: '0812', footer: null },
  nomor: 'KSR-20261019-0001',
  waktu: '2026-10-19T03:00:00.000Z',
  kasir: 'Rina',
  nopol: 'B 1234 XYZ',
  pelanggan: 'Pak Budi',
  mekanik: null,
  catatanServis: null,
  baris: [{ tipe: 'part', nama: 'Oli MPX 1L', merek: 'AHM', qty: 1, harga: 52000, jumlah: 52000, diskon: 0 }],
  subtotal: 52000,
  diskonNota: 0,
  total: 52000,
  metode: 'tunai',
  uang: 60000,
  kembalian: 8000,
  salinan: false,
  void: false,
}

const KERANJANG_LAMA = {
  baris: [
    {
      kunci: 'b1', produkId: 'oli', tipe: 'part', nama: 'Oli MPX 1L', merek: 'AHM', satuan: 'btl', bisaPecahan: false, qty: 2,
      harga: 52000, hargaManual: false, diskon: { jenis: 'nominal', input: 2000 }, hargaLama: null, nonaktif: false,
    },
  ],
  terpilih: 0,
  data: { nopol: 'B 1234 XYZ', pelanggan: 'Pak Budi', mekanikId: null, catatanServis: '' },
  diskonNota: { jenis: 'persen', input: 5 },
}

test('data IndexedDB dari versi sebelum R26 dipindah ke tabel dan bentuk baru, tabel lama dihapus', async () => {
  const lama = new Dexie('kashiru')
  lama.version(1).stores({ produk: 'id, *barcodes, kategoriId', mekanik: 'id', meta: 'kunci' })
  lama.version(2).stores({ nopol: 'kunci', keranjangDitahan: 'id, ditahanPada' })
  lama.version(3).stores({ antreanNota: 'clientId, status, dibuatPada' })
  await lama.open()
  await lama.table('produk').put({
    id: 'oli', tipe: 'part', nama: 'Oli MPX 1L', merek: 'AHM', kategoriId: 'k', kategori: 'Oli', satuan: 'btl', bisaPecahan: false,
    hargaJual: 52000, stok: 4, stokMin: 2, hargaBeliAvg: 40000, barcodes: ['899000001'], kodePart: ['08232'], aktif: true,
  })
  await lama.table('mekanik').put({ id: 'm1', nama: 'Andi' })
  await lama.table('nopol').put({ kunci: 'B1234XYZ', nopol: 'B 1234 XYZ', pelanggan: 'Pak Budi' })
  await lama.table('keranjangDitahan').put({ id: 'h1', label: 'B 1234 XYZ', ditahanPada: '2026-10-19T02:00:00.000Z', keranjang: KERANJANG_LAMA })
  await lama.table('antreanNota').put({
    clientId: 'c1', dibuatPada: '2026-10-19T03:00:00.000Z', nomor: 'KSR-20261019-0001', total: 52000, status: 'gagal',
    alasan: 'Mekanik tidak dikenal', dicobaPada: '2026-10-19T03:05:00.000Z', args: { p_client_id: 'c1' }, struk: STRUK_LAMA,
    stokKeluar: [{ productId: 'oli', qty: 1 }],
  })
  await lama.table('meta').bulkPut([
    { kunci: 'device_id', nilai: 'dev-1' },
    { kunci: 'nota_terakhir', nilai: JSON.stringify(STRUK_LAMA) },
  ])
  lama.close()

  const [product] = await db.products.toArray()
  expect(product).toMatchObject({ id: 'oli', type: 'part', name: 'Oli MPX 1L', brand: 'AHM', sellingPrice: 52000, stock: 4, partNumbers: ['08232'], active: true })
  expect(await db.products.where('categoryId').equals('k').count()).toBe(1)
  expect(await db.mechanics.get('m1')).toEqual({ id: 'm1', name: 'Andi' })
  expect(await db.plates.get('B1234XYZ')).toEqual({ key: 'B1234XYZ', plate: 'B 1234 XYZ', customer: 'Pak Budi' })

  const held = await db.heldCarts.get('h1')
  expect(held?.heldAt).toBe('2026-10-19T02:00:00.000Z')
  expect(held?.cart.lines[0]).toMatchObject({ key: 'b1', productId: 'oli', price: 52000, discount: { kind: 'nominal', input: 2000 } })
  expect(held?.cart.saleDiscount).toEqual({ kind: 'persen', input: 5 })

  // Nota yang belum terkirim tidak boleh hilang: tetap gagal, alasan dan struknya terbawa.
  const [sale] = await db.saleOutbox.where('status').equals('failed').toArray()
  expect(sale).toMatchObject({ clientId: 'c1', number: 'KSR-20261019-0001', reason: 'Mekanik tidak dikenal', stockOut: [{ productId: 'oli', qty: 1 }] })
  expect(sale.receipt).toMatchObject({ number: 'KSR-20261019-0001', plate: 'B 1234 XYZ', cash: 60000, change: 8000, isCopy: false })
  expect(sale.receipt.lines[0]).toEqual({ type: 'part', name: 'Oli MPX 1L', brand: 'AHM', qty: 1, price: 52000, amount: 52000, discount: 0 })

  expect((await db.metadata.get('device_id'))?.value).toBe('dev-1')
  expect(JSON.parse((await db.metadata.get('last_receipt'))!.value)).toMatchObject({ number: 'KSR-20261019-0001', workshop: { name: 'Bengkel Maju Jaya' } })

  expect(db.tables.map((t) => t.name).sort()).toEqual(['heldCarts', 'mechanics', 'metadata', 'plates', 'products', 'saleOutbox'])
})

test('isi localStorage lama pindah ke kunci baru; keranjang aktif dan nomor urut diubah bentuknya', () => {
  const isi = new Map<string, string>([
    ['kashiru.profil', '{"id":"u1","email":"rina@bengkel.test","nama":"Rina","aktif":true}'],
    ['kashiru.urutNota', '{"tanggal":"2026-10-19","terakhir":7}'],
    ['kashiru.keranjang', JSON.stringify({ state: KERANJANG_LAMA, version: 0 })],
    ['kashiru.settings', '{"id":1}'],
    ['kashiru.pengaturan', '{"id":1,"lama":true}'],
  ])
  const storage = { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) }

  migrateLocalStorage(storage)

  expect(isi.get('kashiru.profile')).toBe('{"id":"u1","email":"rina@bengkel.test","nama":"Rina","aktif":true}')
  expect(JSON.parse(isi.get('kashiru.saleSequence')!)).toEqual({ date: '2026-10-19', last: 7 })
  const cart = JSON.parse(isi.get('kashiru.cart')!)
  expect(cart.version).toBe(0)
  expect(cart.state.lines[0]).toMatchObject({ key: 'b1', qty: 2, discount: { kind: 'nominal', input: 2000 } })
  expect(cart.state.data).toEqual({ plate: 'B 1234 XYZ', customer: 'Pak Budi', description: '', mechanicId: null, serviceNote: '' })
  // Kunci baru yang sudah ada tidak ditimpa.
  expect(isi.get('kashiru.settings')).toBe('{"id":1}')
  expect([...isi.keys()].filter((k) => ['kashiru.profil', 'kashiru.urutNota', 'kashiru.keranjang', 'kashiru.pengaturan'].includes(k))).toEqual([])
})
