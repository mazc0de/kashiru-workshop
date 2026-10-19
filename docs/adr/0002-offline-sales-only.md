# Mode offline hanya untuk membuat nota

Saat internet putus, Kashiru tetap bisa membuat nota dan mencetak struknya. Pembayarannya boleh memakai metode apa pun kecuali tempo. Nota disimpan dalam antrean di IndexedDB, lalu dikirim lewat RPC checkout yang sama begitu online. Modul lain wajib online: penerimaan, opname, master produk, void, dan pengaturan. Tanggal nota adalah waktu nota dibuat menurut jam Perangkat Kasir (WIB), tanpa mekanisme buka/tutup hari. Offline penuh ditolak karena butuh sinkronisasi dua arah dan cara menyelesaikan konflik di modul yang menyentuh stok. Tanpa offline sama sekali juga ditolak, karena internet bengkel tidak stabil dan kasir tidak boleh berhenti berjualan.

## Konsekuensi

- Bengkel hanya memakai satu komputer untuk kasir, input stok, cetak, scan, dan opname. Tidak ada tablet opname dan tidak ada realtime antarperangkat.
- Nota hanya bisa dibuat di perangkat yang terdaftar sebagai Perangkat Kasir. Perangkat itu memegang nomor urut nota, jadi nomor yang dibuat saat offline tidak bisa bentrok. Login dari perangkat lain, misalnya HP pemilik untuk melihat laporan, tetap bisa, tetapi tidak bisa checkout.
- Format nomor nota adalah `{AWALAN}-{YYYYMMDD}-{URUT}`, misalnya `KSR-20261018-0001`, tanpa kode perangkat. Nomor dibuat oleh Perangkat Kasir, online maupun offline. Saat online, nomor urut dicocokkan dengan nomor terakhir di server, dan unique constraint menolak nomor ganda. Mengganti awalan tidak mengulang nomor urut.
- Nota offline membawa id akun pembuatnya. Saat sinkron, server tidak mengisi `user_id` dari `auth.uid()` milik akun yang sedang login, tetapi memvalidasi bahwa id pembuat itu ada, meskipun akunnya sekarang nonaktif. Ganti akun tidak bisa dilakukan saat offline.
- Server sengaja longgar terhadap nota offline. Nota dari laptop yang dulu menjadi Perangkat Kasir tetap diterima, asalkan dibuat selama masa tugasnya. Nomor yang ternyata sudah terpakai diganti dengan nomor kosong berikutnya, dan nomor aslinya disimpan. Nota yang tetap ditolak tidak bisa dihapus dari aplikasi, hanya dicoba lagi atau dicetak sebagai bukti.
- Dokumen lain (penerimaan, opname) selalu dibuat saat online dan memakai counter di database. Awalannya juga bisa diatur di Pengaturan.

## Pembaruan 19/10/2026: semua laptop setara (R50)

Konsep Perangkat Kasir dihapus atas keputusan user: siapa pun yang login bisa membuat nota dari laptop mana pun, online maupun offline, dan yang dibedakan hanya akun yang login. Nomor nota tetap dibuat laptop yang membuat nota, tanpa kode perangkat. Kalau dua laptop memakai nomor yang sama (keduanya offline, atau membayar di detik yang sama), server memberi urut kosong berikutnya dan menyimpan nomor aslinya; struk yang sudah tercetak tetap memakai nomor asli. Saat offline, stok di salinan tiap laptop hanya dikurangi nota dari laptop itu sendiri. Konsekuensi di atas tentang satu Perangkat Kasir tidak berlaku lagi; tabel `cashier_devices` disimpan sebagai riwayat.
