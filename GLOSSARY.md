# Kashiru

Aplikasi kasir dan stok untuk satu bengkel motor/mobil yang juga menjual sparepart.

## Bahasa

Istilah di bawah dipakai di teks aplikasi dan percakapan. Nama di kode memakai padanan Inggris pada baris _Di kode_ (R26); daftar _Hindari_ berlaku untuk teks dan percakapan, bukan untuk nama di kode.

**Bengkel**:
Satu usaha servis dan penjualan sparepart yang memakai satu instalasi Kashiru.
_Di kode_: workshop
_Hindari_: toko, outlet, cabang, tenant

**Nota**:
Catatan satu penjualan part dan/atau jasa yang dibuat di kasir saat pelanggan membayar, setelah servis selesai.
_Di kode_: sale; struknya receipt
_Hindari_: transaksi, sale, faktur, work order

**Keranjang**:
Daftar Part dan Jasa satu kendaraan yang ditunda di laptop dengan Keterangan Nota sebagai penanda, untuk dibuka lagi dan dibayar nanti. Keranjang belum punya nomor, belum mengurangi stok, dan tidak terlihat dari laptop lain. Isian yang sedang tampil di layar Kasir bukan keranjang; isian itu menjadi keranjang setelah ditambahkan ke keranjang.
_Di kode_: cart (daftarnya saved carts); isian layar draft
_Hindari_: nota ditahan, draft nota, keranjang ditahan, cart

**Produk**:
Sebutan umum untuk semua yang bisa masuk ke nota, yaitu Part dan Jasa.
_Di kode_: product
_Hindari_: barang, item, SKU (untuk produknya)

**Part**:
Produk fisik yang punya stok, misalnya oli, kampas rem, busi, atau baut.
_Di kode_: part
_Hindari_: sparepart, barang, onderdil

**Jasa**:
Produk tanpa stok berupa pekerjaan servis, misalnya ganti oli, tune up, atau servis CVT.
_Di kode_: service
_Hindari_: barang jasa, layanan

**Mekanik**:
Orang yang mengerjakan Jasa dan bukan pengguna aplikasi. Satu nota mencatat paling banyak satu mekanik, dan boleh dikosongkan.
_Di kode_: mechanic
_Hindari_: teknisi, montir

**Pelanggan**:
Nama orang yang dicatat di nota, opsional. Pelanggan bukan data master dan tidak punya golongan harga.
_Di kode_: customer
_Hindari_: customer, member

**Nopol**:
Nomor polisi kendaraan yang dicatat di nota, opsional, dan dipakai untuk mencari riwayat servis.
_Di kode_: plate
_Hindari_: plat nomor, TNKB

**Keterangan Nota**:
Teks bebas penanda kendaraan atau pemiliknya, misalnya "Vario hitam" atau "Pak Budi". Wajib saat isian layar ditambahkan ke Keranjang, dan menjadi nama keranjang itu. Tercetak di struk, tetapi tidak tersimpan di riwayat nota. Berbeda dari catatan servis, yang berisi pesan untuk servis berikutnya.
_Di kode_: description
_Hindari_: kendaraan, catatan nota

**Barcode Internal**:
Barcode berisi angka urut yang dibuat Kashiru untuk Part tanpa barcode pabrik, misalnya baut, lalu dicetak sebagai label di printer struk.
_Di kode_: internal barcode
_Hindari_: label custom, barcode toko

**Penerimaan**:
Pencatatan Part yang masuk pada suatu tanggal, dengan qty dan harga beli per baris. Penerimaan adalah satu-satunya jalan stok masuk selain penyesuaian.
_Di kode_: receiving
_Hindari_: pembelian, PO, barang masuk, faktur

**HPP**:
Harga beli rata-rata sebuah Part pada saat terjual. HPP disimpan di setiap baris nota sebagai dasar laba kotor.
_Di kode_: cogs; harga beli rata-rata avg cost
_Hindari_: modal, harga pokok, cost

**Sesi Opname**:
Penghitungan fisik stok Part, penuh atau per kategori. Hasilnya baru mengubah stok setelah dikonfirmasi, dan selisihnya dibandingkan dengan stok sistem pada waktu tiap Part dihitung.
_Di kode_: stocktake
_Hindari_: stock take, cek stok, hitung stok

**Void**:
Pembatalan seluruh nota atau seluruh penerimaan. Ini satu-satunya cara memperbaiki keduanya, karena tidak pernah diedit dan bengkel tidak menerima retur.
_Di kode_: void
_Hindari_: retur, refund, batal sebagian, edit nota

**Penyesuaian Stok**:
Perubahan stok manual di luar nota, penerimaan, dan opname, misalnya untuk barang rusak atau hilang, selalu disertai alasan.
_Di kode_: stock adjustment
_Hindari_: koreksi stok, edit stok

**Metode Bayar**:
Catatan cara pelanggan membayar satu nota: Tunai, QRIS, Transfer, atau EDC. Satu nota hanya punya satu metode bayar. Kashiru tidak terhubung ke penyedia pembayaran mana pun.
_Di kode_: payment method
_Hindari_: payment, split payment, tipe bayar

**Nota Belum Terkirim**:
Nota yang sudah dibayar dan struknya sudah tercetak, tetapi baru tersimpan di laptop yang membuatnya dan belum tercatat di server. Dikirim otomatis saat online.
_Di kode_: unsent sale (antrean: sale outbox)
_Hindari_: nota pending, nota draft

**Nota Gagal Terkirim**:
Nota Belum Terkirim yang ditolak server saat dikirim. Tetap tersimpan di laptop yang membuatnya, tidak bisa dihapus, dan bisa dicoba lagi atau dicetak sebagai bukti.
_Di kode_: failed sale
_Hindari_: nota error, nota rusak

**Backup**:
Satu file berisi semua data bengkel yang diunduh dari Pengaturan, untuk dipulihkan ke database baru kalau database lama rusak atau hilang. Password akun dan logo tidak ikut.
_Di kode_: backup; pemulihannya restore
_Hindari_: ekspor (untuk backup), cadangan
