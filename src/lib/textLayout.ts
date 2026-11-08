// Baris teks berkolom untuk printer struk. Lebar diukur dalam kolom: satu kolom = satu karakter Courier
// = 1,5 mm, jadi kertas 80 mm = 48 kolom dan 58 mm = 32 kolom. Dengan huruf sama lebar setiap karakter
// tepat satu kolom; dengan huruf proporsional (mis. Times New Roman) lebar teks diukur dari hurufnya.

/** Lebar teks dalam kolom. */
export type Measure = (text: string) => number

/** Huruf sama lebar: satu karakter = satu kolom. */
export const countChars: Measure = (text) => text.length

/** Teks rata kiri mulai kolom `at`, rata kanan ke tepi kertas, di tengah, atau tanda "-" sepanjang baris. */
export type Cell =
  | { align: 'left'; at: number; text: string }
  | { align: 'right'; text: string }
  | { align: 'center'; text: string }
  | { align: 'fill'; text: string }

export type Row = Cell[]

export const left = (text: string, at = 0): Cell => ({ align: 'left', at, text })
export const right = (text: string): Cell => ({ align: 'right', text })
export const DIVIDER: Row = [{ align: 'fill', text: '-' }]

/** Panjang awalan terpanjang yang muat di lebar itu, minimal satu karakter. */
function fitLength(word: string, width: number, measure: Measure): number {
  let n = 1
  while (n < word.length && measure(word.slice(0, n + 1)) <= width) n++
  return n
}

/** Pecah teks per kata supaya muat di lebar kertas; kata yang terlalu panjang dipotong paksa. */
export function wrapText(text: string, width: number, measure: Measure = countChars): string[] {
  const result: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (measure(word) > width) {
        if (line) {
          result.push(line)
          line = ''
        }
        const n = fitLength(word, width, measure)
        result.push(word.slice(0, n))
        word = word.slice(n)
      }
      if (!line) line = word
      else if (measure(`${line} ${word}`) <= width) line += ` ${word}`
      else {
        result.push(line)
        line = word
      }
    }
    if (line) result.push(line)
  }
  return result
}

export function centerRows(text: string, width: number, measure: Measure = countChars): Row[] {
  return wrapText(text, width, measure).map((b) => [{ align: 'center', text: b }])
}

/** Teks kiri (indentasi dari spasi di depannya) dan angka rata kanan; kalau tidak muat, angka turun ke baris baru. */
export function leftRightRows(leftText: string, rightText: string, width: number, measure: Measure = countChars): Row[] {
  const indent = leftText.match(/^ */)?.[0].length ?? 0
  const rows: Row[] = wrapText(leftText, width - indent, measure).map((b) => [left(b, indent)])
  const last = rows.pop()
  const lastWidth = last ? indent + measure(last[0].text) : 0
  if (!last) return [...rows, [right(rightText)]]
  if (lastWidth + measure(' ') + measure(rightText) <= width) return [...rows, [...last, right(rightText)]]
  return [...rows, last, [right(rightText)]]
}

/**
 * "Nopol: B 1234 XYZ": nama label di kolom 0, titik dua di kolomnya sendiri, dan isi dibungkus dengan
 * indentasi menggantung selebar label. Dengan huruf proporsional titik dua dan isinya tetap lurus.
 */
export function labelValueRows(label: string, value: string, width: number, measure: Measure = countChars): Row[] {
  const colon = label.indexOf(':')
  const name = colon < 0 ? label.trimEnd() : label.slice(0, colon).trimEnd()
  return wrapText(value, width - label.length, measure).map((b, i) =>
    i === 0 ? [left(name), ...(colon < 0 ? [] : [left(':', colon)]), left(b, label.length)] : [left(b, label.length)],
  )
}

/** Baris sebagai teks lebar tetap (huruf sama lebar), tanpa spasi di ujung. */
export function rowToString(row: Row, width: number): string {
  const chars = Array<string>(width).fill(' ')
  const put = (text: string, start: number) => {
    Array.from(text).forEach((ch, i) => {
      if (start + i >= 0 && start + i < width) chars[start + i] = ch
    })
  }
  for (const cell of row) {
    if (cell.align === 'fill') put(cell.text.repeat(Math.ceil(width / Math.max(1, cell.text.length))), 0)
    else if (cell.align === 'left') put(cell.text, cell.at)
    else if (cell.align === 'right') put(cell.text, width - cell.text.length)
    else put(cell.text, Math.floor((width - cell.text.length) / 2))
  }
  return chars.join('').trimEnd()
}
