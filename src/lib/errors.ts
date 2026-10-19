// Pesan salah dari Supabase diterjemahkan untuk kasir. Pesan dari fungsi RPC Kashiru
// (RAISE EXCEPTION) sudah berbahasa Indonesia dan diteruskan apa adanya.

const CONSTRAINT_MESSAGES: Record<string, string> = {
  categories_nama_unik: 'Kategori dengan nama ini sudah ada.',
  mechanics_nama_unik: 'Mekanik dengan nama ini sudah ada.',
  suppliers_nama_unik: 'Supplier dengan nama ini sudah ada.',
  products_pembeda: 'Produk dengan nama dan merek ini sudah ada.',
  product_barcodes_barcode_key: 'Barcode ini sudah dipakai produk lain.',
  product_part_numbers_product_id_kode_part_key: 'Kode part ini sudah ada di produk ini.',
  harga_jual_valid: 'Harga jual part wajib lebih dari Rp 0.',
  stok_min_bulat: 'Stok minimum harus bilangan bulat untuk part yang tidak bisa pecahan.',
}

export type SupabaseError = { code?: string; message: string }

export function describeError(errorMessage: SupabaseError): string {
  if (/failed to fetch|networkerror|load failed/i.test(errorMessage.message)) {
    return 'Tidak bisa terhubung ke server. Periksa internet.'
  }
  const constraint = /constraint "([^"]+)"/.exec(errorMessage.message)?.[1]
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint]
  if (errorMessage.code === '42501') return 'Akun ini tidak punya akses. Coba masuk lagi.'
  return errorMessage.message
}

/** Lempar Error berpesan Indonesia kalau Supabase mengembalikan galat. */
export function unwrap<T>(result: { data: T; error: SupabaseError | null }): NonNullable<T> {
  if (result.error) throw new Error(describeError(result.error))
  // Tanpa galat, data hanya null untuk perintah tanpa select (insert/update), yang hasilnya tidak dipakai.
  return result.data as NonNullable<T>
}
