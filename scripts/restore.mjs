// Pemulihan backup Kashiru (PRD 7.6, R45, R46) ke project Supabase BARU yang sudah menjalankan semua
// migrasi. Dijalankan developer dari laptop; cukup Node, tanpa Docker dan tanpa PostgreSQL.
//
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   SUPABASE_DB_URL='postgresql://postgres.xxx:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres' \
//   npm run restore -- kashiru-backup-bengkel-20261019-2320.sql
//
// SUPABASE_DB_URL diambil dari tombol Connect -> Session pooler, karena koneksi langsung paket Free hanya IPv6.
// Secret key dan password database hanya dipakai di terminal ini, jangan disimpan di .env.
import { readFileSync } from 'node:fs'
import { argv, env, exit, stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

import { readHeader, statementsOf } from './backup-file.mjs'

const SUPPORTED_FORMAT = 2

function usage(message) {
  console.error(`${message}

Pakai:
  SUPABASE_URL=... SUPABASE_SECRET_KEY=... SUPABASE_DB_URL=... npm run restore -- <file backup .sql>

Langkah lengkap ada di docs/installation-guide.md, bagian Pemulihan.`)
  exit(1)
}

const file = argv[2]
const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_DB_URL } = env
if (!file) usage('File backup belum disebut.')
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_DB_URL) usage('SUPABASE_URL, SUPABASE_SECRET_KEY, dan SUPABASE_DB_URL wajib diisi.')

const text = readFileSync(file, 'utf8')
const { format, accounts } = readHeader(text)
if (format > SUPPORTED_FORMAT) usage(`File backup format ${format} dibuat Kashiru yang lebih baru. Perbarui kode ini dulu.`)
// Format 1 mematikan trigger lewat session_replication_role, yang tidak diizinkan untuk role postgres di
// Supabase. Baris itu dilewati; trigger dimatikan per tabel oleh skrip ini (lihat di bawah).
const statements = statementsOf(text).filter((l) => !/^set session_replication_role\b/i.test(l))
console.log(`File backup: ${text.split('\n', 3).slice(1).join(' · ').replaceAll('-- ', '')}`)
console.log(`${accounts.length} akun, ${statements.length} pernyataan SQL.`)

// Supabase memakai sertifikat yang tidak ada di daftar CA Node; koneksi tetap terenkripsi.
// sslmode=disable hanya untuk Postgres uji di laptop sendiri.
const ssl = /[?&]sslmode=disable\b/.test(SUPABASE_DB_URL) ? false : { rejectUnauthorized: false }
const db = new pg.Client({ connectionString: SUPABASE_DB_URL.replace(/[?&]sslmode=disable\b/, ''), ssl })
await db.connect()

try {
  // Project tujuan harus sudah menjalankan semua migrasi dan masih kosong, supaya data yang sedang
  // dipakai tidak pernah tertimpa.
  const { rows: check } = await db.query(`
    select to_regclass('public.backup_logs') is not null as migrated,
      case when to_regclass('public.backup_logs') is null then 0
           else (select count(*) from public.profiles) + (select count(*) from public.products) + (select count(*) from public.sales)
      end::int as filled`)
  if (!check[0].migrated) throw new Error('Project tujuan belum menjalankan semua migrasi (tabel backup_logs belum ada).')
  if (check[0].filled > 0) throw new Error('Project tujuan sudah berisi data. Pemulihan hanya ke project baru yang kosong.')

  const prompt = createInterface({ input: stdin, output: stdout })
  let password
  try {
    const answer = (await prompt.question(`Pulihkan ke ${SUPABASE_URL}? Ketik "ya": `)).trim().toLowerCase()
    if (answer !== 'ya') throw new Error('Dibatalkan.')
    password = await prompt.question('Password sementara untuk semua akun (minimal 6 karakter): ')
    if (password.length < 6) throw new Error('Password minimal 6 karakter.')
  } finally {
    prompt.close()
  }

  // Akun dibuat ulang dengan ID dan email yang sama, karena nota, penerimaan, dan riwayat terhubung ke ID akun.
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const a of accounts) {
    const { error } = await admin.auth.admin.createUser({ id: a.id, email: a.email, password, email_confirm: true })
    if (!error) continue
    // Pemulihan yang diulang setelah gagal: akunnya sudah dibuat pada percobaan sebelumnya.
    const existing = await admin.auth.admin.getUserById(a.id)
    if (existing.data.user?.email !== a.email) throw new Error(`Akun ${a.email} gagal dibuat: ${error.message}`)
    const { error: updateError } = await admin.auth.admin.updateUserById(a.id, { password })
    if (updateError) throw new Error(`Password akun ${a.email} gagal diatur: ${updateError.message}`)
  }
  console.log(`${accounts.length} akun siap.`)

  await db.query('begin')
  try {
    // Trigger buatan Kashiru dimatikan per tabel (cukup hak pemilik tabel), supaya kartu stok, saldo, dan
    // riwayat tidak dihitung atau dicatat ulang. Foreign key tetap diperiksa.
    const { rows: tables } = await db.query(`select tablename from pg_tables where schemaname = 'public' order by tablename`)
    for (const t of tables) await db.query(`alter table public."${t.tablename}" disable trigger user`)
    for (const [i, statement] of statements.entries()) {
      try {
        await db.query(statement)
      } catch (e) {
        throw new Error(`Pernyataan ${i + 1} gagal: ${e.message}\n${statement.slice(0, 200)}`)
      }
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1} dari ${statements.length}`)
    }
    // File logo tidak ikut backup (R39), jadi alamatnya dikosongkan sampai logo diunggah lagi.
    // File backup menyalakan triggernya lagi di akhir; trigger pengaturan dimatikan lagi supaya pengosongan
    // logo ini tidak tercatat sebagai perubahan pengaturan.
    await db.query('alter table public.store_settings disable trigger user')
    await db.query('update public.store_settings set logo_url = null')
    for (const t of tables) await db.query(`alter table public."${t.tablename}" enable trigger user`)
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  }

  console.log(`
Data sudah dipulihkan. Langkah berikutnya:
1. Authentication: matikan "Allow new users to sign up" dan "Confirm email".
2. Deploy Edge Function manage-accounts ke project ini.
3. Ganti URL dan publishable key di .env dan Vercel ke project ini, lalu deploy ulang.
4. Semua akun masuk dengan password sementara tadi, lalu menggantinya lewat Pengaturan -> Akun -> Password baru.
5. Unggah logo lagi di Pengaturan -> Profil bengkel.
6. Di setiap laptop: masuk lagi.`)
} catch (e) {
  console.error(`\nPemulihan gagal: ${e.message}`)
  exit(1)
} finally {
  await db.end()
}
