// Instalasi Kashiru di bengkel baru (PRD 7.7). Dijalankan developer, bukan dari layar aplikasi.
//
//   npm run setup
//     Mencetak langkah instalasi.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npm run setup
//     Juga membuat akun pemilik. Secret key hanya dipakai di terminal ini, jangan disimpan di .env.
//
// SQL migrasi dijalankan manual di SQL Editor Supabase, berurutan sesuai nama file.
import { readdirSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)

function printSteps() {
  const file = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  console.log(`
Instalasi Kashiru

1. Buat project Supabase Free: centang "Enable Data API" dan "Enable automatic RLS",
   jangan centang "Automatically expose new tables". Lalu isi .env dari .env.example.
2. Jalankan file SQL ini berurutan di SQL Editor Supabase:
${file.map((f, i) => `   ${i + 1}. supabase/migrations/${f}`).join('\n')}
3. Authentication: matikan "Allow new users to sign up" dan "Confirm email".
4. Buat akun pemilik: jalankan lagi skrip ini dengan SUPABASE_URL dan SUPABASE_SECRET_KEY,
   atau buat user di Authentication -> Users lalu tambahkan barisnya di public.profiles.
5. Deploy Edge Function manage-accounts (README), lalu deploy frontend ke Vercel dengan variabel
   yang sama seperti .env.
6. Di laptop kasir: pasang driver BTP-3050, atur ukuran kertas di driver, buat shortcut Chrome
   dengan --kiosk-printing, aktifkan sinkron waktu otomatis Windows, atur DS2208 dengan
   barcode konfigurasi.
7. Login di laptop kasir. Semua laptop setara: laptop mana pun yang login bisa membuat nota.
8. Unduh backup seminggu sekali dari Pengaturan -> Backup. Pemulihan: npm run restore
   (docs/installation-guide.md).
`)
}

async function createOwnerAccount(url, secretKey) {
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    const email = (await prompt.question('Email pemilik: ')).trim().toLowerCase()
    const name = (await prompt.question('Nama pemilik (tercetak di struk): ')).trim()
    const password = await prompt.question('Password (minimal 6 karakter): ')
    if (!email || !name || password.length < 6) {
      throw new Error('Email, nama, dan password minimal 6 karakter wajib diisi.')
    }

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw new Error(`Gagal membuat user: ${error.message}`)

    const { error: profileError } = await admin.from('profiles').insert({ id: data.user.id, email, nama: name })
    if (profileError) throw new Error(`User dibuat, tetapi profil gagal disimpan: ${profileError.message}`)

    console.log(`Akun pemilik ${email} siap dipakai login.`)
  } finally {
    prompt.close()
  }
}

printSteps()
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
  await createOwnerAccount(SUPABASE_URL, SUPABASE_SECRET_KEY)
}
