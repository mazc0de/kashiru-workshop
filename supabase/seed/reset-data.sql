-- Mengosongkan semua data bengkel di project UJI: produk, stok, kartu stok, nota, penerimaan, opname,
-- kategori, mekanik, supplier lama, riwayat perubahan, catatan backup, dan riwayat Perangkat Kasir.
-- Yang tetap ada: akun (profiles dan login) serta pengaturan bengkel.
--
-- JANGAN dijalankan di project yang dipakai bengkel sungguhan: data yang dihapus tidak bisa dikembalikan
-- kecuali dari file backup.
--
-- Kartu stok dan riwayat perubahan dikunci dari penghapusan oleh trigger hanya_tambah, jadi trigger itu
-- dimatikan sebentar (cukup hak pemilik tabel, seperti di SQL Editor Supabase). Seluruh file berjalan dalam
-- satu transaksi: kalau ada yang gagal, tidak ada yang terhapus. Setelah itu buka ulang aplikasi supaya
-- salinan produk di laptop ikut kosong.

alter table public.stock_movements disable trigger hanya_tambah;
alter table public.change_logs disable trigger hanya_tambah;

delete from public.stock_opname_items;
delete from public.stock_opnames;
delete from public.sale_items;
delete from public.sales;
delete from public.receipt_items;
delete from public.receipts;
delete from public.stock_movements;
delete from public.stock_levels;
delete from public.product_barcodes;
delete from public.product_part_numbers;
delete from public.products;
delete from public.categories;
delete from public.mechanics;
delete from public.suppliers;
delete from public.change_logs;
delete from public.backup_logs;
delete from public.cashier_devices;
delete from public.document_counters;
update public.internal_barcode_counter set terakhir = 200000;

alter table public.stock_movements enable trigger hanya_tambah;
alter table public.change_logs enable trigger hanya_tambah;
