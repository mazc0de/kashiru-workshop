import { print, type PaperWidth } from '@/lib/print'
import { ReceiptSheet } from '@/pos/ReceiptSheet'
import type { ReceiptData } from '@/pos/receipt'

/** Cetak struk sejumlah salinan di pengaturan. Setiap salinan satu pekerjaan cetak, supaya kertas terpotong. */
export async function printReceipt(data: ReceiptData, width: PaperWidth, logo: string | null, copies: number): Promise<void> {
  for (let i = 0; i < Math.max(1, copies); i++) {
    await print(<ReceiptSheet data={data} width={width} logo={logo} />, width)
  }
}
