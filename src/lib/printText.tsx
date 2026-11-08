import type { PaperWidth } from '@/lib/print'
import { linesToRows, printImage, renderMonochrome } from '@/lib/printBitmap'

/** Cetak daftar teks (saran belanja, lembar hitung, ringkasan harian) ke printer struk, selalu Courier New. */
export async function printText(lines: string[], width: PaperWidth): Promise<void> {
  await printImage(await renderMonochrome(linesToRows(lines), width), width)
}
