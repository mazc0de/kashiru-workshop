import { PRINT_AREA_MM, print, type PaperWidth } from '@/lib/print'
import { DEFAULT_RECEIPT_FONT, type ReceiptFont } from '@/lib/receiptFont'
import { countChars, left, rowToString, type Measure, type Row } from '@/lib/textLayout'

// Struk dan lembar teks dicetak sebagai gambar hitam-putih seukuran titik printer, bukan teks HTML.
// Chrome mengirim huruf ke driver sebagai bentuk vektor tanpa hinting, sehingga garis huruf yang lebih
// tipis dari satu titik printer putus-putus di kertas (Notepad tidak, karena memakai hinting Windows).
// Gambar yang sudah satu piksel per titik dan hanya berisi hitam atau putih tidak diubah lagi oleh driver.

/** Printer struk 58/80 mm umumnya 203 dpi, yaitu 8 titik per mm: 576 titik untuk 72 mm, 384 untuk 48 mm. */
const DOTS_PER_MM = 8
/** Satu kolom struk: 48 kolom × 12 titik = 576 titik, 32 kolom × 12 titik = 384 titik (1,5 mm per kolom). */
const CHAR_DOTS = 12
/** Courier New selebar 0,6 em, jadi 20 px = 12 titik per karakter (sama dengan 2,5 mm di versi HTML). */
const FONT_PX = 20
/** Tinggi baris 1,25 × 20 px, dan garis dasar huruf di dalam baris itu. */
const LINE_DOTS = 25
const BASELINE_DOTS = 18
/** Piksel dengan tinta 25% atau lebih menjadi hitam, supaya garis huruf yang tipis tetap utuh. */
const INK_THRESHOLD = 192

/** Logo maksimal 40 × 18 mm dengan jarak 2 mm ke teks, seperti sebelumnya; 1 px layar = 0,2646 mm. */
const LOGO_MAX_W = 40 * DOTS_PER_MM
const LOGO_MAX_H = 18 * DOTS_PER_MM
const LOGO_GAP = 2 * DOTS_PER_MM
const DOTS_PER_CSS_PX = (DOTS_PER_MM * 25.4) / 96

const cssFont = (font: ReceiptFont) => `${FONT_PX}px ${font.family}`

const luminance = (rgba: Uint8ClampedArray, i: number) => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]

/** Teks: setiap piksel menjadi hitam atau putih menurut batas tinta. Data RGBA diubah langsung. */
export function thresholdToMonochrome(rgba: Uint8ClampedArray, threshold = INK_THRESHOLD): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = luminance(rgba, i) < threshold ? 0 : 255
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v
    rgba[i + 3] = 255
  }
}

/** Logo: abu-abu dijadikan pola titik hitam-putih (Floyd–Steinberg) supaya gradasinya tetap terlihat. */
export function ditherToMonochrome(rgba: Uint8ClampedArray, width: number, height: number): void {
  const gray = new Float32Array(width * height)
  for (let p = 0; p < gray.length; p++) gray[p] = luminance(rgba, p * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const v = gray[p] < 128 ? 0 : 255
      const error = gray[p] - v
      gray[p] = v
      if (x + 1 < width) gray[p + 1] += (error * 7) / 16
      if (y + 1 < height) {
        if (x > 0) gray[p + width - 1] += (error * 3) / 16
        gray[p + width] += (error * 5) / 16
        if (x + 1 < width) gray[p + width + 1] += error / 16
      }
    }
  }
  for (let p = 0; p < gray.length; p++) {
    const i = p * 4
    rgba[i] = rgba[i + 1] = rgba[i + 2] = gray[p]
    rgba[i + 3] = 255
  }
}

/**
 * Pengukur lebar teks dalam kolom struk untuk huruf itu. Huruf sama lebar dihitung per karakter; huruf
 * proporsional diukur di canvas dengan ukuran yang sama seperti saat dicetak.
 */
export function createMeasure(font: ReceiptFont): Measure {
  if (font.monospace) return countChars
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return countChars
  ctx.font = cssFont(font)
  return (text) => ctx.measureText(text).width / CHAR_DOTS
}

/** Lembar teks lebar tetap (tabel) sebagai baris struk; spasi di depan tetap menjadi indentasi. */
export const linesToRows = (lines: string[]): Row[] => lines.map((b) => [left(b)])

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.src = src
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

/** Gambar baris struk (dan logo di atasnya) menjadi PNG hitam-putih selebar area cetak. */
export async function renderMonochrome(
  rows: Row[],
  width: PaperWidth,
  font: ReceiptFont = DEFAULT_RECEIPT_FONT,
  logo: string | null = null,
): Promise<string> {
  const canvasWidth = PRINT_AREA_MM[width] * DOTS_PER_MM
  const columns = canvasWidth / CHAR_DOTS
  const image = logo ? await loadImage(logo) : null
  const scale = image ? Math.min(DOTS_PER_CSS_PX, LOGO_MAX_W / image.naturalWidth, LOGO_MAX_H / image.naturalHeight) : 0
  const logoW = image ? Math.round(image.naturalWidth * scale) : 0
  const logoH = image ? Math.round(image.naturalHeight * scale) : 0
  const textTop = image ? logoH + LOGO_GAP : 0

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = Math.max(1, textTop + rows.length * LINE_DOTS)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Browser tidak bisa menyiapkan gambar struk')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (image && logoW > 0 && logoH > 0) {
    const x = Math.floor((canvasWidth - logoW) / 2)
    ctx.drawImage(image, x, 0, logoW, logoH)
    const area = ctx.getImageData(x, 0, logoW, logoH)
    ditherToMonochrome(area.data, logoW, logoH)
    ctx.putImageData(area, x, 0)
  }

  if (rows.length) {
    ctx.fillStyle = '#000'
    ctx.font = cssFont(font)
    ctx.textBaseline = 'alphabetic'
    rows.forEach((row, i) => {
      const y = textTop + i * LINE_DOTS + BASELINE_DOTS
      if (font.monospace) {
        // Setiap karakter di kolomnya sendiri, supaya angka rata kanan tetap lurus walaupun lebar font sedikit meleset.
        Array.from(rowToString(row, columns)).forEach((ch, col) => {
          if (ch !== ' ') ctx.fillText(ch, col * CHAR_DOTS, y)
        })
        return
      }
      for (const cell of row) {
        if (cell.align === 'fill') {
          const n = Math.floor(canvasWidth / Math.max(1, ctx.measureText(cell.text).width))
          const fill = cell.text.repeat(n)
          ctx.fillText(fill, Math.round((canvasWidth - ctx.measureText(fill).width) / 2), y)
          continue
        }
        const w = ctx.measureText(cell.text).width
        const x = cell.align === 'left' ? cell.at * CHAR_DOTS : cell.align === 'right' ? canvasWidth - w : (canvasWidth - w) / 2
        ctx.fillText(cell.text, Math.round(x), y)
      }
    })
    const area = ctx.getImageData(0, textTop, canvasWidth, canvas.height - textTop)
    thresholdToMonochrome(area.data)
    ctx.putImageData(area, 0, textTop)
  }

  return canvas.toDataURL('image/png')
}

/** Cetak gambar hitam-putih selebar area cetak, satu piksel per titik printer. */
export function printImage(src: string, width: PaperWidth): Promise<void> {
  return print(
    <img src={src} alt="" style={{ display: 'block', width: `${PRINT_AREA_MM[width]}mm`, imageRendering: 'pixelated' }} />,
    width,
  )
}
