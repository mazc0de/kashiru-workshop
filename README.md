# Kashiru

Aplikasi kasir dan stok untuk satu bengkel motor/mobil kecil yang juga menjual part.

Spesifikasi ada di [`PRD-Kashiru-revised.md`](./PRD-Kashiru-revised.md), istilah di [`GLOSSARY.md`](./GLOSSARY.md), keputusan besar di [`docs/adr/`](./docs/adr), dan urutan pengerjaan di [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md).

## Menjalankan

```bash
npm install
cp .env.example .env   # isi URL dan publishable key Supabase
npm run dev
```

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm run build` | Typecheck dan build produksi (PWA) ke `dist/` |
| `npm test` | Test unit (Vitest) |
| `npm run test:db` | Uji skenario database di Postgres sementara (PGlite), tanpa Supabase lokal |
| `npm run lint` | oxlint |
| `npm run setup` | Langkah instalasi bengkel baru, dan pembuatan akun pemilik |
| `npm run restore -- <file>` | Memulihkan file backup ke project Supabase baru yang kosong |
| `npm run gen:types` | Membuat ulang `src/lib/database.types.ts` dari migrasi SQL |

## Database

SQL ada di `supabase/migrations/` dan dijalankan berurutan di SQL Editor Supabase. Perubahan skema selalu berupa file migrasi baru; file lama tidak diubah setelah dijalankan di Supabase.

## Data contoh

`supabase/seed/dummy-data.sql` mengisi project uji dengan data untuk mencoba semua fitur, dan `supabase/seed/reset-data.sql` mengosongkannya lagi (akun dan pengaturan tetap). Keduanya ditempel di SQL Editor dan diuji di `npm run test:db`. Lihat `docs/installation-guide.md` bagian 9.

## Backup

Backup diunduh manual dari Pengaturan → Backup (satu file `.sql`, dibuat di browser) dan dipulihkan dengan `npm run restore` ke project Supabase baru. Langkahnya ada di [`docs/installation-guide.md`](./docs/installation-guide.md); panduan untuk pemilik dan kasir di [`docs/user-guide.md`](./docs/user-guide.md).

## Edge Function

`supabase/functions/manage-accounts` membuat akun, membuat password baru, dan menonaktifkan akun. Logikanya ada di `manage-accounts.ts` dan diuji dengan Vitest; `index.ts` hanya menghubungkannya ke Supabase. Deploy tanpa Docker:

```bash
supabase login
supabase functions deploy manage-accounts --project-ref <ref> --use-api
```

Atau lewat dashboard (Edge Functions, Deploy a new function, Via Editor, nama `manage-accounts`): tempel isi `supabase/dashboard/manage-accounts.ts`. File itu dibuat dengan `npm run functions:dashboard`; jalankan lagi setiap kali kode fungsinya berubah.

## Desain

UI mengikuti taste-skill (`.claude/skills/design-taste-frontend`, gaya `achromatic-ledger`, `.taste-skill/app/direction.json`) dengan aturan PRD 6. Token warna dan radius ada di `src/index.css`.
