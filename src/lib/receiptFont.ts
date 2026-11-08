import { readStored, writeStored } from '@/lib/localStore'

// Huruf struk dipilih per laptop (Pengaturan, Cetak) dan disimpan di browser, bukan di server, sehingga
// tetap ada walaupun logout (lihat clearLocalData). Lembar teks lain (lembar hitung, saran belanja,
// ringkasan harian) tetap memakai Courier New karena berupa tabel yang kolomnya harus lurus.

export type ReceiptFontId = 'courier' | 'times'

export type ReceiptFont = {
  id: ReceiptFontId
  label: string
  /** Daftar font CSS, tanpa ukuran. */
  family: string
  /** Huruf sama lebar: satu karakter tepat satu kolom struk. */
  monospace: boolean
}

export const RECEIPT_FONTS: readonly ReceiptFont[] = [
  { id: 'courier', label: 'Courier New', family: '"Courier New", Courier, monospace', monospace: true },
  { id: 'times', label: 'Times New Roman', family: '"Times New Roman", Times, serif', monospace: false },
]

export const DEFAULT_RECEIPT_FONT = RECEIPT_FONTS[0]

export const RECEIPT_FONT_KEY = 'kashiru.receiptFont'

export function receiptFontById(id: unknown): ReceiptFont {
  return RECEIPT_FONTS.find((f) => f.id === id) ?? DEFAULT_RECEIPT_FONT
}

/** Huruf struk yang dipilih di laptop ini; Courier New kalau belum pernah dipilih. */
export function readReceiptFont(): ReceiptFont {
  return receiptFontById(readStored<string>(RECEIPT_FONT_KEY))
}

export function saveReceiptFont(id: ReceiptFontId): void {
  writeStored(RECEIPT_FONT_KEY, id)
}
