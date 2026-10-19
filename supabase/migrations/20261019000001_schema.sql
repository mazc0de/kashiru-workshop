-- Kashiru 1/5: tabel inti.
-- Satu database untuk satu bengkel, tanpa tenant_id (ADR 0001). Spesifikasi: PRD revisi bagian 8.

create extension if not exists pg_trgm with schema extensions;

-- Fungsi internal (trigger dan pembantu RPC) disimpan di schema yang tidak dibuka ke API.
create schema if not exists private;
revoke all on schema private from public;

-- Buang spasi di ujung dan spasi ganda. Teks kosong menjadi null.
create or replace function private.tidy_text(t text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(btrim(t), '\s+', ' ', 'g'), '')
$$;

-- Trigger umum: rapikan kolom teks yang namanya diberikan sebagai argumen trigger.
create or replace function private.tidy_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_col text;
begin
  foreach v_col in array tg_argv loop
    v_row := jsonb_set(v_row, array[v_col], coalesce(to_jsonb(private.tidy_text(v_row ->> v_col)), 'null'::jsonb));
  end loop;
  new := jsonb_populate_record(new, v_row);
  return new;
end;
$$;

-- Pengaturan -----------------------------------------------------------------

create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  nama_bengkel text not null default 'Bengkel',
  alamat text,
  telepon text,
  logo_url text,
  footer_struk text,
  awalan_nota text not null default 'KSR',
  awalan_penerimaan text not null default 'TRM',
  awalan_opname text not null default 'OPN',
  ukuran_kertas smallint not null default 80 check (ukuran_kertas in (58, 80)),
  jumlah_salinan smallint not null default 1 check (jumlah_salinan >= 1),
  blind_count boolean not null default true,
  auto_logout_jam smallint not null default 12 check (auto_logout_jam >= 1),
  constraint awalan_format check (
    awalan_nota ~ '^[A-Z0-9]{1,5}$'
    and awalan_penerimaan ~ '^[A-Z0-9]{1,5}$'
    and awalan_opname ~ '^[A-Z0-9]{1,5}$'
  ),
  constraint awalan_berbeda check (
    awalan_nota <> awalan_penerimaan
    and awalan_nota <> awalan_opname
    and awalan_penerimaan <> awalan_opname
  )
);

create or replace function private.tidy_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nama_bengkel := coalesce(private.tidy_text(new.nama_bengkel), 'Bengkel');
  new.alamat := private.tidy_text(new.alamat);
  new.telepon := private.tidy_text(new.telepon);
  new.footer_struk := nullif(btrim(new.footer_struk), '');
  new.awalan_nota := upper(btrim(new.awalan_nota));
  new.awalan_penerimaan := upper(btrim(new.awalan_penerimaan));
  new.awalan_opname := upper(btrim(new.awalan_opname));
  return new;
end;
$$;

create trigger tidy before insert or update on public.store_settings
  for each row execute function private.tidy_settings();

-- Akun & Perangkat Kasir -----------------------------------------------------

-- Login memakai email biasa (ADR 0006). Semua akun setara.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email text not null unique check (email = lower(email)),
  nama text not null check (btrim(nama) <> ''),
  aktif boolean not null default true,
  terakhir_login timestamptz,
  created_at timestamptz not null default now()
);

-- Riwayat Perangkat Kasir. Hanya satu baris yang selesai-nya kosong (PRD 7.5).
create table public.cashier_devices (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  nama text,
  mulai timestamptz not null default now(),
  selesai timestamptz,
  didaftarkan_oleh uuid not null references public.profiles (id),
  check (selesai is null or selesai >= mulai)
);

create unique index cashier_devices_satu_aktif on public.cashier_devices ((selesai is null)) where selesai is null;
create index cashier_devices_device on public.cashier_devices (device_id);

-- Data master ----------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index categories_nama_unik on public.categories (lower(nama));
create trigger tidy before insert or update on public.categories
  for each row execute function private.tidy_columns('nama');

create table public.mechanics (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index mechanics_nama_unik on public.mechanics (lower(nama));
create trigger tidy before insert or update on public.mechanics
  for each row execute function private.tidy_columns('nama');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  telepon text,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index suppliers_nama_unik on public.suppliers (lower(nama));
create trigger tidy before insert or update on public.suppliers
  for each row execute function private.tidy_columns('nama', 'telepon');

-- Produk: Part (punya stok) dan Jasa (tanpa stok). Tanpa SKU (PRD 4.2).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tipe text not null check (tipe in ('part', 'jasa')),
  nama text not null,
  merek text,
  category_id uuid not null references public.categories (id),
  satuan text,
  bisa_pecahan boolean not null default false,
  harga_jual bigint not null,
  stok_min numeric(12, 2) not null default 0 check (stok_min >= 0),
  harga_beli_avg numeric(14, 2) not null default 0 check (harga_beli_avg >= 0),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  -- Harga jual part > Rp 0, tarif jasa boleh Rp 0.
  constraint harga_jual_valid check (
    (tipe = 'part' and harga_jual > 0) or (tipe = 'jasa' and harga_jual >= 0)
  ),
  constraint jasa_tanpa_stok check (
    tipe = 'part' or (merek is null and satuan is null and not bisa_pecahan and stok_min = 0)
  ),
  constraint part_punya_satuan check (tipe = 'jasa' or satuan is not null),
  constraint stok_min_bulat check (bisa_pecahan or stok_min = trunc(stok_min))
);

-- Pembeda produk: nama + merek, tanpa membedakan huruf besar-kecil.
create unique index products_pembeda on public.products (lower(nama), lower(coalesce(merek, '')));
create index products_category on public.products (category_id);
create index products_nama_trgm on public.products using gin (nama extensions.gin_trgm_ops);
create index products_merek_trgm on public.products using gin (merek extensions.gin_trgm_ops);
create trigger tidy before insert or update on public.products
  for each row execute function private.tidy_columns('nama', 'merek', 'satuan');

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  barcode text not null unique check (barcode = btrim(barcode) and barcode <> ''),
  jenis text not null check (jenis in ('pabrik', 'internal')),
  created_at timestamptz not null default now()
);

create index product_barcodes_product on public.product_barcodes (product_id);

create table public.product_part_numbers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  kode_part text not null check (kode_part = btrim(kode_part) and kode_part <> ''),
  jenis text not null check (jenis in ('oem', 'alt')),
  created_at timestamptz not null default now(),
  unique (product_id, kode_part)
);

create index product_part_numbers_product on public.product_part_numbers (product_id);
create index product_part_numbers_kode_trgm on public.product_part_numbers using gin (kode_part extensions.gin_trgm_ops);

-- Barcode dan kode part hanya untuk Part.
create or replace function private.require_part()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.products where id = new.product_id and tipe = 'part') then
    raise exception 'Barcode dan kode part hanya untuk part, bukan jasa';
  end if;
  return new;
end;
$$;

create trigger hanya_part before insert or update on public.product_barcodes
  for each row execute function private.require_part();
create trigger hanya_part before insert or update on public.product_part_numbers
  for each row execute function private.require_part();

-- Stok -----------------------------------------------------------------------

-- Saldo per part, hanya diperbarui oleh trigger stock_movements. Boleh minus (PRD 4.3).
create table public.stock_levels (
  product_id uuid primary key references public.products (id),
  qty_on_hand numeric(12, 2) not null default 0
);

-- Buku mutasi stok (append-only). qty positif = masuk, negatif = keluar.
-- hpp_satuan = harga beli yang dipakai mutasi itu, bukan harga jual (PRD 8).
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id),
  jenis text not null check (jenis in ('stok_awal', 'jual', 'void_jual', 'beli', 'void_beli', 'opname', 'penyesuaian')),
  qty numeric(12, 2) not null check (qty <> 0),
  hpp_satuan numeric(14, 2) not null check (hpp_satuan >= 0),
  ref_type text check (ref_type in ('sale', 'receipt', 'opname')),
  ref_id uuid,
  alasan text check (alasan in ('rusak', 'hilang', 'ketemu', 'salah_input', 'lainnya')),
  keterangan text,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint arah_qty check (
    (jenis in ('stok_awal', 'void_jual', 'beli') and qty > 0)
    or (jenis in ('jual', 'void_beli') and qty < 0)
    or jenis in ('opname', 'penyesuaian')
  )
);

create index stock_movements_product on public.stock_movements (product_id, id);
create index stock_movements_ref on public.stock_movements (ref_type, ref_id);

-- Nota -----------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  nomor text not null unique,
  nomor_asli text,
  tanggal_nota date not null,
  urut integer not null check (urut > 0),
  dibuat_pada timestamptz not null,
  device_id uuid not null,
  nopol text,
  nopol_kunci text generated always as (upper(regexp_replace(nopol, '\s', '', 'g'))) stored,
  nama_pelanggan text,
  mechanic_id uuid references public.mechanics (id),
  catatan_servis text,
  subtotal bigint not null check (subtotal >= 0),
  diskon_nota_jenis text check (diskon_nota_jenis in ('nominal', 'persen')),
  diskon_nota_input numeric(14, 2),
  diskon_nota bigint not null default 0 check (diskon_nota >= 0 and diskon_nota <= subtotal),
  total bigint not null,
  metode_bayar text not null check (metode_bayar in ('tunai', 'qris', 'transfer', 'edc')),
  uang_diterima bigint not null,
  kembalian bigint not null,
  status text not null default 'lunas' check (status in ('lunas', 'void')),
  void_alasan text,
  void_oleh uuid references public.profiles (id),
  void_pada timestamptz,
  user_id uuid not null references public.profiles (id),
  disinkron_pada timestamptz not null default now(),
  unique (tanggal_nota, urut),
  constraint total_valid check (total = subtotal - diskon_nota),
  constraint bayar_valid check (
    (metode_bayar = 'tunai' and uang_diterima >= total and kembalian = uang_diterima - total)
    or (metode_bayar <> 'tunai' and uang_diterima = total and kembalian = 0)
  ),
  constraint void_lengkap check (
    (status = 'lunas' and void_pada is null and void_oleh is null and void_alasan is null)
    or (status = 'void' and void_pada is not null and void_oleh is not null and void_alasan is not null)
  )
);

create index sales_tanggal on public.sales (tanggal_nota);
create index sales_dibuat_pada on public.sales (dibuat_pada);
create index sales_nopol on public.sales (nopol_kunci);
create index sales_pelanggan_trgm on public.sales using gin (nama_pelanggan extensions.gin_trgm_ops);
create index sales_mechanic on public.sales (mechanic_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id),
  urutan integer not null,
  product_id uuid not null references public.products (id),
  nama_snapshot text not null,
  merek_snapshot text,
  tipe text not null check (tipe in ('part', 'jasa')),
  qty numeric(12, 2) not null check (qty > 0),
  harga bigint not null check (harga >= 0),
  -- jumlah = qty x harga, dibulatkan ke rupiah terdekat (PRD 4.6).
  jumlah bigint not null check (jumlah >= 0),
  diskon_jenis text check (diskon_jenis in ('nominal', 'persen')),
  diskon_input numeric(14, 2),
  diskon bigint not null default 0 check (diskon >= 0),
  alokasi_diskon_nota bigint not null default 0 check (alokasi_diskon_nota >= 0),
  hpp_satuan numeric(14, 2),
  unique (sale_id, urutan),
  constraint diskon_valid check (diskon + alokasi_diskon_nota <= jumlah),
  constraint hpp_part check ((tipe = 'part') = (hpp_satuan is not null))
);

create index sale_items_product on public.sale_items (product_id);

-- Penerimaan -----------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  tanggal_faktur date not null,
  dibuat_pada timestamptz not null default now(),
  supplier_id uuid references public.suppliers (id),
  no_faktur text,
  status text not null default 'aktif' check (status in ('aktif', 'void')),
  void_alasan text,
  void_oleh uuid references public.profiles (id),
  void_pada timestamptz,
  user_id uuid not null references public.profiles (id),
  constraint void_lengkap check (
    (status = 'aktif' and void_pada is null and void_oleh is null and void_alasan is null)
    or (status = 'void' and void_pada is not null and void_oleh is not null and void_alasan is not null)
  )
);

create index receipts_tanggal_faktur on public.receipts (tanggal_faktur);
create index receipts_supplier on public.receipts (supplier_id);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id),
  urutan integer not null,
  product_id uuid not null references public.products (id),
  qty numeric(12, 2) not null check (qty > 0),
  harga_beli bigint not null check (harga_beli >= 0),
  unique (receipt_id, urutan)
);

create index receipt_items_product on public.receipt_items (product_id);

-- Stock opname ---------------------------------------------------------------

create table public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  jenis text not null check (jenis in ('penuh', 'kategori')),
  category_id uuid references public.categories (id),
  status text not null default 'dibuka' check (status in ('dibuka', 'dikonfirmasi', 'dibatalkan')),
  dibuka_pada timestamptz not null default now(),
  dibuka_oleh uuid not null references public.profiles (id),
  dikonfirmasi_pada timestamptz,
  dikonfirmasi_oleh uuid references public.profiles (id),
  dibatalkan_pada timestamptz,
  dibatalkan_oleh uuid references public.profiles (id),
  constraint kategori_sesuai_jenis check ((jenis = 'kategori') = (category_id is not null))
);

-- Paling banyak satu sesi yang terbuka.
create unique index stock_opnames_satu_dibuka on public.stock_opnames ((status)) where status = 'dibuka';

create table public.stock_opname_items (
  opname_id uuid not null references public.stock_opnames (id),
  product_id uuid not null references public.products (id),
  keputusan text not null default 'dihitung' check (keputusan in ('dihitung', 'dianggap_nol', 'dilewati')),
  qty_hitung numeric(12, 2) check (qty_hitung >= 0),
  dihitung_pada timestamptz,
  stok_sistem_saat_hitung numeric(12, 2),
  dihitung_oleh uuid references public.profiles (id),
  -- Diisi saat konfirmasi: qty_hitung - stok_sistem_saat_hitung (PRD 4.5).
  selisih numeric(12, 2),
  alasan text check (alasan in ('rusak', 'hilang', 'ketemu', 'salah_input', 'lainnya')),
  alasan_keterangan text,
  harga_beli_input bigint check (harga_beli_input > 0),
  primary key (opname_id, product_id),
  constraint hitungan_lengkap check (
    keputusan <> 'dihitung'
    or (qty_hitung is not null and dihitung_pada is not null and stok_sistem_saat_hitung is not null)
  )
);

create index stock_opname_items_product on public.stock_opname_items (product_id);

-- Nomor dokumen --------------------------------------------------------------

create table public.internal_barcode_counter (
  id smallint primary key default 1 check (id = 1),
  terakhir bigint not null
);

-- Nomor urut harian untuk penerimaan dan opname. Nomor nota dibuat Perangkat Kasir (ADR 0002).
create table public.document_counters (
  jenis text not null check (jenis in ('penerimaan', 'opname')),
  tanggal date not null,
  terakhir integer not null,
  primary key (jenis, tanggal)
);

-- Riwayat perubahan (append-only) --------------------------------------------

create table public.change_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id),
  aksi text not null,
  entitas text not null,
  entitas_id text,
  data_lama jsonb,
  data_baru jsonb,
  created_at timestamptz not null default now()
);

create index change_logs_created_at on public.change_logs (created_at);
create index change_logs_user on public.change_logs (user_id);
create index change_logs_entitas on public.change_logs (entitas, entitas_id);

-- Data awal ------------------------------------------------------------------

-- Daftar kategori dimulai kosong (PRD 7.7). Nama bengkel diubah dari Pengaturan.
insert into public.store_settings (id) values (1);
insert into public.internal_barcode_counter (id, terakhir) values (1, 200000);
