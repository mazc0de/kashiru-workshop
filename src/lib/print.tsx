import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

// Satu jalur cetak (PRD 7.3): HTML + window.print() lewat driver printer Windows.
// Di laptop kasir Chrome dijalankan dengan --kiosk-printing, jadi tidak muncul dialog cetak.
// Ukuran kertas 58 atau 80 mm diambil dari Pengaturan (PRD 4.10).

export type PaperWidth = 58 | 80

/** Lebar area cetak per ukuran kertas (PRD 4.10). */
export const PRINT_AREA_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 }

export async function print(content: ReactNode, width: PaperWidth): Promise<void> {
  const container = document.createElement('div')
  container.id = 'print-area'
  container.style.width = `${PRINT_AREA_MM[width]}mm`
  const pageStyle = document.createElement('style')
  pageStyle.textContent = `@page { size: ${width}mm auto; margin: 0 ${(width - PRINT_AREA_MM[width]) / 2}mm; }`
  document.head.appendChild(pageStyle)
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => root.render(content))
  await document.fonts.ready

  await new Promise<void>((resolve) => {
    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      root.unmount()
      container.remove()
      pageStyle.remove()
      resolve()
    }
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
    // Cadangan kalau afterprint tidak terpanggil.
    setTimeout(cleanup, 60_000)
  })
}
