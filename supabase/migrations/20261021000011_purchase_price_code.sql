-- Kashiru 11: Kode Harga Beli (R64, ADR 0007). Harga beli part ditulis sebagai kode huruf yang artinya
-- hanya diketahui pemilik. Satu kode per part, disimpan apa adanya. Harga beli angka baru diisi 0 sebagai
-- pengisi; kolom angka lama tidak dihapus dan checkout_sale tidak diubah. Stok awal, penyesuaian stok,
-- dan opname tidak lagi mewajibkan harga beli.

alter table public.products add column kode_harga_beli text;
alter table public.products add constraint kode_harga_beli_valid check (kode_harga_beli ~ '^[A-Z]+$');
alter table public.products add constraint kode_harga_beli_part check (tipe = 'part' or kode_harga_beli is null);

grant update (kode_harga_beli) on public.products to authenticated;

-- Kode dari isian: spasi di tepi dibuang, huruf kecil dijadikan kapital, kosong menjadi null.
-- Selain huruf A-Z ditolak.
create or replace function private.purchase_price_code(p_kode text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kode text := nullif(upper(btrim(p_kode)), '');
begin
  if v_kode is not null and v_kode !~ '^[A-Z]+$' then
    raise exception 'Kode harga beli hanya boleh huruf A-Z, bukan angka atau tanda baca';
  end if;
  return v_kode;
end;
$$;

-- Produk ---------------------------------------------------------------------

-- Sama dengan migrasi 4, ditambah kode harga beli. Stok awal tidak lagi wajib harga beli; tanpa harga beli
-- mutasinya memakai 0. Fungsi lama dihapus karena daftar argumennya berubah.
drop function public.create_product(text, text, uuid, bigint, text, text, boolean, numeric, text[], jsonb, numeric, bigint);

create function public.create_product(
  p_tipe text,
  p_nama text,
  p_category_id uuid,
  p_harga_jual bigint,
  p_merek text default null,
  p_satuan text default null,
  p_bisa_pecahan boolean default false,
  p_stok_min numeric default 0,
  p_barcodes text[] default '{}',
  p_kode_part jsonb default '[]',
  p_stok_awal numeric default null,
  p_harga_beli bigint default null,
  p_kode_harga_beli text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_nama text := private.tidy_text(p_nama);
  v_merek text := private.tidy_text(p_merek);
  v_kode_harga text := private.purchase_price_code(p_kode_harga_beli);
  v_ada_stok_awal boolean := coalesce(p_stok_awal, 0) <> 0;
  v_id uuid;
  v_barcode text;
  v_kode jsonb;
begin
  if p_tipe is null or p_tipe not in ('part', 'jasa') then
    raise exception 'Tipe produk harus part atau jasa';
  end if;
  if v_nama is null then
    raise exception 'Nama produk wajib diisi';
  end if;
  if p_category_id is null or not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Kategori wajib dipilih';
  end if;
  if p_tipe = 'part' and (p_harga_jual is null or p_harga_jual <= 0) then
    raise exception 'Harga jual part wajib lebih dari Rp 0';
  end if;
  if p_tipe = 'jasa' and (p_harga_jual is null or p_harga_jual < 0) then
    raise exception 'Tarif jasa wajib diisi, boleh Rp 0';
  end if;
  if p_tipe = 'jasa' and (
    v_merek is not null or coalesce(p_bisa_pecahan, false) or coalesce(p_stok_min, 0) <> 0
    or coalesce(cardinality(p_barcodes), 0) > 0 or coalesce(jsonb_array_length(p_kode_part), 0) > 0
    or v_ada_stok_awal or v_kode_harga is not null
  ) then
    raise exception 'Jasa tidak punya merek, barcode, kode part, kode harga beli, maupun stok';
  end if;
  if exists (
    select 1 from public.products
    where lower(nama) = lower(v_nama) and lower(coalesce(merek, '')) = lower(coalesce(v_merek, ''))
  ) then
    raise exception 'Produk "%" dengan merek "%" sudah ada', v_nama, coalesce(v_merek, '-');
  end if;

  if v_ada_stok_awal then
    perform private.check_qty(p_stok_awal, coalesce(p_bisa_pecahan, false), 'stok awal');
    if p_harga_beli is not null and p_harga_beli < 0 then
      raise exception 'Harga beli tidak boleh negatif';
    end if;
  elsif p_harga_beli is not null then
    raise exception 'Harga beli hanya diisi bersama stok awal';
  end if;

  insert into public.products (tipe, nama, merek, category_id, satuan, bisa_pecahan, harga_jual, stok_min, kode_harga_beli)
  values (
    p_tipe, v_nama, v_merek, p_category_id,
    case when p_tipe = 'part' then coalesce(private.tidy_text(p_satuan), 'pcs') end,
    p_tipe = 'part' and coalesce(p_bisa_pecahan, false),
    p_harga_jual,
    coalesce(p_stok_min, 0),
    v_kode_harga
  )
  returning id into v_id;

  foreach v_barcode in array coalesce(p_barcodes, '{}') loop
    v_barcode := btrim(v_barcode);
    continue when coalesce(v_barcode, '') = '';
    if exists (select 1 from public.product_barcodes where barcode = v_barcode) then
      raise exception 'Barcode % sudah dipakai produk lain', v_barcode;
    end if;
    insert into public.product_barcodes (product_id, barcode, jenis) values (v_id, v_barcode, 'pabrik');
  end loop;

  for v_kode in select value from jsonb_array_elements(coalesce(p_kode_part, '[]')) loop
    insert into public.product_part_numbers (product_id, kode_part, jenis)
    values (v_id, btrim(v_kode ->> 'kode_part'), v_kode ->> 'jenis');
  end loop;

  if v_ada_stok_awal then
    insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, user_id)
    values (v_id, 'stok_awal', p_stok_awal, coalesce(p_harga_beli, 0), v_user);
  end if;

  return v_id;
end;
$$;

-- Penerimaan -----------------------------------------------------------------

-- p_items: [{"product_id", "qty", "harga_beli", "kode_harga_beli"}]. Harga beli diisi 0 sebagai pengisi.
-- Kode harga beli yang diisi menggantikan kode part itu; kosong berarti kode part tidak diubah. Kode tidak
-- disimpan per penerimaan, dan void penerimaan tidak mengembalikan kode lama.
create or replace function public.create_receipt(
  p_items jsonb,
  p_tanggal_faktur date default null,
  p_supplier_id uuid default null,
  p_no_faktur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_tanggal date := coalesce(p_tanggal_faktur, v_hari_ini);
  v_id uuid;
  v_nomor text;
  v_baris record;
  v_produk public.products;
  v_qty numeric;
  v_harga bigint;
  v_kode_harga text;
begin
  if v_tanggal > v_hari_ini then
    raise exception 'Tanggal faktur tidak boleh setelah hari ini';
  end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Supplier tidak dikenal';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Penerimaan tidak punya baris';
  end if;

  v_nomor := private.next_document_number('penerimaan');
  insert into public.receipts (nomor, tanggal_faktur, supplier_id, no_faktur, user_id)
  values (v_nomor, v_tanggal, p_supplier_id, private.tidy_text(p_no_faktur), v_user)
  returning id into v_id;

  for v_baris in
    select e.value as data, e.ordinality::integer as urutan
    from jsonb_array_elements(p_items) with ordinality as e
  loop
    select * into v_produk from public.products where id = (v_baris.data ->> 'product_id')::uuid;
    if not found or v_produk.tipe <> 'part' then
      raise exception 'Baris % bukan part yang dikenal', v_baris.urutan;
    end if;
    v_qty := (v_baris.data ->> 'qty')::numeric;
    v_harga := coalesce((v_baris.data ->> 'harga_beli')::bigint, 0);
    perform private.check_qty(v_qty, v_produk.bisa_pecahan, v_produk.nama);
    if v_harga < 0 then
      raise exception 'Harga beli % tidak valid', v_produk.nama;
    end if;
    v_kode_harga := private.purchase_price_code(v_baris.data ->> 'kode_harga_beli');
    insert into public.receipt_items (receipt_id, urutan, product_id, qty, harga_beli)
    values (v_id, v_baris.urutan, v_produk.id, v_qty, v_harga);
    -- Perubahan kode tercatat di Riwayat perubahan lewat pemicu di products.
    if v_kode_harga is not null then
      update public.products set kode_harga_beli = v_kode_harga
      where id = v_produk.id and kode_harga_beli is distinct from v_kode_harga;
    end if;
  end loop;

  -- Mutasi dibukukan pada waktu penerimaan disimpan, bukan tanggal faktur (PRD 4.4).
  -- Baris Rp 0 dibukukan setelah baris berharga, supaya urutan scan tidak memengaruhi rata-rata.
  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, user_id)
  select ri.product_id, 'beli', ri.qty, ri.harga_beli, 'receipt', ri.receipt_id, v_user
  from public.receipt_items ri
  where ri.receipt_id = v_id
  order by ri.harga_beli = 0, ri.urutan;

  return jsonb_build_object('id', v_id, 'nomor', v_nomor);
end;
$$;

-- Penyesuaian stok -----------------------------------------------------------

-- Sama dengan migrasi 4, tetapi part tanpa harga rata-rata tidak lagi wajib disertai harga beli (memakai 0).
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_qty numeric,
  p_alasan text,
  p_keterangan text default null,
  p_harga_beli bigint default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_keterangan text := private.tidy_text(p_keterangan);
  v_produk public.products;
  v_stok_sebelum numeric;
  v_stok_sesudah numeric;
  v_hpp numeric;
begin
  select * into v_produk from public.products where id = p_product_id;
  if not found or v_produk.tipe <> 'part' then
    raise exception 'Penyesuaian stok hanya untuk part';
  end if;
  if p_qty is null or p_qty = 0 then
    raise exception 'Qty penyesuaian tidak boleh 0';
  end if;
  perform private.check_qty(abs(p_qty), v_produk.bisa_pecahan, v_produk.nama);
  if p_alasan is null or p_alasan not in ('rusak', 'hilang', 'ketemu', 'salah_input', 'lainnya') then
    raise exception 'Alasan wajib dipilih: rusak, hilang, ketemu, salah input, atau lainnya';
  end if;
  if p_alasan = 'lainnya' and v_keterangan is null then
    raise exception 'Keterangan wajib diisi untuk alasan Lainnya';
  end if;
  if p_harga_beli is not null and p_harga_beli < 0 then
    raise exception 'Harga beli tidak boleh negatif';
  end if;

  -- Penyesuaian tambah masuk dengan rata-rata saat itu, atau harga beli yang dikirim kalau belum ada rata-rata.
  if p_qty > 0 and v_produk.harga_beli_avg = 0 then
    v_hpp := coalesce(p_harga_beli, 0);
  else
    v_hpp := v_produk.harga_beli_avg;
  end if;

  select qty_on_hand into v_stok_sebelum from public.stock_levels where product_id = p_product_id for update;

  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, alasan, keterangan, user_id)
  values (p_product_id, 'penyesuaian', p_qty, v_hpp, p_alasan, v_keterangan, v_user);

  select qty_on_hand into v_stok_sesudah from public.stock_levels where product_id = p_product_id;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'penyesuaian_stok', 'products', p_product_id::text,
    jsonb_build_object('stok', v_stok_sebelum),
    jsonb_build_object('stok', v_stok_sesudah, 'qty', p_qty, 'alasan', p_alasan, 'keterangan', v_keterangan)
  );
  return v_stok_sesudah;
end;
$$;

-- Stock opname ---------------------------------------------------------------

-- Sama dengan migrasi 4, tetapi tidak ada lagi part yang perlu diberi harga beli (perlu_harga_beli selalu false).
create or replace function public.review_opname(p_opname_id uuid)
returns table (
  product_id uuid,
  nama text,
  merek text,
  satuan text,
  kategori text,
  keputusan text,
  qty_hitung numeric,
  dihitung_pada timestamptz,
  stok_sistem_saat_hitung numeric,
  stok_sekarang numeric,
  selisih numeric,
  harga_beli_avg numeric,
  selisih_rupiah numeric,
  alasan text,
  alasan_keterangan text,
  harga_beli_input bigint,
  perlu_harga_beli boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with sesi as (
    select o.* from public.stock_opnames o where o.id = p_opname_id and public.is_active_user()
  ),
  cakupan as (
    select p.id
    from public.products p
    cross join sesi s
    where s.status = 'dibuka' and p.tipe = 'part' and p.aktif
      and (s.jenis = 'penuh' or p.category_id = s.category_id)
    union
    select i.product_id
    from public.stock_opname_items i
    join sesi s on s.id = i.opname_id
  )
  select
    p.id, p.nama, p.merek, p.satuan, k.nama,
    i.keputusan, i.qty_hitung, i.dihitung_pada, i.stok_sistem_saat_hitung, sl.qty_on_hand,
    h.selisih,
    p.harga_beli_avg,
    round(h.selisih * case when h.selisih > 0 and p.harga_beli_avg = 0 then coalesce(i.harga_beli_input, 0) else p.harga_beli_avg end),
    i.alasan, i.alasan_keterangan, i.harga_beli_input,
    false
  from cakupan c
  cross join sesi s
  join public.products p on p.id = c.id
  join public.categories k on k.id = p.category_id
  join public.stock_levels sl on sl.product_id = p.id
  left join public.stock_opname_items i on i.opname_id = s.id and i.product_id = p.id
  cross join lateral (
    select case
      when s.status <> 'dibuka' then i.selisih
      when i.keputusan = 'dihitung' then i.qty_hitung - i.stok_sistem_saat_hitung
      when i.keputusan = 'dianggap_nol' then -sl.qty_on_hand
    end as selisih
  ) h
  order by k.nama, p.nama, p.merek nulls first
$$;

-- Sama dengan migrasi 4, tanpa kewajiban harga beli untuk selisih lebih pada part tanpa rata-rata (memakai 0).
create or replace function public.confirm_opname(p_opname_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_opname public.stock_opnames;
  v_belum integer;
  v_masalah text;
  v_jumlah_selisih integer;
begin
  select * into v_opname from public.stock_opnames where id = p_opname_id for update;
  if not found or v_opname.status <> 'dibuka' then
    raise exception 'Sesi opname tidak terbuka';
  end if;

  select count(*) into v_belum
  from public.products p
  where p.tipe = 'part' and p.aktif
    and (v_opname.jenis = 'penuh' or p.category_id = v_opname.category_id)
    and not exists (
      select 1 from public.stock_opname_items i where i.opname_id = p_opname_id and i.product_id = p.id
    );
  if v_belum > 0 then
    raise exception 'Masih ada % part yang belum dihitung. Pilih dianggap 0 atau dilewati', v_belum;
  end if;

  -- Part yang dianggap 0 dibandingkan dengan stok saat konfirmasi.
  update public.stock_opname_items i
  set qty_hitung = 0, dihitung_pada = now(), stok_sistem_saat_hitung = sl.qty_on_hand, dihitung_oleh = v_user
  from public.stock_levels sl
  where i.opname_id = p_opname_id and i.keputusan = 'dianggap_nol' and sl.product_id = i.product_id;

  update public.stock_opname_items
  set selisih = qty_hitung - stok_sistem_saat_hitung
  where opname_id = p_opname_id and keputusan <> 'dilewati';

  select string_agg(nama, ', ') into v_masalah from (
    select p.nama
    from public.stock_opname_items i
    join public.products p on p.id = i.product_id
    where i.opname_id = p_opname_id and i.selisih <> 0
      and (i.alasan is null or (i.alasan = 'lainnya' and i.alasan_keterangan is null))
    order by p.nama
    limit 5
  ) x;
  if v_masalah is not null then
    raise exception 'Alasan selisih belum diisi: %', v_masalah;
  end if;

  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, alasan, keterangan, user_id)
  select
    i.product_id, 'opname', i.selisih,
    case when i.selisih > 0 and p.harga_beli_avg = 0 then coalesce(i.harga_beli_input, 0) else p.harga_beli_avg end,
    'opname', p_opname_id, i.alasan, i.alasan_keterangan, v_user
  from public.stock_opname_items i
  join public.products p on p.id = i.product_id
  where i.opname_id = p_opname_id and i.selisih <> 0
  order by p.nama, p.id;
  get diagnostics v_jumlah_selisih = row_count;

  update public.stock_opnames
  set status = 'dikonfirmasi', dikonfirmasi_pada = now(), dikonfirmasi_oleh = v_user
  where id = p_opname_id;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'konfirmasi_opname', 'stock_opnames', p_opname_id::text,
    jsonb_build_object('nomor', v_opname.nomor, 'status', 'dibuka'),
    jsonb_build_object('status', 'dikonfirmasi', 'part_selisih', v_jumlah_selisih)
  );
  return jsonb_build_object('nomor', v_opname.nomor, 'part_selisih', v_jumlah_selisih);
end;
$$;

-- Hak akses ditulis eksplisit (lihat migrasi 3). Fungsi baru otomatis bisa dijalankan PUBLIC, jadi dicabut dulu.
revoke execute on function public.create_product(text, text, uuid, bigint, text, text, boolean, numeric, text[], jsonb, numeric, bigint, text) from public, anon;
grant execute on function public.create_product(text, text, uuid, bigint, text, text, boolean, numeric, text[], jsonb, numeric, bigint, text) to authenticated, service_role;
revoke execute on function private.purchase_price_code(text) from public;
