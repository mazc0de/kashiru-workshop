import type { Transaction } from 'dexie'

import type { Discount } from '@/pos/calculate'
import type { Cart, CartLine, HeldCart } from '@/pos/cart'
import type { OutboxSale } from '@/pos/outbox'
import type { ReceiptData, ReceiptLine } from '@/pos/receipt'
import type { LocalProduct } from '@/products/product'
import type { LocalMechanic, LocalPlate, MetadataEntry } from '@/lib/localCopy'

// Sejak R26 nama di kode berbahasa Inggris, termasuk nama tabel IndexedDB dan properti data yang disimpan
// di perangkat. Data lama (keranjang ditahan, antrean nota, nota terakhir, keranjang aktif, salinan
// profil dan pengaturan) disalin ke bentuk baru supaya tidak hilang, terutama nota yang belum terkirim.

// Data lama dibaca apa adanya dari penyimpanan, jadi bentuknya tidak dijamin.
type Old = Record<string, any>

const discount = (d: Old | null | undefined): Discount => (d ? { kind: d.jenis, input: d.input } : null)

export function productFromOld(o: Old): LocalProduct {
  return {
    id: o.id,
    type: o.tipe,
    name: o.nama,
    brand: o.merek,
    categoryId: o.kategoriId,
    category: o.kategori,
    unit: o.satuan,
    allowsFraction: o.bisaPecahan,
    sellingPrice: o.hargaJual,
    stock: o.stok,
    minStock: o.stokMin,
    avgCost: o.hargaBeliAvg,
    barcodes: o.barcodes ?? [],
    partNumbers: o.kodePart ?? [],
    active: o.aktif,
  }
}

export const mechanicFromOld = (o: Old): LocalMechanic => ({ id: o.id, name: o.nama })

export const plateFromOld = (o: Old): LocalPlate => ({ key: o.kunci, plate: o.nopol, customer: o.pelanggan ?? null })

function cartLineFromOld(o: Old): CartLine {
  return {
    key: o.kunci,
    productId: o.produkId,
    type: o.tipe,
    name: o.nama,
    brand: o.merek,
    unit: o.satuan,
    allowsFraction: o.bisaPecahan,
    qty: o.qty,
    price: o.harga,
    manualPrice: o.hargaManual,
    discount: discount(o.diskon),
    oldPrice: o.hargaLama ?? null,
    inactive: o.nonaktif ?? false,
  }
}

export function cartFromOld(o: Old): Cart {
  return {
    lines: (o.baris ?? []).map(cartLineFromOld),
    selected: o.terpilih ?? 0,
    data: {
      plate: o.data?.nopol ?? '',
      customer: o.data?.pelanggan ?? '',
      mechanicId: o.data?.mekanikId ?? null,
      serviceNote: o.data?.catatanServis ?? '',
    },
    saleDiscount: discount(o.diskonNota),
  }
}

export const heldCartFromOld = (o: Old): HeldCart => ({ id: o.id, label: o.label, heldAt: o.ditahanPada, cart: cartFromOld(o.keranjang ?? {}) })

function receiptLineFromOld(o: Old): ReceiptLine {
  return { type: o.tipe, name: o.nama, brand: o.merek, qty: o.qty, price: o.harga, amount: o.jumlah, discount: o.diskon }
}

export function receiptFromOld(o: Old): ReceiptData {
  return {
    workshop: { name: o.bengkel?.nama ?? '', address: o.bengkel?.alamat ?? null, phone: o.bengkel?.telepon ?? null, footer: o.bengkel?.footer ?? null },
    number: o.nomor,
    time: o.waktu,
    cashier: o.kasir,
    plate: o.nopol ?? null,
    customer: o.pelanggan ?? null,
    mechanic: o.mekanik ?? null,
    serviceNote: o.catatanServis ?? null,
    lines: (o.baris ?? []).map(receiptLineFromOld),
    subtotal: o.subtotal,
    saleDiscount: o.diskonNota,
    total: o.total,
    method: o.metode,
    cash: o.uang,
    change: o.kembalian,
    isCopy: o.salinan ?? false,
    void: o.void ?? false,
  }
}

export function outboxFromOld(o: Old): OutboxSale {
  return {
    clientId: o.clientId,
    createdAt: o.dibuatPada,
    number: o.nomor,
    total: o.total,
    status: o.status === 'gagal' ? 'failed' : 'pending',
    reason: o.alasan ?? null,
    attemptedAt: o.dicobaPada ?? null,
    args: o.args,
    receipt: receiptFromOld(o.struk ?? {}),
    stockOut: o.stokKeluar ?? [],
  }
}

const METADATA_KEYS: Record<string, string> = { nota_terakhir: 'last_receipt', dimuat_pada: 'loaded_at' }

export function metadataFromOld(o: Old): MetadataEntry {
  const key = METADATA_KEYS[o.kunci] ?? o.kunci
  const value = o.kunci === 'nota_terakhir' ? JSON.stringify(receiptFromOld(JSON.parse(o.nilai))) : o.nilai
  return { key, value }
}

/** Upgrade IndexedDB versi 4: salin isi tabel lama (nama Indonesia) ke tabel baru dalam bentuk baru. */
export async function upgradeToEnglish(tx: Transaction): Promise<void> {
  const copy = async (from: string, to: string, convert: (o: Old) => unknown) => {
    const rows = await tx.table(from).toArray()
    if (rows.length) await tx.table(to).bulkPut(rows.map(convert))
  }
  await copy('produk', 'products', productFromOld)
  await copy('mekanik', 'mechanics', mechanicFromOld)
  await copy('nopol', 'plates', plateFromOld)
  await copy('keranjangDitahan', 'heldCarts', heldCartFromOld)
  await copy('antreanNota', 'saleOutbox', outboxFromOld)
  await copy('meta', 'metadata', metadataFromOld)
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Kunci localStorage lama -> baru, dengan pengubah isi kalau bentuknya berubah. */
const STORAGE_KEYS: [string, string, ((raw: string) => string)?][] = [
  ['kashiru.aktivitasTerakhir', 'kashiru.lastActivity'],
  ['kashiru.pengaturan', 'kashiru.settings'],
  ['kashiru.perangkatKasir', 'kashiru.cashierDevice'],
  ['kashiru.profil', 'kashiru.profile'],
  ['kashiru.urutNota', 'kashiru.saleSequence', (raw) => {
    const o = JSON.parse(raw) as Old
    return JSON.stringify({ date: o.tanggal, last: o.terakhir })
  }],
  ['kashiru.keranjang', 'kashiru.cart', (raw) => {
    const o = JSON.parse(raw) as Old
    return JSON.stringify({ ...o, state: cartFromOld(o.state ?? {}) })
  }],
]

/** Pindahkan isi localStorage ke kunci baru. Dijalankan sebelum modul lain membaca penyimpanan. */
export function migrateLocalStorage(storage: KeyValueStorage = localStorage): void {
  for (const [from, to, convert] of STORAGE_KEYS) {
    try {
      const raw = storage.getItem(from)
      if (raw === null) continue
      if (storage.getItem(to) === null) storage.setItem(to, convert ? convert(raw) : raw)
      storage.removeItem(from)
    } catch {
      // Isi rusak atau penyimpanan diblokir: biarkan, aplikasi tetap jalan dengan nilai bawaan.
    }
  }
}
