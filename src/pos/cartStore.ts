import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { db } from '@/lib/localCopy'
import { normalizeCart, type Cart } from '@/pos/cart'
import {
  addHeldCarts,
  clearDraft,
  initialCarts,
  openCart,
  saveDraft,
  updateDraft,
  type CartsState,
  type Draft,
} from '@/pos/openCarts'

// Isian layar Kasir dan semua keranjang disimpan di laptop (R62), jadi tidak hilang kalau browser di-refresh
// atau ditutup, dan tidak terikat akun, sehingga tetap ada saat ganti akun (PRD 4.1, 4.6).

type CartStore = CartsState & {
  /** Ubah isian layar. */
  update: (f: (k: Cart) => Cart) => void
  /** Tambah ke keranjang dengan keterangan yang sudah diperiksa. */
  save: (description: string) => void
  open: (id: string, refresh: (k: Cart) => Cart) => void
  /** Setelah bayar atau Kosongkan. */
  clear: () => void
}

const pickState = (s: CartsState): CartsState => ({ draft: s.draft, saved: s.saved })

export const useCart = create<CartStore>()(
  persist<CartStore, [], [], CartsState>(
    (set) => ({
      ...initialCarts(new Date()),
      update: (f) => set((s) => updateDraft(s, f)),
      save: (description) => set((s) => saveDraft(s, description, crypto.randomUUID(), new Date())),
      open: (id, refresh) => set((s) => openCart(s, id, refresh)),
      clear: () => set((s) => clearDraft(s, new Date())),
    }),
    {
      name: 'kashiru.cart',
      version: 2,
      partialize: pickState,
      // Versi 0 menyimpan satu keranjang aktif (sekarang isian layar); keranjang lain ditahan di IndexedDB
      // dan dipindah oleh importHeldCarts.
      migrate: (old, version) => {
        if (version === 0) return { draft: { ...normalizeCart(old as Cart), createdAt: new Date().toISOString(), fromCart: false }, saved: [] }
        return old as CartsState
      },
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<CartsState>
        if (!s.draft) return current
        return {
          ...current,
          draft: { ...s.draft, ...normalizeCart(s.draft) },
          saved: (s.saved ?? []).map((k) => ({ ...k, ...normalizeCart(k) })),
        }
      },
    },
  ),
)

export function currentDraft(): Draft {
  return useCart.getState().draft
}

/** Keranjang ditahan dari versi sebelumnya dipindah ke daftar keranjang, lalu dihapus dari IndexedDB. */
export async function importHeldCarts(): Promise<void> {
  const held = await db.heldCarts.toArray()
  if (!held.length) return
  useCart.setState((s) => addHeldCarts(s, held))
  await db.heldCarts.bulkDelete(held.map((h) => h.id))
}
