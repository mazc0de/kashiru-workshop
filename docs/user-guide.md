# Panduan pemakaian Kashiru

Untuk pemilik dan kasir bengkel. Semua akun setara: setelah masuk, semua menu terbuka. Layar Kasir, Produk, Penerimaan, Opname, Saran belanja, kartu stok, dan Pengaturan dibuat untuk laptop. Di HP, Dashboard, Riwayat nota, Status stok, Laporan, dan Riwayat perubahan bisa dibuka dengan nyaman.

## Masuk dan password

- Masuk dengan **email** dan **password**.
- Mengganti password sendiri: Pengaturan → Akun → tombol ⋯ di baris akun Anda → **Password baru**.
- Lupa password: minta orang lain di bengkel membuatkan password baru dari Pengaturan → Akun. Kashiru tidak mengirim email.
- **Ganti akun** di pojok kiri bawah dipakai saat bergantian kasir. Butuh internet.
- Kalau aplikasi tidak dipakai selama waktu di Pengaturan → Keamanan (bawaan 12 jam), akun keluar sendiri. Saat offline, keluar otomatis ditunda.

## Kasir (laptop)

Laptop mana pun bisa dipakai sebagai kasir; nota mencatat akun yang sedang masuk. Scan barcode atau ketik nama produk, lalu bayar. Semua aksi lewat tombol, tanpa pintasan keyboard:

| Tombol | Fungsi |
| --- | --- |
| Katalog | Pilih part dari kotak-kotak per kategori; klik kotak atau + menambah 1, − mengurangi 1 (di qty 1, barang keluar dari layar) |
| Jasa | Pilih jasa dari kotak-kotak seperti Katalog, atau ketik **jasa manual** (nama + tarif) untuk jasa yang belum ada di menu Jasa |
| Ubah (Data nota) | Nopol, pelanggan, keterangan, mekanik, catatan servis |
| − / + dan × di tiap baris | Kurangi atau tambah qty, hapus baris. Klik angka qty untuk mengetik qty (mis. 1,5 liter) |
| Ubah qty, Diskon, Diskon nota | Untuk baris yang dipilih (klik barisnya) atau seluruh nota |
| Bayar | Pilih metode bayar, lalu Bayar dan cetak |
| Tambah ke keranjang | Tunda isian layar dengan keterangan, lalu layar bersih untuk pelanggan berikutnya |
| Ikon keranjang (kanan atas) | Lihat dan buka keranjang yang ditunda |
| Cetak ulang | Cetak ulang struk terakhir |
| Kosongkan | Buang isian layar yang batal, setelah konfirmasi |

**Menunda motor yang sedang diservis.** Contoh: motor A mau ganti oli, jadi oli di-scan. Lalu motor B datang untuk ganti roller. Tekan **Tambah ke keranjang**, isi **Keterangan** untuk menandai motor A (mis. "Vario hitam"), lalu **Tambahkan**. Layar bersih dan siap untuk motor B.

Saat mekanik minta kampas rem untuk motor A, klik **ikon keranjang** di kanan atas, pilih "Vario hitam" di daftar kiri (isinya tampil di kanan), lalu **Buka keranjang**. Kalau layar masih berisi barang motor B, Kashiru meminta keterangan untuk motor B dulu, supaya tidak ada yang hilang. Isi motor A pindah ke layar. Scan kampas remnya, lalu **Bayar** kalau motornya sudah selesai, atau **Tambah ke keranjang** lagi.

- Keterangan selalu wajib dan tidak boleh sama dengan keranjang lain. Kalau nopol atau nama pelanggan sudah diisi, keterangan langsung terisi dengan nilai itu.
- Angka merah di ikon keranjang adalah jumlah motor yang sedang menunggu. Keranjang yang sedang dibuka di layar tidak dihitung.
- Keranjang tersimpan di laptop itu, tetap ada walaupun browser ditutup, internet mati, atau ganti akun, tetapi tidak terlihat dari laptop lain.
- Harga part diperbarui ke harga terbaru setiap kali keranjang dibuka. Kalau harga berubah tepat saat Bayar ditekan, layar diperbarui dulu; periksa lalu tekan Bayar lagi.
- Kalau part yang sama sudah ada di keranjang motor lain dan stoknya tidak cukup untuk semuanya, muncul peringatan yang menyebut keranjangnya. Katalog juga menulis, misalnya, "1 di keranjang".
- **Keterangan** dicetak di struk, tetapi tidak tersimpan di Riwayat nota. Tulis nopol kalau kendaraannya ingin muncul di riwayat servis.

**Jasa manual** hanya tercatat di nota itu dan tidak masuk menu Jasa. Tarifnya boleh Rp 0, dan bisa diubah lagi di layar seperti jasa lain. Di laporan, jasa manual masuk omzet jasa dengan kategori "Jasa manual". Kalau jasa yang sama sering dipakai, tambahkan saja di menu Jasa.

**Diskon per barang** diketik langsung di kolom Diskon: `2000` berarti Rp 2.000 untuk baris itu, `10%` berarti 10 persen, kosongkan untuk menghapus. Tekan Enter atau klik di luar isian untuk menerapkan. Kalau isiannya salah, muncul pesan merah dan diskon lama tetap berlaku. Kalau harganya jadi di bawah harga beli, baris diberi tanda kuning.

Stok boleh minus; nota tidak pernah tertahan karena stok sistem.

Kalau scan tidak masuk ke keranjang, buka Pengaturan → **Scanner** dan coba **Uji scan**. Halaman itu menunjukkan setelan scanner yang perlu diperbaiki.

## Saat internet mati

- Kasir tetap bisa membuat nota dan mencetak struk. Nota tersimpan di laptop yang membuatnya dan **terkirim sendiri** saat internet kembali.
- Tanda kuning di pojok kiri bawah menunjukkan berapa nota belum terkirim. Tanda merah berarti ada nota yang **ditolak server**: buka Riwayat nota, bagian Belum terkirim, lalu tekan **Coba lagi** atau cetak sebagai bukti.
- **Jangan menghapus data browser, jangan memakai jendela samaran, dan jangan mengganti browser** di laptop itu selama masih ada nota belum terkirim. Nota itu hanya ada di laptop tersebut.
- Laporan, penerimaan, opname, dan void butuh internet.

## Riwayat nota

- Cari nota per tanggal, atau lewat nomor, nopol, atau nama pelanggan.
- Buka nota untuk **cetak ulang** (bertanda SALINAN) atau **void**. Void membatalkan seluruh nota, wajib alasan, dan stok part kembali. Nota tidak bisa diedit; kalau salah, void lalu buat nota baru.
- **Cetak ringkasan harian** mencetak jumlah nota, omzet part dan jasa, total per metode bayar, dan nota void untuk tanggal yang dipilih.

## Produk

- Tambah part dari menu Produk, dan jasa dari menu **Jasa**. Part bisa punya beberapa barcode dan kode part. Part tanpa barcode pabrik bisa dibuatkan **barcode internal** lalu dicetak labelnya.
- Produk tidak pernah dihapus; nonaktifkan kalau tidak dijual lagi.
- Menu **Label barcode** menampilkan semua barcode internal part aktif. Centang part yang labelnya mau ditempel, isi jumlah label per part, lalu **Cetak**. Semua label keluar dalam satu gulungan dan kertas dipotong sekali di akhir.

## Stok

- **Status stok**: Aman, Menipis, Habis, Minus. Ketuk angka di atas untuk memfilter. Juga bisa dibuka dari angka di Dashboard.
- **Saran belanja** (laptop): part yang perlu dibeli dengan usulan qty, bisa dicetak atau diekspor ke Excel.
- **Kartu stok**: buka dari nama part. Penyesuaian stok (rusak, hilang, ketemu, salah input, lainnya) dibuat dari sini.

## Penerimaan barang

Isi tanggal masuk (bawaan hari ini), lalu cari atau scan barangnya. Setiap scan menambah qty 1, atau ketik qty-nya. Harga beli otomatis terisi harga beli terakhir; ubah hanya kalau harganya berubah. Lalu simpan. Barang bonus diisi harga Rp 0. Penerimaan tidak bisa diedit; kalau salah, void lalu buat lagi.

## Opname

1. Buka sesi **penuh** (semua part) atau **per kategori**. Sebelum menghitung, pastikan semua laptop yang dipakai kasir sudah online dan tidak punya nota belum terkirim.
2. Hitung dengan scan (setiap scan +1) atau ketik qty. Bisa juga cetak **lembar hitung**, isi di kertas, lalu ketik hasilnya.
3. **Tinjau**: part yang belum dihitung dianggap 0 atau dilewati; setiap selisih wajib diberi alasan.
4. **Konfirmasi** untuk mengubah stok, atau **Batalkan** sesi. Hasilnya bisa diekspor ke PDF atau Excel.

## Dashboard dan Laporan

- **Dashboard**: omzet hari ini (part dan jasa), laba kotor, jumlah nota dan kendaraan, grafik 30 hari, dan jumlah part Menipis/Habis/Minus.
- **Laporan**: Penjualan, Laba kotor, Jasa per mekanik, Riwayat servis (per nopol), Stok, Penerimaan, dan Opname. Pilih periode di atas; semua laporan bisa diekspor ke **Excel** dan **PDF**.
- Omzet adalah yang dibayar pelanggan setelah semua diskon. Nota dan penerimaan yang di-void tidak dihitung.

## Riwayat perubahan

Semua perubahan atas data yang sudah ada tercatat: harga, produk, void, penyesuaian, opname, akun, dan pengaturan. Bisa difilter per akun, periode, dan jenis aksi. Catatan tidak bisa diedit atau dihapus.

## Backup mingguan

1. Di laptop, buka Pengaturan → **Backup**, lalu tekan **Unduh backup**. Sebaiknya saat kasir tidak sedang membuat nota.
2. Salin file `kashiru-backup-....sql` dari folder Unduhan ke **Google Drive atau flashdisk**. File di laptop ikut hilang kalau laptop rusak.
3. Ulangi minimal **seminggu sekali**. Dashboard mengingatkan kalau backup terakhir sudah lebih dari 7 hari.

File backup berisi semua data bengkel, termasuk nama dan nopol pelanggan, jadi simpan di tempat yang aman. Pemulihan dilakukan developer.
