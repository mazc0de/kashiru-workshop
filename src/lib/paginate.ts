// Pagination di frontend untuk daftar yang sudah dimuat seluruhnya (mis. layar Produk), tanpa kueri baru.

export type Paged<T> = { rows: T[]; page: number; pageCount: number; from: number; to: number; total: number }

/** Potong daftar untuk halaman `page` (mulai 1). Halaman di luar batas dikembalikan ke batasnya. */
export function paginate<T>(items: T[], page: number, size: number): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * size
  const rows = items.slice(start, start + size)
  return { rows, page: current, pageCount, from: rows.length ? start + 1 : 0, to: start + rows.length, total: items.length }
}
