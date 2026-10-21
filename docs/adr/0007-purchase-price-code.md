# Harga beli ditulis sebagai Kode Harga Beli, kolom angka lama tidak dihapus

Pemilik ingin harga beli part tidak bisa dibaca orang lain. Karena itu harga beli diganti **Kode Harga Beli**: huruf kapital yang artinya hanya diketahui pemilik dan tidak pernah dimasukkan ke Kashiru. Kashiru menyimpan satu kode per Part di kolom teks baru, lalu menampilkannya apa adanya. Kode bisa diisi dari form produk dan dari Penerimaan, sedangkan semua harga beli angka baru diisi 0 sebagai pengisi.

Kolom angka lama (`products.harga_beli_avg`, `receipt_items.harga_beli`, `stock_movements.hpp_satuan`, `sale_items.hpp_satuan`) sengaja **tidak dihapus**, walaupun sekarang hanya berisi 0 untuk data baru. Kolom-kolom itu dibaca sekitar 70 tempat di fungsi database, termasuk `checkout_sale` dan pemicu stok, di aplikasi yang sudah live. Menghapusnya berarti menulis ulang kasir dan perhitungan stok, menghapus harga beli lama secara permanen, dan membuat backup lama tidak bisa dipulihkan. Pengecualian terhadap aturan "Supabase tidak diubah setelah live" (R62) hanya untuk fitur ini, dan perubahannya dibatasi ke penambahan kolom serta pelonggaran kewajiban harga beli di fungsi pembuat produk, penerimaan, penyesuaian stok, dan opname. `checkout_sale` tidak disentuh.

## Konsekuensi

- Kashiru tidak tahu nilai rupiah harga beli, jadi laba kotor (laporan dan Dashboard), HPP, nilai persediaan, selisih rupiah opname, total nilai penerimaan, dan peringatan "Di bawah harga beli" di Kasir dihapus dari aplikasi. Data angka lama tetap ada di database kalau tampilan itu suatu saat ingin dikembalikan.
- Harga beli rata-rata di database perlahan menuju 0 karena penerimaan baru bernilai 0. Angka itu tidak lagi bermakna dan tidak boleh ditampilkan.
- Kode hanya disimpan di Part, bukan per penerimaan. Riwayat kode ada di Riwayat perubahan, dan void penerimaan tidak mengembalikan kode lama.
- Semua akun boleh mengubah kode, karena Kashiru tidak punya peran akun. Setiap perubahan tercatat di Riwayat perubahan.

## Opsi yang ditolak

- **Sandi berkunci** (setiap huruf mewakili satu angka menurut kata kunci yang disimpan di Kashiru): laporan tetap bisa dihitung, tetapi pemilik tidak mau kata kuncinya dimasukkan ke Kashiru.
- **Menghapus kolom angka**: risikonya terlalu besar bagi kasir yang sedang dipakai, dan tidak bisa dibatalkan.
- **Kode disimpan di laptop saja**: tidak terlihat di perangkat lain, tidak ikut backup, dan stok awal tetap butuh angka.
