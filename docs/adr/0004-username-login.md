# Login dengan nama pengguna di atas Supabase Auth email

Status: superseded oleh [ADR 0006](./0006-email-login-without-sending-email.md). Login sekarang memakai email biasa.

Kasir bengkel sering tidak punya email aktif, jadi Kashiru memakai login nama pengguna + password. Di belakang layar setiap akun tetap user Supabase Auth dengan email buatan `{nama_pengguna}@kashiru.local`, dengan konfirmasi email dimatikan. Reset password lewat email tidak dipakai. Akun mana pun bisa membuat password baru untuk akun lain dari Pengaturan, lewat Edge Function yang memakai service role. Supabase Auth tetap dipakai, bukan tabel login buatan sendiri, supaya sesi, refresh token, dan `auth.uid()` untuk RLS tetap tersedia.
