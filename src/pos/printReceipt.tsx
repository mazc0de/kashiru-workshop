import type { PaperWidth } from '@/lib/print'
import { createMeasure, printImage, renderMonochrome } from '@/lib/printBitmap'
import { readReceiptFont, type ReceiptFont } from '@/lib/receiptFont'
import { CHARS_PER_LINE, buildReceiptRows, type ReceiptData } from '@/pos/receipt'

/** Gambar struk dengan huruf yang dipilih di laptop ini (Pengaturan, Cetak). */
export function renderReceipt(data: ReceiptData, width: PaperWidth, logo: string | null, font: ReceiptFont = readReceiptFont()): Promise<string> {
  const rows = buildReceiptRows(data, CHARS_PER_LINE[width], createMeasure(font))
  return renderMonochrome(rows, width, font, logo)
}

/** Cetak struk sejumlah salinan di pengaturan. Setiap salinan satu pekerjaan cetak, supaya kertas terpotong. */
export async function printReceipt(data: ReceiptData, width: PaperWidth, logo: string | null, copies: number): Promise<void> {
  const src = await renderReceipt(data, width, logo)
  for (let i = 0; i < Math.max(1, copies); i++) {
    await printImage(src, width)
  }
}
