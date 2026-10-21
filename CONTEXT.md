# Konteks Sesi Desain Kashiru

Log sesi tanya-jawab desain (grilling) pada 18/10/2026 antara user (Daffa) dan Claude. Sesi ini mengubah `PRD-Kashiru.md` menjadi `PRD-Kashiru-revised.md`.

File ini menyimpan **alasan dan opsi yang ditolak**, yang tidak tertulis di PRD. Spesifikasi tetap di [`PRD-Kashiru-revised.md`](./PRD-Kashiru-revised.md), istilah di [`GLOSSARY.md`](./GLOSSARY.md), dan keputusan besar di [`docs/adr/`](./docs/adr). Kalau ada perbedaan antara file ini dan PRD revisi, PRD revisi yang berlaku.

## Arah besar dari user

Kutipan jawaban yang membentuk cakupan. Setiap usulan baru sebaiknya dicek terhadap kutipan ini:

- _"Satu bengkel, satu database"_
- _"karena skala bengkel nya masih kecil jadi hanya ada satu perangkat komputer yang bertugas sebagai kasir juga serta input stok, print, scan, dll"_
- _"catat di akhir saja, jadi flow nya motor/mobil masuk lalu servis, lalu jika sudah baru totalan di akhir lalu bayar"_
- _"tidak ada retur barang"_
- _"tidak ada menanisme buka tutup, catat tanggal nota saat nota itu dibuat"_
- _"tidak ada kas, aplikasi ini hanya untuk mencatat penjualan kasir"_
- _"tidak ada SKU, saat nambah stok part juga tidak ada SKU"_
- _"metode bayar hanya sebagai catatan saja agar di record di transaksi dan di nota, tidak bisa split payment"_
- _"untuk supabase pakai yang gratisan saja"_

Pola yang terlihat: setiap kali Claude mengusulkan mekanisme tambahan (WO, buka/tutup hari, kas, SKU, impor Excel, Supabase Pro, kategori bawaan), user memilih yang lebih sederhana. Kalau sebuah usulan ditolak, jangan diajukan lagi tanpa alasan baru.

## Cara membaca log

- **Jawaban** "ya" berarti rekomendasi Claude diterima apa adanya.
- **Saran ditolak** dan **diubah** menandai jawaban yang berbeda dari rekomendasi. Baris-baris ini paling penting, karena opsi yang ditolak tidak muncul di PRD.
- Q5, Q7, dan Q21 diajukan dua kali (a/b). Versi pertama gugur karena jawaban user mengubah premisnya.
- Di awal sesi, Claude sempat mengajukan 15 pertanyaan sekaligus. User meminta _"tanya satu per satu"_, dan sejak itu satu pertanyaan per pesan.

## Fase 1: membentuk cakupan (Q1–Q39)

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| Q1 | Model instalasi | Satu bengkel atau produk banyak bengkel. Saran: satu instalasi = satu project Supabase, tanpa `tenant_id` | Ya: "Satu bengkel, satu database" | ADR 0001 |
| Q2 | Kedalaman offline | (a) tanpa offline, (b) hanya penjualan di POS, (c) offline penuh. Saran: (b) | Ya: (b) | ADR 0002 |
| Q3 | Nomor nota offline | Saran: kode perangkat di nomor (`KSR-…-A-0001`), karena sequence DB tidak bisa dipakai saat offline | Diubah: awalan nomor bisa diatur di Pengaturan | PRD 4.6, 4.14 |
| Q4 | Awalan dokumen lain | Saran: semua awalan bisa diatur, hanya nota yang memakai kode perangkat | **Saran ditolak**: "gausah ada kode perangkat" | Memicu Q5 |
| Q5a | Satu perangkat kasir | Tanpa kode perangkat, nomor bisa bentrok. Saran: hanya satu Perangkat Kasir yang boleh membuat nota | "hanya ada satu perangkat saja" (ambigu) | Memicu Q5b |
| Q5b | Satu perangkat untuk semua | Satu laptop/PC untuk kasir dan opname. Tablet dan realtime dihapus. Pengaman: nota hanya dari Perangkat Kasir | Ya: satu komputer untuk kasir, stok, cetak, dan scan | Istilah Perangkat Kasir, ADR 0002 |
| Q6 | Kapan stok part WO berkurang | (a) saat bayar, opname mengurangi stok dipesan; (b) saat part keluar untuk dikerjakan. Saran: (b) | **Saran ditolak**: "tidak ada rak, potong saat bayar" | Istilah "rak" diganti "stok fisik" |
| Q7a | Opname saat WO belum dibayar | Saran: pembanding opname = stok − part ditahan WO yang sudah dikerjakan | User bingung: "apa itu WO" | Memicu Q7b |
| Q7b | Perlu WO atau tidak | Penjelasan WO. Saran: tanpa WO, cukup nota langsung dengan tahan nota | Ya, lebih sederhana lagi: "catat di akhir saja" | ADR 0003. Konsep stok ditahan hilang |
| Q8 | Stok minus | Saran: boleh minus, ditandai di dashboard, rata-rata tidak dihitung ulang saat stok ≤ 0 | Ya | PRD 4.3 |
| Q9 | Stok rusak | (a) dua saldo Baik/Rusak; (b) langsung keluar sebagai mutasi rusak. Saran: (b) | **Saran ditolak**: "tidak ada retur barang" | Retur kedua arah dan klaim garansi dihapus. Barang rusak lewat penyesuaian stok |
| Q10 | Void nota | Saran: void seluruh nota dari tanggal mana pun, stok kembali pada tanggal void, nota tidak pernah diedit | Ya | PRD 4.7 |
| Q11 | Buka/tutup hari | Saran: nota hanya saat hari dibuka, tanggal bisnis = hari yang dibuka, rumus kas seharusnya | **Saran ditolak**: tidak ada buka/tutup, tanggal nota = waktu dibuat | Modul tutup hari dihapus |
| Q12 | Kas keluar & laporan harian | Saran: kas keluar tetap dicatat, laporan harian dengan tunai bersih | **Saran ditolak**: "tidak ada kas" | Prinsip cakupan PRD 1 |
| Q13 | Modul yang tetap | Tabel usulan per modul (tetap/hapus) | **Diubah**: nama pelanggan & nopol ada tapi opsional; mekanik & jasa ada tapi opsional; **tambahan**: barcode buatan sendiri dicetak di Kassen; bertanya "tahan nota maksudnya apa" | PRD 3, 4.9 |
| Q14 | Tahan nota | Penjelasan + saran: keranjang bisa ditahan, tanpa nomor, tidak mengurangi stok, disimpan lokal | Ya | Istilah Keranjang |
| Q15 | Ubah harga di kasir | Saran: harga jasa bebas diubah; harga part hanya lewat diskon | Ya | PRD 4.6 |
| Q16 | Mekanik | (a) satu mekanik per nota; (b) per baris jasa. Saran: (a) + laporan jasa per mekanik | Ya | Komisi tetap dihapus |
| Q17 | Penerimaan barang | Saran: supplier sederhana, scan, harga beli terakhir, tanpa PO | Ya | PRD 4.4 |
| Q18 | Salah input harga beli | (a) void penerimaan; (b) edit rata-rata di master. Saran: (a) | Ya | Void berlaku untuk penerimaan |
| Q19 | Penjualan selama opname | Saran: tetap boleh; selisih = hitung − stok sistem pada waktu part dihitung | Ya | PRD 4.5 |
| Q20 | Bentuk sesi opname | Saran: penuh/kategori, tanpa cycle count, blind count, part belum dihitung dianggap 0 atau dilewati | Ya | PRD 4.5 |
| Q21a | Isi barcode internal | Saran: barcode internal = SKU (Code128) | **Saran ditolak**: "tidak ada SKU" | SKU dihapus dari seluruh desain |
| Q21b | Barcode internal tanpa SKU | Saran: angka urut otomatis (`200001`) Code128. Hanya angka karena Caps Lock bisa membalik huruf; label tanpa harga | Ya | PRD 4.9 |
| Q22 | Data produk | Tabel kolom Part vs Jasa. Pembeda: nama + merek unik | Ya | PRD 4.2 |
| Q23 | Data awal | Saran: impor Excel/CSV + mutasi stok awal + opname awal | **Saran ditolak**: input manual satu per satu di Kashiru | Impor Excel dihapus |
| Q24 | Stok awal | (a) kolom stok awal di form part baru; (b) lewat penerimaan. Saran: (a) + alur "Simpan & berikutnya" dengan scanner | Ya | PRD 4.2 |
| Q25 | Metode bayar | Saran: split payment, QRIS statis, referensi untuk transfer/EDC | **Diubah**: metode hanya catatan, tanpa split, tunai dengan input uang dan kembalian | Istilah Metode Bayar |
| Q26 | PPN | Saran: tanpa PPN | Ya: "untuk saat ini gaada PPN" | PPN ditambahkan kalau kelak menjadi PKP |
| Q27 | Diskon | Saran: per baris & per nota, peringatan di bawah HPP, tanpa log terpisah | Ya | PRD 4.6 |
| Q28 | Ukuran kertas | Satu printer = satu gulungan. Saran: satu ukuran, 80mm | **Diubah**: "bisa custom ukuran di setting" (58/80, default 80) | PRD 4.10 |
| Q29 | Cara cetak | Saran: hanya driver Windows + kiosk printing; tanpa QZ Tray, laci otomatis, struk digital | Ya (Windows, USB) | PRD 7.3 |
| Q30 | Isi struk | Contoh struk 48 kolom, baris kosong tidak dicetak, tanpa QR | Ya | PRD 4.10 |
| Q31 | Status stok | Saran: Aman/Menipis/Habis/Minus, Overstock dihapus, saran belanja | Ya | PRD 4.3 |
| Q32 | Laporan & dashboard | Daftar dashboard + 7 laporan + ringkasan harian tanpa kas | Ya | PRD 4.11 |
| Q33 | Login | Saran: nama pengguna + password (email buatan `@kashiru.local`), reset oleh akun lain | Ya | ADR 0004 |
| Q34 | Riwayat perubahan | Daftar aksi yang dicatat, append-only, produk tidak bisa dihapus | Ya | PRD 4.12 |
| Q35 | Perilaku offline | Salinan lokal, tanda offline, sinkron otomatis, logout ditunda saat offline | Ya | PRD 4.13 |
| Q36 | Versi teknologi | React 19, Tailwind v4, PWA wajib, Realtime tidak dipakai, Vercel | Ya | PRD 7.1 |
| Q37 | Paket Supabase | Fakta: Free tanpa backup, berhenti setelah 7 hari tidak aktif; PITR bukan bawaan Pro. Saran: Pro | **Saran ditolak**: "pakai yang gratisan saja" | Memicu Q38 |
| Q38 | Backup di paket Free | Saran: `supabase db dump` harian lewat GitHub Actions ke repo privat, disimpan 30 hari | Ya | ADR 0005 |
| Q39 | Opname dengan satu komputer | Saran: lembar hitung cetak + input cepat + scan | Ya; komputernya **laptop** | PRD 4.5 |

## Fase 2: detail setelah PRD revisi ditulis (Q40–Q53)

Setelah PRD revisi pertama ditulis, Claude melaporkan beberapa detail yang ia isi sendiri. User menjawab _"langsung tanyakan saja apabila masih punya pertanyaan"_. Sejak itu semua detail ditanyakan.

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| Q40 | Nota offline gagal terkirim | Server longgar (akun nonaktif dan Perangkat Kasir lama tetap diterima, nomor bentrok diganti). Nota gagal tidak bisa dihapus | Ya | Tabel `cashier_devices`, `sales.nomor_asli` |
| Q41 | Opname saat ada nota belum terkirim | Saran: input hitungan diblokir sampai antrean kosong | Ya | PRD 4.5 |
| Q42 | Desimal qty pecahan | 1, 2, atau 3 angka. Saran: 2 | Ya | PRD 4.2 |
| Q43 | Pintasan keyboard | Tabel F2–F12, panah, +/−, Delete, Esc; F6 untuk tahan keranjang | Ya | PRD 4.6 |
| Q44 | Format nomor dokumen | `TRM-…-0001`, `OPN-…-01` | Ya: "untuk kode depan bisa disetting" | PRD 4.14 |
| Q45 | Batalkan sesi opname | Saran: sesi terbuka bisa dibatalkan tanpa mengubah stok; yang sudah dikonfirmasi tidak bisa | Ya | PRD 4.5 |
| Q46 | Jumlah part saat go-live | Perkiraan ±1 menit per part. Saran: input manual, asumsi < 1.000 part | Ya | Asumsi terbuka di PRD 10 |
| Q47 | Penulisan nopol | Format baku huruf besar, pencarian abaikan spasi, nama pelanggan terisi otomatis dari nota terakhir | Ya | PRD 4.6 |
| Q48 | Instalasi | (a) skrip setup oleh developer; (b) layar daftar pemilik di aplikasi. Saran: (a), karena (b) bisa direbut orang pertama yang membuka URL | Ya | PRD 7.7 |
| Q49 | Harga berubah saat keranjang ditahan | Saran: harga part diperbarui ke harga terbaru saat dibuka lagi, baris berubah ditandai | Ya | PRD 4.6 |
| Q50 | Kategori awal | Saran: skrip membuat 15 kategori umum bengkel | **Saran ditolak**: "kosongi saja" | PRD 7.7 |
| Q51 | Membuat kategori dari form produk | Saran: "+ Buat kategori '…'" langsung di form | Ya | PRD 4.2 |
| Q52 | Supplier & mekanik dari form | Pola yang sama; mekanik baru tidak bisa dibuat saat offline | Ya | PRD 4.4, 4.6 |
| Q53 | Tampilan di HP pemilik | Saran: dashboard, laporan, dan riwayat nota responsif; layar lain hanya untuk laptop | Ya | PRD 6 |

## Fase 3: celah yang ditemukan saat cek ulang (Q54–Q58)

Claude sempat menyatakan sesi selesai. User bertanya _"apakah kamu tidak ada yg mau ditanyakan lagi?"_, lalu pembacaan ulang PRD menemukan celah berikut.

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| Q54 | Stok awal tanpa harga beli | Rata-rata Rp 0 menghasilkan laba 100% palsu. Saran: harga beli wajib kalau stok awal diisi | Ya | PRD 4.2 |
| Q55 | Tanggal penerimaan mundur | Saran: tanggal faktur hanya keterangan; mutasi dibukukan saat disimpan | Ya | `receipts.tanggal_faktur` + `dibuat_pada` |
| Q56 | Stok masuk selain penerimaan | Void nota masuk dengan HPP asal; opname lebih dan penyesuaian tambah pakai rata-rata saat itu; part tanpa rata-rata wajib diisi harga beli | Ya | PRD 4.3, 4.5 |
| Q57 | Perubahan data dari HP pemilik | Saran: laptop memeriksa perubahan setiap 1 menit | **Saran ditolak**: "tidak ada kasus seperti itu" | Tanpa pemeriksaan berkala. Data master hanya diubah di laptop |
| Q58 | File konteks sesi | (a) ganti nama GLOSSARY; (b) log sesi terpisah; (c) gabung | (b) | File ini |

## Sesi 21/10/2026: banyak keranjang di Kasir (K1–K17)

Studi kasus dari user: _"motor A ganti oli dulu (di scan di kasir) lalu mau nambah ganti kampas rem (di scan) jadi agar tidak lupa di data dulu"_. Tahan keranjang (F6) sudah mencakup kasus ini, tetapi bolak-baliknya dianggap repot. Hasilnya R57–R60 di rencana implementasi.

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| K1 | Yang kurang dari tahan keranjang | (a) sudah cukup; (b) keranjang tiap motor selalu terlihat; (c) bisa dibuka dari laptop lain. Saran: (b) | (b), **ditambah**: wajib ada keterangan (nopol, pemilik, atau jenis/merek/warna kendaraan) | R57 |
| K2 | Kapan keterangan wajib | Saran: saat keranjang ditinggalkan, bukan sebelum scan pertama, supaya pembeli langsung tetap cepat | Ya | R57 |
| K3 | Isian keterangan | Saran: isian baru "Kendaraan", cukup satu dari nopol/pelanggan/kendaraan | Ya, lalu **diubah** (lihat K6) | — |
| K4 | Kendaraan tersimpan di nota | Saran: ya, dicetak dan tampil di riwayat | Ya | R58 |
| K6 | Hubungan dengan nopol dan pelanggan | User: _"sepertinya field nya 1 saja yaitu keterangan"_, dicetak di struk. Saran: nopol dan pelanggan tetap, keterangan isian ketiga, salah satu cukup; jendela pindah keranjang hanya berisi Keterangan | Ya. **Isian Kendaraan dibatalkan** | GLOSSARY: Keterangan Nota |
| K5 | Letak daftar keranjang | (a) tab di atas tabel; (b) kolom kiri. Saran: (a) | Ya | R57 |
| K7 | Setelah bayar | Saran: kembali ke keranjang kosong, bukan tab sebelah, supaya scan berikutnya tidak masuk ke motor lain | Ya | R57 |
| K8 | Pintasan pindah tab | Saran: F6 membuka daftar keranjang | **Saran ditolak**: _"hilangkan fitur hot keys di semua karena tidak berguna di aplikasi ini"_ | R60 |
| K8b | Batas penghapusan pintasan | Semua F-key, ↑/↓, + / −, Delete, Esc-kosongkan; tetap scanner, Enter/↑/↓ di kolom cari, Enter/Esc/Tab di jendela | Ya | R60 |
| K9 | Membuang keranjang batal | Saran: tombol Kosongkan keranjang di bawah tabel, bukan × di tab | Ya | R57 |
| K10 | Pembaruan harga | Saran: saat tab diklik dan sekali lagi saat Bayar | Ya | R57 |
| K11 | Letak di struk | Saran: `Ket  :` di bawah `Plg` | Ya | R58 |
| K12 | Isi otomatis | Saran: keterangan terisi dari nota terakhir nopol yang sama | Ya | R58 |
| K13 | Riwayat nota | Saran: tampil dan bisa dicari | Ya | R58 |
| K14 | Stok di keranjang lain | Saran: peringatan ikut menghitung keranjang lain, tanpa stok ditahan (ADR 0003 tetap) | Ya | R59 |
| K15 | Katalog | Saran: stok sistem + "n di keranjang lain" | Ya | R59 |
| K16 | Tulisan Enter/Esc di tombol | Saran: dihapus juga | Ya | R60 |
| K17 | Urutan tab dan keranjang kosong | Saran: urut waktu dibuat, satu keranjang kosong ditandai + Baru, tab "Baru" untuk keranjang berisi tanpa pengenal, baris tab disembunyikan kalau hanya ada keranjang kosong | Ya | R57 |

Setelah tab dibangun, user meminta tampilan lain: _"ada ikon keranjang saja lalu saat di klik muncul modal, lalu didalamnya ada list di sebelah kiri dan saat di klik sebelah kanan menampilkan list barang nya apa saja"_. **Baris tab diganti** (R61).

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| K18 | Pindah ke keranjang dari modal | Saran: panel kanan hanya-lihat, tombol Buka keranjang; ubah isi tetap di layar Kasir | Ya | R61 |
| K19 | Letak ikon, label aktif, + Baru | Saran: ikon di samping judul + label aktif + Baru di layar utama | **Diubah**: _"taruh tombolnya di kanan atas saja seperti keranjang di marketplace"_ | Memicu K19b |
| K19b | Rincian ikon kanan atas | Saran: angka merah jumlah keranjang tidak kosong; label aktif cukup dari panel Data nota; + Keranjang baru hanya di modal | Ya | R61 |
| K20 | Isi modal | Saran: kiri label/baris/total/● sedang dibuka; kanan data nota, barang, total; pilihan awal = keranjang aktif; Buka keranjang / Tutup | Ya | R61 |

Lalu user memberi tahu: _"aplikasi ini sudah live production, saya ingin kamu jangan otak atik dan menabah file atau merubah/delete di supabase"_. Migrasi 11 belum pernah dijalankan dan dibatalkan.

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| K21 | Keterangan tanpa database | (a) hanya di keranjang dan struk; (b) digabung ke catatan servis; (c) dihapus. Saran: (a) | (a): _"untuk fitur keranjang ini hanya simpan di lokal saja"_ | R62. K4, K12, K13 batal |

Lalu user mengubah alurnya: _"saat user membuka menu kasir user masukkan barang ke keranjang lalu ada tombol masukkan ke keranjang, jika di klik maka akan mengosongkan dan memasukkan ke dalam keranjang dan memulai untuk memasukkan data baru lagi ke kasir"_. Diperjelas dengan studi kasus: motor A ganti oli, motor B datang ganti roller, kasir mengisi keterangan untuk motor A lalu layar bersih untuk motor B. Hasilnya R63, yang menggantikan model "keranjang aktif" K5–K20.

| No | Topik | Yang ditanyakan / rekomendasi | Jawaban user | Dampak |
| --- | --- | --- | --- | --- |
| K22b | Keterangan saat Tambah ke keranjang | Saran: selalu muncul dan wajib, diusulkan dari nopol/pelanggan | Ya | R63 |
| K22 | Keranjang yang dibuka lagi | Saran: pindah ke layar dan keluar dari daftar; layar berisi wajib ditambahkan dulu | _"jika mau pindah keranjang harus make sure harus disimpan yang ada di layar saat ini dan jangan lupa diisi keterangan juga"_ | R63 |
| K23 | Letak tombol | Saran: di bawah Bayar, selebar Bayar, gaya garis | Ya | R63 |
| K24 | Sebutan isian layar | Saran: "keranjang" hanya untuk yang ditunda; layar tanpa nama khusus, tombol Kosongkan | Ya | GLOSSARY: Keranjang |
| K25 | Keterangan sama | (a) ditolak; (b) boleh; (c) digabung. Saran: (a) | Ya | R63 |

## Koreksi tanpa pertanyaan

Dua koreksi diterapkan tanpa ditanyakan, karena tidak ada alternatif yang masuk akal:

- **Mutasi stok mencatat HPP, bukan harga jual.** Contoh SQL di PRD awal mengisi `harga_satuan` dengan harga jual, sehingga laba kotor dan valuasi tidak bisa dihitung. Diskon nota dialokasikan ke setiap baris sebanding nilainya.
- **PITR bukan bagian paket Supabase Pro**, berbeda dengan yang tertulis di PRD awal. PITR adalah add-on sekitar $100/bulan (dicek di supabase.com/pricing dan docs backups, 18/10/2026).
