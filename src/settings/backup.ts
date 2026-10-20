// Backup manual (PRD 7.6, R45): semua tabel data bengkel dibaca lewat Data API dengan akun yang login,
// lalu ditulis sebagai satu file SQL yang dipulihkan dengan `npm run restore` ke project Supabase baru.
// Password akun tidak bisa dibaca dari browser, jadi akun dibuat ulang saat pemulihan (R46).

export type Row = Record<string, unknown>

export type BackupTable = {
  name: string
  /** Nama untuk pesan kemajuan di layar. */
  label: string
  /** Kunci utama, sebagai urutan pasti saat dibaca per 1.000 baris. */
  key: string[]
  /** Kolom yang dihitung database, tidak ditulis ulang. */
  generated?: string[]
  /** Kolom identity: insert memakai OVERRIDING SYSTEM VALUE, lalu sequence-nya diset ulang. */
  identity?: string
  /** Tabel satu baris yang sudah diisi migrasi: ditimpa, bukan ditambah. */
  singleton?: boolean
}

/** Semua tabel di skema public. Uji pulih-ulang memastikan tidak ada tabel yang terlewat. */
export const BACKUP_TABLES: BackupTable[] = [
  { name: 'store_settings', label: 'Pengaturan', key: ['id'], singleton: true },
  { name: 'internal_barcode_counter', label: 'Nomor barcode internal', key: ['id'], singleton: true },
  { name: 'document_counters', label: 'Nomor dokumen', key: ['jenis', 'tanggal'] },
  { name: 'profiles', label: 'Akun', key: ['id'] },
  { name: 'cashier_devices', label: 'Riwayat Perangkat Kasir', key: ['id'] },
  { name: 'categories', label: 'Kategori', key: ['id'] },
  { name: 'mechanics', label: 'Mekanik', key: ['id'] },
  { name: 'suppliers', label: 'Supplier', key: ['id'] },
  { name: 'products', label: 'Produk', key: ['id'] },
  { name: 'product_barcodes', label: 'Barcode', key: ['id'] },
  { name: 'product_part_numbers', label: 'Kode part', key: ['id'] },
  { name: 'sales', label: 'Nota', key: ['id'], generated: ['nopol_kunci'] },
  { name: 'sale_items', label: 'Baris nota', key: ['id'] },
  { name: 'receipts', label: 'Penerimaan', key: ['id'] },
  { name: 'receipt_items', label: 'Baris penerimaan', key: ['id'] },
  { name: 'stock_opnames', label: 'Opname', key: ['id'] },
  { name: 'stock_opname_items', label: 'Baris opname', key: ['opname_id', 'product_id'] },
  { name: 'stock_movements', label: 'Kartu stok', key: ['id'], identity: 'id' },
  { name: 'stock_levels', label: 'Stok', key: ['product_id'] },
  { name: 'change_logs', label: 'Riwayat perubahan', key: ['id'], identity: 'id' },
  { name: 'backup_logs', label: 'Catatan backup', key: ['id'], identity: 'id' },
]

export type TableDump = { table: BackupTable; rows: Row[] }

/** Teks memakai E'' supaya baris baru tidak memecah pernyataan: satu pernyataan per baris. */
function text(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  return `E'${escaped}'`
}

/** Nilai JSON dari Data API sebagai literal SQL. Objek dan array adalah kolom jsonb. */
export function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Angka tidak valid: ${v}`)
    return String(v)
  }
  if (typeof v === 'string') return text(v)
  return text(JSON.stringify(v))
}

const ident = (c: string) => `"${c.replace(/"/g, '""')}"`

const BATCH = 200

/** Pernyataan insert per 200 baris. Tabel satu baris ditimpa karena migrasi sudah mengisinya. */
export function insertStatements({ table: t, rows }: TableDump): string[] {
  if (rows.length === 0) return []
  const columns = Object.keys(rows[0]).filter((c) => !t.generated?.includes(c))
  const head = `insert into public.${t.name} (${columns.map(ident).join(', ')})${t.identity ? ' overriding system value' : ''} values `
  const updated = columns.filter((c) => !t.key.includes(c))
  const tail = t.singleton ? ` on conflict (${t.key.map(ident).join(', ')}) do update set ${updated.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}` : ''
  const statements: string[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => `(${columns.map((c) => sqlValue(r[c])).join(', ')})`)
    statements.push(`${head}${values.join(', ')}${tail};`)
  }
  return statements
}

export type BackupMeta = { workshop: string; createdAt: Date; account: string }

/** Versi 2: trigger dimatikan per tabel, bukan lewat session_replication_role (versi 1). */
export const FORMAT_VERSION = 2

/**
 * Isi file backup. Trigger buatan Kashiru dimatikan per tabel selama pemulihan (ALTER TABLE ... DISABLE TRIGGER
 * USER, cukup hak pemilik tabel; SQL Editor Supabase tidak boleh mengubah session_replication_role), jadi kartu
 * stok, saldo stok, dan riwayat tidak dihitung atau dicatat ulang. Foreign key tetap diperiksa, jadi tabel
 * ditulis berurutan sesuai BACKUP_TABLES. Baris berawalan "--" adalah keterangan; baris "-- kashiru-accounts:"
 * dibaca `npm run restore` untuk membuat ulang akun.
 */
export function buildBackupSql(dump: TableDump[], meta: BackupMeta): string {
  const profiles = dump.find((d) => d.table.name === 'profiles')?.rows ?? []
  const accounts = profiles.map((p) => ({ id: p.id, email: p.email }))
  const lines = [
    '-- Kashiru backup',
    `-- Bengkel: ${meta.workshop.replace(/\s+/g, ' ')}`,
    `-- Dibuat: ${meta.createdAt.toISOString()} oleh ${meta.account.replace(/\s+/g, ' ')}`,
    '-- Pulihkan ke project Supabase baru yang sudah menjalankan semua migrasi: npm run restore -- <file ini>',
    `-- kashiru-backup-format: ${FORMAT_VERSION}`,
    `-- kashiru-accounts: ${JSON.stringify(accounts)}`,
    ...dump.map((d) => `alter table public.${d.table.name} disable trigger user;`),
    ...dump.flatMap((d) => [`-- ${d.table.label}: ${d.rows.length} baris`, ...insertStatements(d)]),
    ...dump
      .filter((d) => d.table.identity)
      .map(
        ({ table: t }) =>
          `select setval(pg_get_serial_sequence('public.${t.name}', '${t.identity}'), coalesce((select max(${ident(t.identity!)}) from public.${t.name}), 0) + 1, false);`,
      ),
    ...dump.map((d) => `alter table public.${d.table.name} enable trigger user;`),
  ]
  return `${lines.join('\n')}\n`
}

/**
 * Data dibaca tabel demi tabel, jadi transaksi yang tersimpan di tengah pembacaan bisa membuat isinya
 * tidak utuh. Pemeriksaan ini menemukannya, lalu pembacaan diulang (lihat downloadBackup).
 */
export function findInconsistency(dump: TableDump[]): string | null {
  const rows = (name: string) => dump.find((d) => d.table.name === name)?.rows ?? []
  const ids = (name: string, key = 'id') => new Set(rows(name).map((r) => r[key]))

  const parents: [string, string, string][] = [
    ['sale_items', 'sale_id', 'sales'],
    ['receipt_items', 'receipt_id', 'receipts'],
    ['stock_opname_items', 'opname_id', 'stock_opnames'],
    ['sale_items', 'product_id', 'products'],
    ['receipt_items', 'product_id', 'products'],
    ['stock_movements', 'product_id', 'products'],
    ['stock_levels', 'product_id', 'products'],
  ]
  for (const [child, column, parent] of parents) {
    const known = ids(parent)
    // Baris nota jasa manual memang tanpa produk (product_id kosong).
    if (rows(child).some((r) => r[column] !== null && !known.has(r[column]))) return `${child} tanpa ${parent}`
  }
  for (const [parent, child, column] of [
    ['sales', 'sale_items', 'sale_id'],
    ['receipts', 'receipt_items', 'receipt_id'],
  ]) {
    const filled = new Set(rows(child).map((r) => r[column]))
    if (rows(parent).some((r) => !filled.has(r.id))) return `${parent} tanpa ${child}`
  }

  const documents: Record<string, Set<unknown>> = { sale: ids('sales'), receipt: ids('receipts'), opname: ids('stock_opnames') }
  if (rows('stock_movements').some((m) => m.ref_type && !documents[String(m.ref_type)]?.has(m.ref_id))) return 'kartu stok tanpa dokumennya'

  // Saldo stok selalu sama dengan jumlah mutasinya (trigger stock_movements).
  const sums = new Map<unknown, number>()
  for (const m of rows('stock_movements')) sums.set(m.product_id, (sums.get(m.product_id) ?? 0) + Number(m.qty))
  for (const l of rows('stock_levels')) {
    if (Math.abs((sums.get(l.product_id) ?? 0) - Number(l.qty_on_hand)) > 0.001) return 'stok berbeda dengan kartu stok'
  }
  return null
}

const wibParts = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>

/** "kashiru-backup-bengkel-maju-jaya-20261019-2320.sql" menurut waktu WIB. */
export function backupFileName(workshop: string, at: Date): string {
  const slug = workshop.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bengkel'
  const p = wibParts(at)
  return `kashiru-backup-${slug}-${p.year}${p.month}${p.day}-${p.hour}${p.minute}.sql`
}

/** Pengingat di Dashboard muncul kalau backup terakhir lebih dari 7 hari lalu atau belum pernah (R47). */
export const BACKUP_REMINDER_DAYS = 7

/** Selisih hari antara tanggal WIB backup terakhir dan hari ini; null kalau belum pernah. */
export function daysSinceBackup(last: string | null, now: Date): number | null {
  if (!last) return null
  const day = (d: Date) => {
    const p = wibParts(d)
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  }
  return Math.round((day(now) - day(new Date(last))) / 86_400_000)
}

export function backupOverdue(days: number | null): boolean {
  return days === null || days > BACKUP_REMINDER_DAYS
}
