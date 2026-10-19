import { TextSheet } from '@/components/TextSheet'
import { print, type PaperWidth } from '@/lib/print'

/** Cetak daftar teks (saran belanja, lembar hitung, ringkasan harian) ke printer struk. */
export function printText(lines: string[], width: PaperWidth): Promise<void> {
  return print(<TextSheet lines={lines} />, width)
}
