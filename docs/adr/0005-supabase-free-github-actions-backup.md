# Supabase Free dengan backup harian lewat GitHub Actions

**Status (19/10/2026): backup otomatis ditunda** (R44). User memilih backup manual dari Pengaturan untuk sementara. Bagian tentang paket Free di bawah tetap berlaku.

Kashiru berjalan di paket Supabase Free, termasuk saat dipakai bengkel sungguhan, karena pemilik memilih tidak membayar paket Pro ($25/bulan). Paket Free tidak punya backup otomatis, dan proyeknya berhenti setelah 7 hari tidak aktif (dicek di supabase.com/pricing, 18/10/2026). Sebagai gantinya, sebuah job GitHub Actions menjalankan `supabase db dump` (struktur dan data) setiap malam ke repo GitHub privat. File dump di-commit setiap malam, jadi setiap hari tersimpan di riwayat git (diubah dari "disimpan 30 hari" pada 19/10/2026, R37), dan langkah pemulihannya tertulis di README repo itu.

## Konsekuensi

- Tidak ada Point-in-Time Recovery. Data paling banyak hilang satu hari terakhir, tetapi nota offline yang belum tersinkron tetap ada di Perangkat Kasir.
- Belum terkonfirmasi apakah koneksi harian dari job backup dihitung sebagai aktivitas. Karena itu job juga menulis satu perubahan kecil setiap malam (R40), yang menurut diskusi komunitas Supabase dihitung sebagai aktivitas. Pemilik harus tahu cara menghidupkan ulang proyek dari dashboard Supabase setelah libur panjang.
- Batas database 500 MB. Kalau mendekati batas atau bengkel ingin backup yang lebih aman, pindah ke Pro tanpa perlu mengubah kode.
