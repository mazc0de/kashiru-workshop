import Dexie, { type EntityTable } from 'dexie'

import type { HeldCart } from '@/pos/cart'
import type { OutboxSale } from '@/pos/outbox'
import { plateKey } from '@/pos/plate'
import type { LocalProduct } from '@/products/product'
import { upgradeToEnglish } from '@/lib/localMigration'
import { supabase } from '@/lib/supabase'

// Salinan lokal di IndexedDB (PRD 4.13): produk aktif beserta barcode, kode part, harga, dan stok,
// mekanik aktif, serta daftar nopol dengan nama pelanggan terakhirnya. Keranjang ditahan juga
// disimpan di sini supaya aman saat offline atau browser tertutup (PRD 4.6). Dipakai untuk scan dan pencarian, online maupun offline.
// Diperbarui setiap kali data disimpan di perangkat ini, sekali saat aplikasi dibuka, dan saat
// kembali online. Tanpa Realtime dan tanpa pemeriksaan berkala.
// Antrean nota (PRD 4.13) juga ada di sini. Stok di salinan = stok server − qty nota yang belum
// terkirim, termasuk yang gagal (R25).

export type LocalMechanic = { id: string; name: string }
/** kunci = nopol tanpa spasi, huruf besar (sama dengan sales.nopol_kunci). */
export type LocalPlate = { key: string; plate: string; customer: string | null }
export type MetadataEntry = { key: string; value: string }

class KashiruDb extends Dexie {
  products!: EntityTable<LocalProduct, 'id'>
  mechanics!: EntityTable<LocalMechanic, 'id'>
  plates!: EntityTable<LocalPlate, 'key'>
  heldCarts!: EntityTable<HeldCart, 'id'>
  saleOutbox!: EntityTable<OutboxSale, 'clientId'>
  metadata!: EntityTable<MetadataEntry, 'key'>

  constructor() {
    super('kashiru')
    // Skema sebelum R26 (nama Indonesia) dipertahankan apa adanya supaya data lama di perangkat bisa dibaca.
    this.version(1).stores({ produk: 'id, *barcodes, kategoriId', mekanik: 'id', meta: 'kunci' })
    this.version(2).stores({ nopol: 'kunci', keranjangDitahan: 'id, ditahanPada' })
    this.version(3).stores({ antreanNota: 'clientId, status, dibuatPada' })
    // R26: tabel dan properti berbahasa Inggris. Isi tabel lama disalin ke bentuk baru, lalu tabel lama dihapus.
    this.version(4)
      .stores({
        products: 'id, *barcodes, categoryId',
        mechanics: 'id',
        plates: 'key',
        heldCarts: 'id, heldAt',
        saleOutbox: 'clientId, status, createdAt',
        metadata: 'key',
      })
      .upgrade(upgradeToEnglish)
    this.version(5).stores({ produk: null, mekanik: null, nopol: null, keranjangDitahan: null, antreanNota: null, meta: null })
  }
}

export const db = new KashiruDb()

let chain: Promise<unknown> = Promise.resolve()

/**
 * Satu pekerjaan sinkron pada satu waktu, juga antar-tab: mengirim antrean nota dan memuat ulang salinan
 * tidak boleh saling menyela, supaya nota yang baru terkirim tidak terhitung dua kali atau terlewat.
 */
export function withLock<T>(job: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('kashiru.sync', job)
  const result = chain.then(job)
  chain = result.catch(() => undefined)
  return result
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Kurangi stok part dengan qty nota di antrean (menunggu maupun gagal, R25). */
export function deductOutboxStock(products: LocalProduct[], queue: Pick<OutboxSale, 'stockOut'>[]): LocalProduct[] {
  const signOut = new Map<string, number>()
  for (const n of queue) for (const s of n.stockOut) signOut.set(s.productId, (signOut.get(s.productId) ?? 0) + s.qty)
  if (!signOut.size) return products
  return products.map((p) => (p.stock !== null && signOut.has(p.id) ? { ...p, stock: round2(p.stock - signOut.get(p.id)!) } : p))
}

const PRODUCT_COLUMNS = `
  id, tipe, nama, merek, category_id, satuan, bisa_pecahan, harga_jual, stok_min, harga_beli_avg, aktif,
  categories ( nama ),
  stock_levels ( qty_on_hand ),
  product_barcodes ( barcode ),
  product_part_numbers ( kode_part )
`

/** Bentuk baris dari Supabase untuk KOLOM_PRODUK. */
export type ServerProductRow = {
  id: string
  tipe: string
  nama: string
  merek: string | null
  category_id: string
  satuan: string | null
  bisa_pecahan: boolean
  harga_jual: number
  stok_min: number
  harga_beli_avg: number
  aktif: boolean
  categories: { nama: string } | null
  stock_levels: { qty_on_hand: number } | null
  product_barcodes: { barcode: string }[]
  product_part_numbers: { kode_part: string }[]
}

export function toLocalProduct(b: ServerProductRow): LocalProduct {
  return {
    id: b.id,
    type: b.tipe === 'jasa' ? 'jasa' : 'part',
    name: b.nama,
    brand: b.merek,
    categoryId: b.category_id,
    category: b.categories?.nama ?? '',
    unit: b.satuan,
    allowsFraction: b.bisa_pecahan,
    sellingPrice: Number(b.harga_jual),
    stock: b.tipe === 'jasa' ? null : Number(b.stock_levels?.qty_on_hand ?? 0),
    minStock: Number(b.stok_min),
    avgCost: Number(b.harga_beli_avg),
    barcodes: b.product_barcodes.map((x) => x.barcode).sort(),
    partNumbers: b.product_part_numbers.map((x) => x.kode_part).sort(),
    active: b.aktif,
  }
}

const PAGE_SIZE = 1000 // batas baris per permintaan di Data API Supabase

/** Produk dari server, dengan relasinya. Diambil per 1.000 baris. */
export async function fetchServerProducts(options: { includeInactive?: boolean; id?: string } = {}): Promise<LocalProduct[]> {
  const result: LocalProduct[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase().from('products').select(PRODUCT_COLUMNS).order('id').range(from, from + PAGE_SIZE - 1)
    if (!options.includeInactive) q = q.eq('aktif', true)
    if (options.id) q = q.eq('id', options.id)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    result.push(...data.map(toLocalProduct))
    if (data.length < PAGE_SIZE) return result
  }
}

async function fetchServerPlates(): Promise<LocalPlate[]> {
  const result: LocalPlate[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase()
      .from('nopol_last_customer')
      .select('nopol_kunci, nopol, nama_pelanggan')
      .order('nopol_kunci')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    for (const b of data) {
      if (b.nopol_kunci && b.nopol) result.push({ key: b.nopol_kunci, plate: b.nopol, customer: b.nama_pelanggan })
    }
    if (data.length < PAGE_SIZE) return result
  }
}

/** Mekanik aktif urut nama untuk isian nota. Tabel mekanik hanya berindeks id, jadi diurutkan di memori. */
export async function listMechanics(): Promise<LocalMechanic[]> {
  return (await db.mechanics.toArray()).sort((x, y) => x.name.localeCompare(y.name, 'id'))
}

/** Ganti seluruh salinan dengan data server. Keranjang ditahan dan antrean nota tidak disentuh. */
export function reloadLocalCopy(): Promise<void> {
  return withLock(async () => {
    const [products, plates, mechanics] = await Promise.all([
      fetchServerProducts(),
      fetchServerPlates(),
      supabase()
        .from('mechanics')
        .select('id, nama')
        .eq('aktif', true)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message)
          return data
        }),
    ])
    await db.transaction('rw', [db.products, db.mechanics, db.plates, db.metadata, db.saleOutbox], async () => {
      const queue = await db.saleOutbox.toArray()
      await db.products.clear()
      await db.products.bulkPut(deductOutboxStock(products, queue))
      await db.mechanics.clear()
      await db.mechanics.bulkPut(mechanics.map((m) => ({ id: m.id, name: m.nama })))
      await db.plates.clear()
      await db.plates.bulkPut(plates)
      // Nopol dari nota yang belum terkirim tetap bisa dipakai untuk isian otomatis.
      for (const n of queue) {
        if (n.receipt.plate) await db.plates.put({ key: plateKey(n.receipt.plate), plate: n.receipt.plate, customer: n.receipt.customer })
      }
      await db.metadata.put({ key: 'loaded_at', value: new Date().toISOString() })
    })
  })
}

/** Perbarui satu produk setelah disimpan di perangkat ini. Produk nonaktif dikeluarkan dari salinan. */
export function refreshLocalProduct(id: string): Promise<void> {
  return withLock(async () => {
    const [products] = await fetchServerProducts({ id, includeInactive: true })
    await db.transaction('rw', [db.products, db.saleOutbox], async () => {
      if (!products?.active) return db.products.delete(id)
      const [result] = deductOutboxStock([products], await db.saleOutbox.toArray())
      await db.products.put(result)
    })
  })
}
