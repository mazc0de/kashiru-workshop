// Nopol disimpan dalam format baku: huruf besar dengan satu spasi di antara kelompok huruf dan angka,
// misalnya "b1234xyz" menjadi "B 1234 XYZ". Format resmi tidak dipaksakan: spasi yang diketik tetap
// dipertahankan (dirapikan menjadi satu), hanya batas huruf-angka yang diberi spasi (PRD 4.6).

export function formatPlate(text: string): string {
  return text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([A-Z])(?=\d)|(\d)(?=[A-Z])/g, '$1$2 ')
}

/** Kunci pencarian riwayat: tanpa spasi dan tanpa membedakan huruf besar-kecil (sama dengan sales.nopol_kunci). */
export function plateKey(text: string): string {
  return text.toUpperCase().replace(/\s/g, '')
}
