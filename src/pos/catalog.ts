import { searchProducts, type LocalProduct } from '@/products/product'

// Katalog di layar Kasir (R53): tab kategori dan kotak produk dari salinan produk di laptop.

export type CatalogCategory = { id: string; name: string; count: number }

/** Kategori yang punya produk aktif, urut nama. */
export function catalogCategories(products: LocalProduct[]): CatalogCategory[] {
  const map = new Map<string, CatalogCategory>()
  for (const p of products) {
    if (!p.active) continue
    const c = map.get(p.categoryId) ?? { id: p.categoryId, name: p.category, count: 0 }
    c.count++
    map.set(p.categoryId, c)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'))
}

/** Produk aktif di kategori terpilih (null = semua), disaring kata kunci seperti kolom cari Kasir. */
export function catalogItems(products: LocalProduct[], categoryId: string | null, query: string): LocalProduct[] {
  return searchProducts(products, query, { categoryId })
}
