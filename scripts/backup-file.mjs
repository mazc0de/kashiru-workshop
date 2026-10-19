// Membaca file backup Kashiru (src/settings/backup.ts) untuk `npm run restore`.
// Setiap pernyataan SQL ada di satu baris; baris berawalan "--" adalah keterangan.

const ACCOUNTS_PREFIX = '-- kashiru-accounts: '
const FORMAT_PREFIX = '-- kashiru-backup-format: '

/** Versi format dan daftar akun { id, email } dari kepala file. */
export function readHeader(text) {
  const lines = text.split('\n', 20)
  if (lines[0] !== '-- Kashiru backup') throw new Error('Ini bukan file backup Kashiru.')
  const format = Number(lines.find((l) => l.startsWith(FORMAT_PREFIX))?.slice(FORMAT_PREFIX.length))
  const accounts = lines.find((l) => l.startsWith(ACCOUNTS_PREFIX))
  if (!format || !accounts) throw new Error('Kepala file backup tidak lengkap.')
  return { format, accounts: JSON.parse(accounts.slice(ACCOUNTS_PREFIX.length)) }
}

/** Pernyataan SQL berurutan, tanpa baris keterangan dan baris kosong. */
export function statementsOf(text) {
  return text.split('\n').filter((l) => l.trim() && !l.startsWith('--'))
}
