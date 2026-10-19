# Panduan instalasi Kashiru

Untuk developer yang memasang Kashiru di sebuah bengkel, memulihkan backup, atau merawat instalasinya. Panduan untuk pemilik dan kasir ada di [`user-guide.md`](./user-guide.md).

Satu instalasi untuk satu bengkel (ADR 0001). Tidak ada Supabase lokal dan tidak perlu Docker: SQL dijalankan di SQL Editor Supabase, dan skrip di laptop cukup memakai Node 22.

## 1. Project Supabase

1. Buat project baru di paket **Free**, di region terdekat. Saat membuat project:
   - centang **Enable Data API**,
   - centang **Enable automatic RLS**,
   - **jangan** centang **Automatically expose new tables**. Hak akses tabel ditulis sendiri di migrasi.
2. Di pengaturan **Authentication** (penyedia Email): matikan **Allow new users to sign up** dan **Confirm email**. Akun hanya dibuat dari aplikasi.
3. **SQL Editor**: jalankan semua file di `supabase/migrations/` satu per satu, berurutan sesuai nama file. File yang sudah dijalankan tidak pernah diubah; perubahan skema selalu berupa file baru.

## 2. Akun pemilik

Ambil URL project dan **secret key** dari Project Settings → API Keys, lalu jalankan di terminal:

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npm run setup
```

Skrip menampilkan langkah instalasi, lalu meminta email, nama (tercetak di struk), dan password pemilik (minimal 6 karakter). Secret key hanya dipakai di terminal itu; jangan simpan di `.env`.

## 3. Edge Function `manage-accounts`

Fungsi ini membuat akun, membuat password baru, dan menonaktifkan akun dengan service role. Deploy salah satu cara:

- CLI tanpa Docker: `supabase login`, lalu `supabase functions deploy manage-accounts --project-ref <ref> --use-api`.
- Dashboard: Edge Functions → Deploy a new function → Via Editor, nama `manage-accounts`, tempel isi `supabase/dashboard/manage-accounts.ts` (dibuat dengan `npm run functions:dashboard`).

Deploy ulang setiap kali kode fungsinya berubah.

## 4. Aplikasi (Vercel)

1. Salin `.env.example` menjadi `.env`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key, bukan secret key).
2. Hubungkan repo ke Vercel dan isi dua variabel yang sama di Project Settings → Environment Variables. Build memakai `npm run build`; `vercel.json` sudah mengarahkan semua alamat ke aplikasi.

## 5. Laptop kasir

1. Pasang driver printer Kassen BTP-3050, atur ukuran kertas (58 atau 80 mm) dan auto cut di driver, lalu jadikan printer default.
2. Buat shortcut Chrome ke alamat aplikasi dengan flag `--kiosk-printing`, supaya struk tercetak tanpa dialog cetak. Contoh target: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://alamat-kashiru.vercel.app`.
3. Aktifkan sinkron waktu otomatis di Windows. Nomor dan tanggal nota memakai jam laptop.
4. Atur scanner Zebra DS2208: mode USB Keyboard (HID) dan layout US English sudah bawaan pabrik, tetapi Enter harus ditambahkan dengan memindai **Add Enter Key (Carriage Return/Line Feed)** dari panduan resmi Zebra. Langkah dan uji scannya ada di Pengaturan → Scanner.
5. Buka aplikasi lewat shortcut tadi lalu masuk. Semua laptop setara (R50): laptop mana pun yang login bisa membuat nota, jadi langkah ini diulang di setiap laptop yang dipakai sebagai kasir.

Setelan rinci printer dan scanner dilengkapi setelah uji perangkat keras (Fase 0).

## 6. Backup

Paket Free tidak menyimpan backup. Backup diunduh manual dari **Pengaturan → Backup** minimal seminggu sekali (R45); Dashboard mengingatkan kalau sudah lebih dari 7 hari (R47). File `.sql` itu sebaiknya disalin ke Google Drive atau flashdisk.

Isinya semua tabel data bengkel. Yang tidak ikut: password akun (tidak bisa dibaca dari browser) dan file logo.

## 7. Pemulihan backup

Pemulihan selalu ke **project Supabase baru yang kosong**, tidak pernah menimpa project yang sedang dipakai. Skrip menolak project yang sudah berisi data.

1. Buat project baru dan atur seperti bagian 1, termasuk menjalankan **semua** migrasi.
2. Ambil tiga hal dari project baru:
   - URL project dan secret key (Project Settings → API Keys),
   - alamat koneksi **Session pooler** dari tombol **Connect** (ganti `[YOUR-PASSWORD]` dengan password database). Koneksi langsung paket Free hanya IPv6, jadi pakai Session pooler.
3. Jalankan:

   ```bash
   SUPABASE_URL=https://yyyy.supabase.co \
   SUPABASE_SECRET_KEY=sb_secret_... \
   SUPABASE_DB_URL='postgresql://postgres.yyyy:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres' \
   npm run restore -- kashiru-backup-bengkel-20261019-2320.sql
   ```

4. Ketik `ya`, lalu satu **password sementara** (minimal 6 karakter). Semua akun dibuat ulang dengan ID dan email yang sama memakai password itu, termasuk akun nonaktif, supaya nota dan riwayat tetap terhubung ke akunnya.
5. Ikuti langkah yang dicetak skrip:
   - deploy `manage-accounts` ke project baru,
   - ganti URL dan publishable key di `.env` dan Vercel, lalu deploy ulang,
   - setiap orang masuk dengan password sementara lalu menggantinya lewat Pengaturan → Akun → **Password baru**,
   - unggah logo lagi di Pengaturan → Profil bengkel,
   - di setiap laptop, masuk lagi.

Nota yang belum terkirim di sebuah laptop tetap tersimpan di laptop itu dan dikirim ke project baru setelah aplikasi memakai alamat baru dan kasir masuk lagi. Nota yang sudah ada di backup tidak tercatat dua kali.

Skrip menjalankan seluruh isi backup dalam satu transaksi. Kalau gagal, tidak ada data yang masuk; perbaiki penyebabnya lalu jalankan lagi (akun yang sudah dibuat dipakai ulang).

## 8. Project yang berhenti

Project paket Free dihentikan Supabase setelah sekitar 7 hari tanpa aktivitas, misalnya saat bengkel libur panjang. Selama berhenti, kasir tetap bisa membuat nota offline di laptop kasir; menu lain butuh server.

Untuk menghidupkannya lagi: buka dashboard Supabase, pilih project itu, lalu tekan **Restore project**. Menurut dokumentasi Supabase, project yang berhenti masih bisa dihidupkan sampai 90 hari. Setelah hidup, nota offline terkirim sendiri.

## 9. Data contoh untuk uji

Untuk mencoba semua fitur di project **uji** (bukan project bengkel sungguhan):

1. Pastikan semua migrasi sudah dijalankan dan sudah ada minimal satu akun aktif.
2. Tempel isi `supabase/seed/dummy-data.sql` di SQL Editor lalu Run. Isinya: 9 kategori, 4 mekanik (satu nonaktif), 23 part dan 6 jasa (dengan barcode, kode part, barcode internal), penerimaan dengan barang bonus dan satu penerimaan void, nota setiap hari kecuali Minggu selama 30 hari terakhir (semua metode bayar, diskon, nopol, mekanik, catatan servis, dua nota void), penyesuaian stok, satu opname dikonfirmasi dan satu dibatalkan, perubahan harga, serta part berstatus Menipis, Habis, Minus, slow-moving, dan tanpa harga beli.
3. Buka ulang aplikasi supaya salinan produk di laptop dimuat ulang.

Untuk mengosongkan lagi, tempel `supabase/seed/reset-data.sql`. Semua data bengkel terhapus kecuali akun dan pengaturan, termasuk kartu stok dan riwayat perubahan, jadi jangan dijalankan di project sungguhan.

## 10. Pembaruan

- Migrasi baru: jalankan file barunya di SQL Editor, lalu `npm run gen:types` di repo.
- Kode aplikasi: push ke repo, Vercel membangun ulang. Laptop kasir mendapat versi baru saat aplikasi dibuka ulang.
- Edge Function: deploy ulang kalau `supabase/functions/manage-accounts` berubah.
