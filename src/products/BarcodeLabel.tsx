import { useLayoutEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

import { PRINT_AREA_MM, type PaperWidth } from '@/lib/print'

// Label barcode (PRD 4.9): nama part dan merek (dipotong kalau terlalu panjang), barcode Code128,
// dan angka kodenya dalam teks. Harga tidak dicetak.
// Tata letak sementara untuk kertas gulungan kontinu; disesuaikan setelah uji printer (Fase 0).

export type LabelContent = { name: string; brand: string | null; code: string }

export function LabelBarcode({ label, width }: { label: LabelContent; width: PaperWidth }) {
  const svg = useRef<SVGSVGElement>(null)
  const barcodeWidthMm = PRINT_AREA_MM[width] - 8

  useLayoutEffect(() => {
    if (!svg.current) return
    JsBarcode(svg.current, label.code, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      font: 'monospace',
      fontSize: 20,
      textMargin: 2,
      margin: 0,
    })
    // JsBarcode menulis ukuran dalam piksel; viewBox membuatnya bisa diskalakan ke milimeter.
    const w = svg.current.getAttribute('width')
    const h = svg.current.getAttribute('height')
    svg.current.setAttribute('viewBox', `0 0 ${parseFloat(w ?? '0')} ${parseFloat(h ?? '0')}`)
    svg.current.removeAttribute('width')
    svg.current.removeAttribute('height')
  }, [label.code])

  return (
    <div style={{ breakInside: 'avoid', padding: '0 0 4mm', textAlign: 'center', color: '#000', fontFamily: 'sans-serif' }}>
      <div
        style={{
          fontSize: '9pt',
          fontWeight: 600,
          lineHeight: 1.2,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: '1.5mm',
        }}
      >
        {label.brand ? `${label.name} · ${label.brand}` : label.name}
      </div>
      <svg ref={svg} style={{ width: `${barcodeWidthMm}mm`, maxHeight: '16mm' }} aria-label={`Barcode ${label.code}`} />
    </div>
  )
}

export type LabelPrintItem = { label: LabelContent; count: number }

/** Jarak kertas kosong setelah label terakhir, supaya pisau potong (di atas head cetak) tidak mengenai angka kodenya. */
const TRAILING_FEED_MM = 10

/** Semua label dicetak berurutan dalam satu gulungan, jadi kertas hanya dipotong sekali. */
export function LabelSheet({ items, width }: { items: LabelPrintItem[]; width: PaperWidth }) {
  return (
    <>
      {items.flatMap(({ label, count }) =>
        Array.from({ length: count }, (_, i) => <LabelBarcode key={`${label.code}-${i}`} label={label} width={width} />),
      )}
      <div style={{ height: `${TRAILING_FEED_MM}mm` }} />
    </>
  )
}
