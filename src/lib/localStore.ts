// Salinan kecil di localStorage supaya data yang dibutuhkan saat offline tetap ada
// (profil akun yang login, pengaturan bengkel, waktu aktivitas terakhir).

export function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Penyimpanan penuh atau diblokir: aplikasi tetap jalan tanpa salinan.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Abaikan.
  }
}
