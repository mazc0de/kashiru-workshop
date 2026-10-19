# Login dengan email biasa, tanpa Kashiru mengirim email

Status: accepted, menggantikan [ADR 0004](./0004-username-login.md)

Akun Kashiru login dengan email biasa (misalnya Gmail) dan password di Supabase Auth. Rencana sebelumnya memakai nama pengguna dengan email buatan `@kashiru.local` (ADR 0004), tetapi user memilih email biasa. Meski begitu, Kashiru tidak pernah mengirim email. Akun dibuat dari Pengaturan → Akun dengan password awal dan langsung aktif tanpa konfirmasi email. Kalau ada yang lupa password, akun lain membuat password baru lewat Edge Function yang memakai service role. Pengiriman email (undangan akun dan tautan reset) ditolak karena layanan email bawaan Supabase hanya mengirim ke anggota tim project dan dibatasi 2 email per jam. Akibatnya setiap instalasi harus menyiapkan dan merawat custom SMTP sendiri.

## Konsekuensi

- Layar login tidak punya tautan "Lupa password". Kalau akun aktif tinggal satu dan password-nya terlupa, developer meresetnya dari dashboard Supabase.
- Email tidak diverifikasi. Kalau email salah ketik saat akun dibuat, akun tetap bisa dipakai login dengan email yang salah ketik itu.
- Pendaftaran publik di Supabase Auth dimatikan. Akun hanya bisa dibuat lewat Edge Function.

## Catatan 19/10/2026 (R46)

Login sempat diubah menjadi email + PIN 6 angka karena maksud user salah ditangkap, lalu dikembalikan ke email + password atas permintaan user. Keputusan di atas tetap berlaku apa adanya.
