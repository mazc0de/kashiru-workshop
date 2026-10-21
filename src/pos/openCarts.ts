import { EMPTY_CART, normalizeCart, type Cart, type HeldCart } from '@/pos/cart'

// Isian di layar Kasir dan keranjang yang ditunda (R63). Fungsi murni: setiap aksi mengembalikan keadaan baru.
//
// Aturannya:
// - Layar Kasir berisi satu isian (draft). Tambah ke keranjang memindahkan isian itu ke daftar keranjang
//   dengan Keterangan nota yang wajib dan unik sebagai penanda, lalu layar bersih lagi.
// - Membuka keranjang memindahkan isinya kembali ke layar dan mengeluarkannya dari daftar. Layar yang masih
//   berisi barang harus ditambahkan ke keranjang dulu, jadi isian layar tidak pernah tertimpa.
// - Setelah bayar atau Kosongkan, layar bersih. Keranjang yang sedang dibuka di layar ikut selesai.
// - Semuanya hanya di laptop (R62).

/** Keranjang yang ditunda. Keterangannya (data.description) selalu terisi dan unik. */
export type SavedCart = Cart & { id: string; createdAt: string }

/** Isian di layar. `fromCart` = isinya berasal dari keranjang yang dibuka lagi. */
export type Draft = Cart & { createdAt: string; fromCart: boolean }

export type CartsState = { draft: Draft; saved: SavedCart[] }

export function blankDraft(now: Date): Draft {
  return { ...EMPTY_CART, createdAt: now.toISOString(), fromCart: false }
}

export function initialCarts(now: Date): CartsState {
  return { draft: blankDraft(now), saved: [] }
}

/** Keterangan dirapikan: spasi di awal, di akhir, dan yang berulang dibuang. */
export function tidyDescription(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

const descriptionKey = (text: string) => tidyDescription(text).toLowerCase()

/** Usulan keterangan di jendela Tambah ke keranjang: keterangan yang sudah ada, lalu nopol, lalu nama pelanggan. */
export function suggestedDescription(k: Cart): string {
  return tidyDescription(k.data.description) || tidyDescription(k.data.plate) || tidyDescription(k.data.customer)
}

/** Pesan salah untuk keterangan keranjang, atau null kalau boleh dipakai. */
export function descriptionError(s: CartsState, text: string): string | null {
  const tidy = tidyDescription(text)
  if (!tidy) return 'Isi keterangan sebagai penanda keranjang.'
  const same = s.saved.find((k) => descriptionKey(k.data.description) === descriptionKey(tidy))
  if (same) return `Sudah ada keranjang ${same.data.description}. Pakai keterangan lain, mis. tambahkan nopol atau nama pemilik.`
  return null
}

/** Daftar keranjang di modal dan angka di ikon, urut waktu isiannya mulai dibuat. */
export function listedCarts(s: CartsState): SavedCart[] {
  return [...s.saved].sort((x, y) => x.createdAt.localeCompare(y.createdAt))
}

export function updateDraft(s: CartsState, f: (k: Cart) => Cart): CartsState {
  return { ...s, draft: { ...s.draft, ...f(s.draft), createdAt: s.draft.createdAt, fromCart: s.draft.fromCart } }
}

/**
 * Tambah ke keranjang: isian layar menjadi keranjang dengan keterangan itu, lalu layar bersih. Isian tanpa
 * barang atau keterangan yang tidak boleh dipakai tidak mengubah apa pun.
 */
export function saveDraft(s: CartsState, description: string, id: string, now: Date): CartsState {
  if (s.draft.lines.length === 0 || descriptionError(s, description) !== null) return s
  const { createdAt, fromCart: _, ...cart } = s.draft
  const saved: SavedCart = { ...cart, data: { ...cart.data, description: tidyDescription(description) }, id, createdAt }
  return { draft: blankDraft(now), saved: [...s.saved, saved] }
}

/**
 * Buka keranjang: isinya pindah ke layar dan keluar dari daftar. Harga diperbarui lewat `refresh` (PRD 4.6).
 * Hanya bisa saat layar tidak berisi barang.
 */
export function openCart(s: CartsState, id: string, refresh: (k: Cart) => Cart): CartsState {
  const target = s.saved.find((k) => k.id === id)
  if (!target || s.draft.lines.length > 0) return s
  const { id: _, createdAt, ...cart } = target
  return { draft: { ...cart, ...refresh(cart), createdAt, fromCart: true }, saved: s.saved.filter((k) => k.id !== id) }
}

/** Setelah bayar atau Kosongkan: layar bersih. */
export function clearDraft(s: CartsState, now: Date): CartsState {
  return { ...s, draft: blankDraft(now) }
}

/** Qty satu produk di keranjang yang ditunda, untuk peringatan stok. */
export function qtyInSavedCarts(s: CartsState, productId: string): { label: string; qty: number }[] {
  const result: { label: string; qty: number }[] = []
  for (const k of listedCarts(s)) {
    const qty = k.lines.filter((b) => b.productId === productId).reduce((t, b) => t + b.qty, 0)
    if (qty > 0) result.push({ label: k.data.description, qty })
  }
  return result
}

/** Qty tiap produk di semua keranjang yang ditunda, untuk Katalog. */
export function savedCartsQty(s: CartsState): Map<string, number> {
  const m = new Map<string, number>()
  for (const k of s.saved) {
    for (const b of k.lines) if (b.productId) m.set(b.productId, Math.round(((m.get(b.productId) ?? 0) + b.qty) * 100) / 100)
  }
  return m
}

/**
 * Keranjang ditahan dari versi sebelumnya masuk ke daftar keranjang. Keterangannya diambil dari keterangan,
 * nopol, nama pelanggan, atau label lamanya (mis. "Ditahan 14:32"), dan diberi nomor kalau namanya sudah dipakai.
 */
export function addHeldCarts(s: CartsState, held: HeldCart[]): CartsState {
  const known = new Set(s.saved.map((k) => k.id))
  let result = s
  for (const h of held) {
    if (known.has(h.id) || h.cart.lines.length === 0) continue
    const k = normalizeCart(h.cart)
    const base = suggestedDescription(k) || tidyDescription(h.label) || 'Keranjang lama'
    let description = base
    for (let n = 2; descriptionError(result, description) !== null; n++) description = `${base} (${n})`
    result = { ...result, saved: [...result.saved, { ...k, data: { ...k.data, description }, id: h.id, createdAt: h.heldAt }] }
  }
  return result
}
