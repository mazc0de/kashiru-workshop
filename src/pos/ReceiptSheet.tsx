import { useEffect, useState } from 'react'

import type { PaperWidth } from '@/lib/print'
import { readReceiptFont, receiptFontById, type ReceiptFont } from '@/lib/receiptFont'
import { renderReceipt } from '@/pos/printReceipt'
import type { ReceiptData } from '@/pos/receipt'

/** Lebar pratinjau di layar: 576 / 384 titik printer dikecilkan supaya muat di samping formulir. */
const PREVIEW_PX: Record<PaperWidth, number> = { 80: 360, 58: 240 }

/** Pratinjau struk di layar: gambar yang sama persis dengan yang dikirim ke printer, termasuk hurufnya. */
export function ReceiptSheet({ data, width, logo, font }: { data: ReceiptData; width: PaperWidth; logo: string | null; font?: ReceiptFont }) {
  const [src, setSrc] = useState<string | null>(null)
  // Isi nota dibandingkan sebagai teks, karena objeknya dibuat ulang setiap render oleh halaman pemanggil.
  const dataKey = JSON.stringify(data)
  const fontId = (font ?? readReceiptFont()).id
  useEffect(() => {
    let cancelled = false
    renderReceipt(JSON.parse(dataKey) as ReceiptData, width, logo, receiptFontById(fontId))
      .then((s) => !cancelled && setSrc(s))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [dataKey, width, logo, fontId])

  if (!src) return <div style={{ width: PREVIEW_PX[width], height: 480, background: '#fff' }} />
  return <img src={src} alt="Pratinjau struk" style={{ display: 'block', width: '100%', maxWidth: PREVIEW_PX[width], background: '#fff' }} />
}
