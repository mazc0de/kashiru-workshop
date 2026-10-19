import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { db } from '@/lib/localCopy'
import { EMPTY_CART, cartLabel, type Cart, type HeldCart } from '@/pos/cart'

// Keranjang aktif disimpan di perangkat, jadi tidak hilang kalau browser di-refresh. Keranjang ditahan
// disimpan di IndexedDB dan tidak terikat akun, sehingga tetap ada saat ganti akun (PRD 4.1, 4.6).

type CartStore = Cart & {
  update: (f: (k: Cart) => Cart) => void
  replaceCart: (k: Cart) => void
  clear: () => void
}

const pickCart = (s: Cart): Cart => ({ lines: s.lines, selected: s.selected, data: s.data, saleDiscount: s.saleDiscount })

export const useCart = create<CartStore>()(
  persist<CartStore, [], [], Cart>(
    (set) => ({
      ...EMPTY_CART,
      update: (f) => set((s) => f(pickCart(s))),
      replaceCart: (k) => set(k),
      clear: () => set(EMPTY_CART),
    }),
    { name: 'kashiru.cart', partialize: pickCart },
  ),
)

export function currentCart(): Cart {
  return pickCart(useCart.getState())
}

/** F6: tahan keranjang yang sedang diinput (PRD 4.6). Belum punya nomor dan tidak mengurangi stok. */
export async function holdCart(): Promise<string> {
  const k = currentCart()
  const now = new Date()
  const label = cartLabel(k, now)
  const held: HeldCart = { id: crypto.randomUUID(), label, heldAt: now.toISOString(), cart: k }
  await db.heldCarts.add(held)
  useCart.getState().clear()
  return label
}

/** Buka keranjang ditahan: dipindah ke keranjang aktif dan dihapus dari daftar ditahan. */
export async function openHeldCart(id: string): Promise<HeldCart | null> {
  const held = await db.heldCarts.get(id)
  if (!held) return null
  await db.heldCarts.delete(id)
  return held
}
