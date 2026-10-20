# Kashiru

Aplikasi kasir dan stok berbasis web untuk **satu bengkel motor/mobil kecil** yang juga menjual part. Kashiru mencatat penjualan part dan jasa di kasir, stok part, penerimaan barang, dan stock opname, lengkap dengan laporan, riwayat perubahan, dan backup. Kasir tetap bisa membuat nota saat internet mati.

- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Base UI), PWA (bisa dibuka offline)
- **Backend**: Supabase (Postgres + Row Level Security, Auth, Storage, satu Edge Function)
- **Perangkat bengkel**: laptop Windows + Chrome, printer struk thermal Kassen BTP-3050, scanner Zebra DS2208

Satu instalasi untuk satu bengkel: satu project Supabase dan satu alamat aplikasi.

---

## Daftar isi

1. [Fitur](#fitur)
2. [Persyaratan](#persyaratan)
3. [Instalasi](#instalasi)
4. [Menjalankan di laptop developer](#menjalankan-di-laptop-developer)
5. [Data contoh untuk uji](#data-contoh-untuk-uji)
6. [Backup dan pemulihan](#backup-dan-pemulihan)
7. [Perintah npm](#perintah-npm)
8. [Pengujian](#pengujian)
9. [Struktur proyek](#struktur-proyek)
10. [Hal penting yang disengaja](#hal-penting-yang-disengaja)
11. [Dokumentasi lain](#dokumentasi-lain)

---

## Fitur

| Menu | Isi |
| --- | --- |
| **Kasir** | Scan barcode atau cari produk, **Katalog** per kategori (F3), qty dengan tombol − / +, diskon per baris diketik langsung di tabel (rupiah atau %), diskon nota, tahan keranjang, bayar Tunai/QRIS/Transfer/EDC, cetak struk. Semua aksi punya pintasan keyboard (F2–F12). Tetap jalan saat offline |
| **Riwayat nota** | Cari per tanggal, nomor, nopol, atau pelanggan; cetak ulang (SALINAN); void nota; cetak ringkasan harian; daftar nota yang belum terkirim |
| **Produk** | Part dan jasa, banyak barcode dan kode part per part, barcode internal + cetak label, stok awal, "Simpan & berikutnya" untuk input cepat dengan scanner |
| **Label barcode** | Daftar semua barcode internal part aktif, cari/filter kategori, centang banyak part dengan jumlah label masing-masing, cetak sekaligus dalam satu gulungan |
| **Stok** | Status Aman/Menipis/Habis/Minus, saran belanja (cetak/Excel), kartu stok per part, penyesuaian stok dengan alasan |
| **Penerimaan** | Barang masuk: tanggal, cari/scan barang, qty, harga beli (otomatis terisi harga terakhir), barang bonus Rp 0, void penerimaan |
| **Opname** | Sesi penuh atau per kategori, hitung dengan scan atau lembar hitung, tinjau selisih + alasan, konfirmasi atau batalkan, ekspor PDF/Excel |
| **Dashboard** | Omzet hari ini (part/jasa), laba kotor, jumlah nota dan kendaraan, grafik 30 hari, jumlah part Menipis/Habis/Minus, pengingat backup |
| **Laporan** | Penjualan, Laba kotor, Jasa per mekanik, Riwayat servis per nopol, Stok (nilai persediaan, slow/fast-moving), Penerimaan, Opname. Filter periode, ekspor Excel dan PDF |
| **Riwayat perubahan** | Semua perubahan data (harga, produk, void, penyesuaian, opname, akun, pengaturan), filter akun/periode/jenis aksi, tidak bisa diedit atau dihapus |
| **Pengaturan** | Profil bengkel + logo, awalan nomor dokumen, ukuran kertas 58/80 mm, blind count opname, panduan dan uji scanner, backup manual, akun, logout otomatis, kategori, mekanik |

Tampilan laptop dan HP: Dashboard, Riwayat nota, Status stok, Laporan, dan Riwayat perubahan nyaman dibuka di HP pemilik. Layar lain dirancang untuk laptop.

---

## Persyaratan

- **Node.js 22** dan npm
- Akun **Supabase** (paket Free cukup) dan akun **Vercel** untuk hosting aplikasi
- Untuk laptop kasir: Windows + Google Chrome, driver printer BTP-3050, scanner Zebra DS2208 (mode USB keyboard)

Tidak perlu Docker atau Supabase lokal: semua SQL dijalankan di SQL Editor Supabase.

---

## Instalasi

Langkah lengkap ada di [`docs/installation-guide.md`](./docs/installation-guide.md). Ringkasannya:

### 1. Ambil kode dan pasang dependensi

```bash
git clone <alamat-repo-anda> kashiru
cd kashiru
npm install
```

### 2. Buat project Supabase

1. Buat project baru (paket Free). Centang **Enable Data API** dan **Enable automatic RLS**; **jangan** centang **Automatically expose new tables**.
2. Di pengaturan **Authentication**: matikan **Allow new users to sign up** dan **Confirm email**. Akun hanya dibuat dari dalam aplikasi.
3. Buka **SQL Editor**, lalu jalankan file berikut **satu per satu, berurutan**:

   | No | File | Isi |
   | --- | --- | --- |
   | 1 | `supabase/migrations/20261019000001_schema.sql` | Tabel inti |
   | 2 | `supabase/migrations/20261019000002_stock.sql` | Kartu stok dan harga beli rata-rata |
   | 3 | `supabase/migrations/20261019000003_access_audit.sql` | Hak akses (RLS) dan riwayat perubahan |
   | 4 | `supabase/migrations/20261019000004_rpc.sql` | Fungsi nota, penerimaan, opname, dan lainnya |
   | 5 | `supabase/migrations/20261019000005_storage_logo.sql` | Penyimpanan logo |
   | 6 | `supabase/migrations/20261019000006_last_purchase.sql` | Harga beli terakhir |
   | 7 | `supabase/migrations/20261019000007_reports.sql` | Laporan dan dashboard |
   | 8 | `supabase/migrations/20261019000008_backup_logs.sql` | Catatan backup |
   | 9 | `supabase/migrations/20261019000009_any_device_sales.sql` | Semua laptop bisa membuat nota |

   File migrasi yang sudah dijalankan **tidak pernah diubah**. Perubahan skema berikutnya selalu berupa file baru.

### 3. Isi `.env`

```bash
cp .env.example .env
```

Isi dengan **Project URL** dan **publishable key** dari Project Settings → API Keys:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> Jangan pernah mengisi **secret key / service role key** di `.env` atau di Vercel. Secret key hanya dipakai sesaat di terminal untuk `npm run setup` dan `npm run restore`. File `.env` sudah diabaikan git.

### 4. Buat akun pemilik

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npm run setup
```

Skrip menampilkan daftar langkah instalasi, lalu meminta **email**, **nama** (tercetak di struk sebagai kasir), dan **password** (minimal 6 karakter) untuk akun pemilik. Tanpa variabel `SUPABASE_*`, skrip hanya menampilkan daftar langkah.

### 5. Deploy Edge Function `manage-accounts`

Fungsi ini dipakai untuk membuat akun, membuat password baru, dan menonaktifkan akun dari Pengaturan → Akun. Pilih salah satu cara:

- **CLI** (tanpa Docker):

  ```bash
  supabase login
  supabase functions deploy manage-accounts --project-ref <project-ref> --use-api
  ```

- **Dashboard**: Edge Functions → Deploy a new function → Via Editor, beri nama `manage-accounts`, lalu tempel isi `supabase/dashboard/manage-accounts.ts`. File ini dibuat dengan `npm run functions:dashboard`; jalankan lagi setiap kali kode fungsinya berubah.

### 6. Deploy aplikasi ke Vercel

1. Import repo ini di Vercel (framework Vite terdeteksi otomatis; build `npm run build`, output `dist`).
2. Isi Environment Variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`, sama seperti `.env`.
3. Deploy. `vercel.json` sudah mengarahkan semua alamat ke aplikasi, jadi refresh di halaman mana pun tetap jalan.

### 7. Siapkan laptop kasir

1. Pasang driver printer BTP-3050, atur ukuran kertas (58/80 mm) dan auto cut di driver, jadikan printer default.
2. Buat shortcut Chrome dengan flag `--kiosk-printing` supaya struk tercetak tanpa dialog, misalnya:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://alamat-kashiru.vercel.app`
3. Aktifkan sinkron waktu otomatis Windows (nomor dan tanggal nota memakai jam laptop).
4. Atur scanner DS2208: buka **Pengaturan → Scanner** di aplikasi untuk langkahnya (barcode setelan ada di panduan resmi Zebra) dan coba **Uji scan**.
5. Buka aplikasi lewat shortcut tadi dan masuk. Semua laptop setara: laptop mana pun yang login bisa membuat nota.

---

## Menjalankan di laptop developer

```bash
npm install
cp .env.example .env   # isi URL dan publishable key Supabase
npm run dev            # http://localhost:5173
```

Untuk mencoba build produksi (termasuk PWA/offline):

```bash
npm run build
npm run preview        # http://localhost:4173
```

Setelah ada migrasi baru, buat ulang tipe database TypeScript dengan `npm run gen:types`.

---

## Data contoh untuk uji

Untuk mencoba semua fitur di project **uji** (bukan project bengkel sungguhan):

1. Pastikan semua migrasi sudah dijalankan dan sudah ada minimal satu akun aktif.
2. Tempel isi [`supabase/seed/dummy-data.sql`](./supabase/seed/dummy-data.sql) di SQL Editor, lalu Run.
3. Refresh aplikasi supaya salinan produk di laptop dimuat ulang.

Isinya: 9 kategori, 4 mekanik, 23 part dan 6 jasa (dengan barcode, kode part, barcode internal), penerimaan dengan barang bonus dan penerimaan void, nota setiap hari selama 30 hari terakhir (semua metode bayar, diskon, nopol, mekanik, nota void), penyesuaian stok, opname dikonfirmasi dan dibatalkan, perubahan harga, serta part berstatus Menipis, Habis, Minus, slow-moving, dan tanpa harga beli.

**Mengosongkan lagi**: tempel [`supabase/seed/reset-data.sql`](./supabase/seed/reset-data.sql) di SQL Editor. Semua data bengkel terhapus (produk, stok, kartu stok, nota, penerimaan, opname, kategori, mekanik, riwayat), sedangkan **akun dan pengaturan tetap ada**. Jangan dijalankan di project sungguhan; data hanya bisa kembali dari backup.

---

## Backup dan pemulihan

Paket Supabase Free tidak menyimpan backup, jadi backup dilakukan manual:

- **Backup**: di laptop, buka **Pengaturan → Backup → Unduh backup** minimal seminggu sekali. Hasilnya satu file `.sql` berisi semua data bengkel; salin ke Google Drive atau flashdisk. Dashboard mengingatkan kalau backup terakhir lebih dari 7 hari lalu. Password akun dan file logo tidak ikut.
- **Pemulihan** ke project Supabase **baru yang kosong** (yang sudah menjalankan semua migrasi):

  ```bash
  SUPABASE_URL=https://yyyy.supabase.co \
  SUPABASE_SECRET_KEY=sb_secret_... \
  SUPABASE_DB_URL='postgresql://postgres.yyyy:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres' \
  npm run restore -- kashiru-backup-bengkel-20261019-2320.sql
  ```

  `SUPABASE_DB_URL` diambil dari tombol **Connect → Session pooler** (koneksi langsung paket Free hanya IPv6). Skrip menolak project yang sudah berisi data, membuat ulang semua akun dengan satu **password sementara**, lalu memulihkan semua data dalam satu transaksi. Setelahnya: deploy `manage-accounts`, ganti URL/kunci di `.env` dan Vercel, setiap orang mengganti password lewat Pengaturan → Akun, dan unggah logo lagi.

Langkah lengkap, termasuk menghidupkan ulang project Free yang berhenti setelah 7 hari tidak aktif, ada di [`docs/installation-guide.md`](./docs/installation-guide.md).

---

## Perintah npm

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan (Vite) |
| `npm run build` | Typecheck dan build produksi (PWA) ke `dist/` |
| `npm run preview` | Menjalankan hasil build secara lokal |
| `npm test` | Test unit dan komponen logika (Vitest) |
| `npm run test:db` | Uji skenario database dengan migrasi asli di Postgres sementara (PGlite), tanpa Supabase lokal |
| `npm run lint` | Pemeriksaan kode (oxlint) |
| `npm run setup` | Daftar langkah instalasi bengkel baru dan pembuatan akun pemilik |
| `npm run restore -- <file>` | Memulihkan file backup ke project Supabase baru yang kosong |
| `npm run gen:types` | Membuat ulang `src/lib/database.types.ts` dari migrasi SQL |
| `npm run functions:dashboard` | Membuat versi satu file Edge Function untuk ditempel di dashboard Supabase |

---

## Pengujian

```bash
npm run lint
npm test                              # Vitest
npm run test:db                       # skenario database (PGlite)
KASHIRU_AUTO_EXPOSE=1 npm run test:db # sama, untuk project lama yang membuka tabel baru otomatis
npm run build
```

- `npm test` mencakup hitungan nota (dengan uji paritas terhadap fungsi SQL), keranjang, nomor nota, antrean nota offline, struk, ekspor, laporan, backup (termasuk uji backup → pulihkan dengan skema asli), dan Edge Function.
- `npm run test:db` menjalankan semua migrasi di Postgres sementara lalu menguji aturan stok, harga beli rata-rata, void, opname, hak akses, laporan, serta data contoh dan pembersihnya. Skrip yang ditempel di SQL Editor diuji dengan hak pemilik tabel yang bukan superuser, seperti di Supabase.

---

## Struktur proyek

```
src/
  app/          shell aplikasi, navigasi, router, status sinkron
  auth/         layar masuk, sesi, logout otomatis
  pos/          Kasir, katalog, keranjang, hitungan nota, struk, antrean offline, Riwayat nota
  products/     Produk, barcode, label
  stock/        Status stok, saran belanja, kartu stok, penyesuaian
  receiving/    Penerimaan barang
  stocktake/    Opname
  dashboard/    Dashboard dan grafik
  reports/      Laporan dan ekspor
  history/      Riwayat perubahan
  settings/     Pengaturan, akun, scanner, backup
  lib/          Supabase, salinan lokal (IndexedDB/Dexie), format, ekspor, cetak, scanner
  components/   komponen bersama dan shadcn/ui
supabase/
  migrations/   SQL yang dijalankan berurutan di SQL Editor
  functions/    Edge Function manage-accounts
  dashboard/    versi satu file Edge Function untuk dashboard
  seed/         data contoh dan pembersihnya
  tests/        uji skenario database (PGlite)
scripts/        setup, restore, gen-types, build-dashboard-function
docs/           panduan instalasi, panduan pemakaian, ADR
```

---

## Hal penting yang disengaja

Beberapa perilaku terlihat seperti kekurangan, padahal disengaja:

- **Mode offline hanya untuk nota.** Saat internet mati, nota tetap dibuat dan struk tetap tercetak; nota disimpan di laptop lalu dikirim otomatis saat online. Menu lain (penerimaan, opname, void, laporan, pengaturan) butuh internet. Jangan hapus data browser di laptop yang masih punya nota belum terkirim.
- **Nomor nota dibuat oleh laptop**, bukan oleh database, supaya tetap jalan offline. Kalau dua laptop memakai nomor yang sama, server memberi nomor kosong berikutnya dan mencatat nomor aslinya.
- **Stok boleh minus**, supaya nota tidak pernah tertahan oleh stok sistem yang belum benar.
- **Nota dan penerimaan tidak pernah diedit**; koreksinya lewat void lalu input ulang. Kartu stok dan riwayat perubahan tidak bisa diubah atau dihapus.
- **Kashiru tidak mengirim email.** Akun dibuat dengan password awal; lupa password dibuatkan password baru oleh akun lain.
- **Semua akun setara.** Tidak ada peran; setiap tindakan tercatat atas nama akun yang login.

Alasan lengkapnya ada di [`docs/adr/`](./docs/adr) dan [`HANDOFF.md`](./HANDOFF.md).

---

## Dokumentasi lain

| Dokumen | Isi |
| --- | --- |
| [`docs/installation-guide.md`](./docs/installation-guide.md) | Panduan instalasi lengkap untuk developer, pemulihan backup, project yang berhenti, pembaruan |
| [`docs/user-guide.md`](./docs/user-guide.md) | Panduan pemakaian untuk pemilik dan kasir |
| [`PRD-Kashiru-revised.md`](./PRD-Kashiru-revised.md) | Spesifikasi produk (sumber kebenaran) |
| [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md) | Fase pengerjaan dan semua keputusan (R1–R56) |
| [`GLOSSARY.md`](./GLOSSARY.md) | Istilah baku di aplikasi dan kode |
| [`docs/adr/`](./docs/adr) | Catatan keputusan arsitektur |
| [`HANDOFF.md`](./HANDOFF.md) | Catatan untuk developer berikutnya |

Desain UI mengikuti taste-skill (`.claude/skills/design-taste-frontend`, gaya `achromatic-ledger`) dengan aturan di PRD bagian 6; token warna dan radius ada di `src/index.css`.
