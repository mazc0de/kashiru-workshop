import { db, withLock } from '@/lib/localCopy'
import { useCart } from '@/pos/cartStore'
import { initialCarts } from '@/pos/openCarts'

// Saat logout, data di laptop ikut dihapus: isian layar Kasir, semua keranjang, salinan produk/mekanik/nopol,
// struk terakhir, profil, pengaturan, dan logo. Yang dipertahankan hanya identitas laptop,
// bukan data akun:
// - antrean nota yang belum terkirim (tombol Keluar menunggu antrean kosong, lihat
//   hasUnsentSales; yang tersisa hanya dari "Masuk dengan akun lain" dan dikirim setelah login lagi),
// - device_id, supaya nota tetap tercatat dari laptop yang sama,
// - nomor urut nota hari ini, supaya nota pertama setelah login saat offline tidak memakai nomor yang sudah ada.

const LOCAL_KEY_PREFIX = 'kashiru.'
const KEPT_LOCAL_KEYS = new Set(['kashiru.saleSequence'])
const KEPT_METADATA_KEYS = ['device_id']

/** Ada nota yang belum atau gagal terkirim di laptop ini. */
export async function hasUnsentSales(): Promise<boolean> {
  return (await db.saleOutbox.count()) > 0
}

export async function clearLocalData(): Promise<void> {
  useCart.setState(initialCarts(new Date()))

  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LOCAL_KEY_PREFIX) && !KEPT_LOCAL_KEYS.has(k))
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // Penyimpanan diblokir: tidak ada yang bisa dihapus.
  }

  await withLock(() =>
    db.transaction('rw', [db.products, db.mechanics, db.plates, db.heldCarts, db.metadata], async () => {
      await Promise.all([db.products.clear(), db.mechanics.clear(), db.plates.clear(), db.heldCarts.clear()])
      await db.metadata.where('key').noneOf(KEPT_METADATA_KEYS).delete()
    }),
  ).catch(() => undefined)
}
