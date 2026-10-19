-- Kashiru 4/5: fungsi RPC. Semua yang menyentuh stok atau nomor dokumen hanya lewat sini,
-- dalam satu transaksi per panggilan (PRD 8).

-- Pembantu -------------------------------------------------------------------

-- Akun yang memanggil harus login dan aktif. Mengembalikan id akunnya.
create or replace function private.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and aktif) then
    raise exception 'Akun belum login atau sudah nonaktif' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Qty > 0, paling banyak 2 angka desimal, dan bulat kecuali part "bisa pecahan" (PRD 4.2).
create or replace function private.check_qty(p_qty numeric, p_bisa_pecahan boolean, p_nama text)
returns void
language plpgsql
immutable
as $$
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Qty % harus lebih dari 0', p_nama;
  end if;
  if p_qty <> round(p_qty, 2) then
    raise exception 'Qty % paling banyak 2 angka di belakang koma', p_nama;
  end if;
  if not p_bisa_pecahan and p_qty <> trunc(p_qty) then
    raise exception 'Qty % harus bilangan bulat', p_nama;
  end if;
end;
$$;

-- Nilai diskon dalam rupiah. Nominal berlaku untuk total baris (R3), persen dibulatkan
-- ke rupiah terdekat (R2), dan diskon tidak boleh membuat harga di bawah Rp 0.
create or replace function private.compute_discount(p_jenis text, p_input numeric, p_dasar bigint)
returns bigint
language plpgsql
immutable
as $$
declare
  v_diskon bigint;
begin
  if p_jenis is null then
    if coalesce(p_input, 0) <> 0 then
      raise exception 'Jenis diskon wajib diisi';
    end if;
    return 0;
  elsif p_jenis = 'nominal' then
    if p_input is null or p_input < 0 or p_input <> trunc(p_input) then
      raise exception 'Diskon nominal harus rupiah penuh dan tidak negatif';
    end if;
    v_diskon := p_input;
  elsif p_jenis = 'persen' then
    if p_input is null or p_input < 0 or p_input > 100 or p_input <> round(p_input, 2) then
      raise exception 'Diskon persen harus 0 sampai 100, paling banyak 2 angka di belakang koma';
    end if;
    v_diskon := round(p_dasar * p_input / 100);
  else
    raise exception 'Jenis diskon tidak dikenal: %', p_jenis;
  end if;
  if v_diskon > p_dasar then
    raise exception 'Diskon tidak boleh membuat harga di bawah Rp 0';
  end if;
  return v_diskon;
end;
$$;

create or replace function private.sale_number(p_awalan text, p_tanggal date, p_urut integer)
returns text
language sql
immutable
as $$
  select p_awalan || '-' || to_char(p_tanggal, 'YYYYMMDD') || '-'
    || lpad(p_urut::text, greatest(4, length(p_urut::text)), '0')
$$;

-- Nomor penerimaan (4 digit) dan opname (2 digit), urut mulai lagi setiap hari (WIB).
-- Kalau urut melewati batas digit, nomornya bertambah satu digit (PRD 4.14).
create or replace function private.next_document_number(p_jenis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  v_urut integer;
  v_awalan text;
  v_digit integer := case p_jenis when 'penerimaan' then 4 else 2 end;
begin
  insert into public.document_counters as dc (jenis, tanggal, terakhir)
  values (p_jenis, v_tanggal, 1)
  on conflict (jenis, tanggal) do update set terakhir = dc.terakhir + 1
  returning terakhir into v_urut;

  select case p_jenis when 'penerimaan' then awalan_penerimaan else awalan_opname end
  into v_awalan
  from public.store_settings
  where id = 1;

  return v_awalan || '-' || to_char(v_tanggal, 'YYYYMMDD') || '-'
    || lpad(v_urut::text, greatest(v_digit, length(v_urut::text)), '0');
end;
$$;

-- Akun & Perangkat Kasir -----------------------------------------------------

create or replace function public.touch_last_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set terakhir_login = now() where id = private.require_active_user();
end;
$$;

-- "Jadikan perangkat ini Perangkat Kasir" (PRD 4.14). Masa tugas perangkat lama ditutup.
create or replace function public.register_cashier_device(p_device_id uuid, p_nama text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_lama public.cashier_devices;
  v_ada boolean;
  v_id uuid;
begin
  if p_device_id is null then
    raise exception 'Id perangkat wajib diisi';
  end if;

  select * into v_lama from public.cashier_devices where selesai is null for update;
  v_ada := found;
  if v_ada and v_lama.device_id = p_device_id then
    return v_lama.id;
  end if;
  if v_ada then
    update public.cashier_devices set selesai = now() where id = v_lama.id;
  end if;

  insert into public.cashier_devices (device_id, nama, didaftarkan_oleh)
  values (p_device_id, private.tidy_text(p_nama), v_user)
  returning id into v_id;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'ganti_perangkat_kasir', 'cashier_devices', v_id::text,
    case when v_ada then jsonb_build_object('device_id', v_lama.device_id, 'nama', v_lama.nama) end,
    jsonb_build_object('device_id', p_device_id, 'nama', private.tidy_text(p_nama))
  );
  return v_id;
end;
$$;

-- Produk ---------------------------------------------------------------------

-- Membuat part atau jasa beserta barcode pabrik, kode part, dan stok awal dalam satu transaksi (PRD 4.2).
-- p_kode_part: [{"kode_part": "06455-KVB-305", "jenis": "oem" | "alt"}]
create or replace function public.create_product(
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
  p_harga_beli bigint default null
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
    or v_ada_stok_awal
  ) then
    raise exception 'Jasa tidak punya merek, barcode, kode part, maupun stok';
  end if;
  if exists (
    select 1 from public.products
    where lower(nama) = lower(v_nama) and lower(coalesce(merek, '')) = lower(coalesce(v_merek, ''))
  ) then
    raise exception 'Produk "%" dengan merek "%" sudah ada', v_nama, coalesce(v_merek, '-');
  end if;

  -- Kalau stok awal diisi, harga beli wajib > Rp 0 (PRD 4.2).
  if v_ada_stok_awal then
    perform private.check_qty(p_stok_awal, coalesce(p_bisa_pecahan, false), 'stok awal');
    if p_harga_beli is null or p_harga_beli <= 0 then
      raise exception 'Harga beli wajib diisi dan lebih dari Rp 0 kalau stok awal diisi';
    end if;
  elsif p_harga_beli is not null then
    raise exception 'Harga beli hanya diisi bersama stok awal';
  end if;

  insert into public.products (tipe, nama, merek, category_id, satuan, bisa_pecahan, harga_jual, stok_min)
  values (
    p_tipe, v_nama, v_merek, p_category_id,
    case when p_tipe = 'part' then coalesce(private.tidy_text(p_satuan), 'pcs') end,
    p_tipe = 'part' and coalesce(p_bisa_pecahan, false),
    p_harga_jual,
    coalesce(p_stok_min, 0)
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
    values (v_id, 'stok_awal', p_stok_awal, p_harga_beli, v_user);
  end if;

  return v_id;
end;
$$;

-- Barcode internal: angka urut mulai 200001, Code128 (PRD 4.9).
create or replace function public.create_internal_barcode(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angka bigint;
begin
  perform private.require_active_user();
  if not exists (select 1 from public.products where id = p_product_id and tipe = 'part') then
    raise exception 'Barcode internal hanya untuk part';
  end if;
  loop
    update public.internal_barcode_counter set terakhir = terakhir + 1 where id = 1
    returning terakhir into v_angka;
    exit when not exists (select 1 from public.product_barcodes where barcode = v_angka::text);
  end loop;
  insert into public.product_barcodes (product_id, barcode, jenis) values (p_product_id, v_angka::text, 'internal');
  return v_angka::text;
end;
$$;

-- Kasir ----------------------------------------------------------------------

-- Nomor urut nota terakhir pada satu tanggal, untuk dicocokkan Perangkat Kasir saat online (PRD 7.5).
create or replace function public.get_last_sale_urut(p_tanggal date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  return coalesce((select max(urut) from public.sales where tanggal_nota = p_tanggal), 0);
end;
$$;

-- Menyimpan nota dari Perangkat Kasir, online maupun hasil sinkron offline (PRD 4.6, 4.13, 7.5).
-- p_items: [{"product_id", "qty", "harga", "diskon_jenis": null|"nominal"|"persen", "diskon_input"}]
-- Angka dihitung ulang di server dengan aturan yang sama, lalu total dicocokkan dengan p_total.
create or replace function public.checkout_sale(
  p_client_id uuid,
  p_device_id uuid,
  p_user_id uuid,
  p_awalan text,
  p_urut integer,
  p_dibuat_pada timestamptz,
  p_items jsonb,
  p_metode_bayar text,
  p_total bigint,
  p_uang_diterima bigint default null,
  p_diskon_nota_jenis text default null,
  p_diskon_nota_input numeric default null,
  p_nopol text default null,
  p_nama_pelanggan text default null,
  p_mechanic_id uuid default null,
  p_catatan_servis text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanggal date;
  v_ada public.sales;
  v_urut integer := p_urut;
  v_nomor_asli text;
  v_baris record;
  v_produk public.products;
  v_qty numeric;
  v_harga bigint;
  v_jumlah bigint;
  v_diskon bigint;
  v_semua_baris jsonb := '[]';
  v_subtotal bigint := 0;
  v_diskon_nota bigint;
  v_total bigint;
  v_uang bigint;
  v_sale_id uuid;
  v_nomor text;
begin
  perform private.require_active_user();
  if p_client_id is null or p_dibuat_pada is null or p_urut is null or p_urut < 1 then
    raise exception 'Data nota tidak lengkap';
  end if;

  -- Tanggal nota = tanggal nota dibuat menurut jam Perangkat Kasir, dalam WIB.
  v_tanggal := (p_dibuat_pada at time zone 'Asia/Jakarta')::date;
  perform pg_advisory_xact_lock(hashtext('kashiru.nota.' || v_tanggal::text));

  -- Idempotensi: nota yang dikirim ulang mengembalikan nota yang sudah tersimpan.
  select * into v_ada from public.sales where client_id = p_client_id;
  if found then
    return jsonb_build_object(
      'id', v_ada.id, 'nomor', v_ada.nomor, 'nomor_asli', v_ada.nomor_asli,
      'total', v_ada.total, 'sudah_ada', true
    );
  end if;

  -- Server sengaja longgar terhadap nota offline (PRD 4.13): perangkat cukup pernah menjadi
  -- Perangkat Kasir saat nota dibuat (toleransi jam 10 menit), dan akun pembuat cukup terdaftar
  -- walaupun sekarang nonaktif.
  if not exists (
    select 1 from public.cashier_devices
    where device_id = p_device_id
      and p_dibuat_pada >= mulai - interval '10 minutes'
      and (selesai is null or p_dibuat_pada < selesai + interval '10 minutes')
  ) then
    raise exception 'Perangkat ini bukan Perangkat Kasir saat nota dibuat';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Akun pembuat nota tidak dikenal';
  end if;
  if p_awalan is null or p_awalan !~ '^[A-Z0-9]{1,5}$' then
    raise exception 'Awalan nomor nota tidak valid';
  end if;
  if p_mechanic_id is not null and not exists (select 1 from public.mechanics where id = p_mechanic_id) then
    raise exception 'Mekanik tidak dikenal';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nota tidak punya baris';
  end if;

  for v_baris in
    select e.value as data, e.ordinality::integer as urutan
    from jsonb_array_elements(p_items) with ordinality as e
  loop
    select * into v_produk from public.products where id = (v_baris.data ->> 'product_id')::uuid;
    if not found then
      raise exception 'Produk di baris % tidak dikenal', v_baris.urutan;
    end if;
    v_qty := (v_baris.data ->> 'qty')::numeric;
    v_harga := (v_baris.data ->> 'harga')::bigint;
    perform private.check_qty(v_qty, v_produk.tipe = 'part' and v_produk.bisa_pecahan, v_produk.nama);
    if v_harga is null or v_harga < 0 then
      raise exception 'Harga % tidak valid', v_produk.nama;
    end if;
    v_jumlah := round(v_qty * v_harga);
    v_diskon := private.compute_discount(
      v_baris.data ->> 'diskon_jenis', (v_baris.data ->> 'diskon_input')::numeric, v_jumlah
    );
    v_subtotal := v_subtotal + v_jumlah - v_diskon;
    v_semua_baris := v_semua_baris || jsonb_build_object(
      'urutan', v_baris.urutan,
      'product_id', v_produk.id,
      'nama_snapshot', v_produk.nama,
      'merek_snapshot', v_produk.merek,
      'tipe', v_produk.tipe,
      'qty', v_qty,
      'harga', v_harga,
      'jumlah', v_jumlah,
      'diskon_jenis', v_baris.data ->> 'diskon_jenis',
      'diskon_input', (v_baris.data ->> 'diskon_input')::numeric,
      'diskon', v_diskon,
      -- HPP = harga beli rata-rata saat nota diterima server (PRD 7.5).
      'hpp_satuan', case when v_produk.tipe = 'part' then v_produk.harga_beli_avg end
    );
  end loop;

  v_diskon_nota := private.compute_discount(p_diskon_nota_jenis, p_diskon_nota_input, v_subtotal);
  v_total := v_subtotal - v_diskon_nota;
  if p_total is distinct from v_total then
    raise exception 'Total nota tidak cocok: perangkat Rp %, server Rp %', p_total, v_total;
  end if;

  if p_metode_bayar = 'tunai' then
    if p_uang_diterima is null or p_uang_diterima < v_total then
      raise exception 'Uang diterima kurang dari total';
    end if;
    v_uang := p_uang_diterima;
  elsif p_metode_bayar in ('qris', 'transfer', 'edc') then
    v_uang := v_total;
  else
    raise exception 'Metode bayar tidak dikenal: %', p_metode_bayar;
  end if;

  -- Kalau urut sudah terpakai, nota tetap diterima dengan urut kosong berikutnya.
  if exists (select 1 from public.sales where tanggal_nota = v_tanggal and urut = v_urut) then
    v_nomor_asli := private.sale_number(p_awalan, v_tanggal, v_urut);
    select max(urut) + 1 into v_urut from public.sales where tanggal_nota = v_tanggal;
  end if;
  v_nomor := private.sale_number(p_awalan, v_tanggal, v_urut);

  insert into public.sales (
    client_id, nomor, nomor_asli, tanggal_nota, urut, dibuat_pada, device_id,
    nopol, nama_pelanggan, mechanic_id, catatan_servis,
    subtotal, diskon_nota_jenis, diskon_nota_input, diskon_nota, total,
    metode_bayar, uang_diterima, kembalian, user_id
  )
  values (
    p_client_id, v_nomor, v_nomor_asli, v_tanggal, v_urut, p_dibuat_pada, p_device_id,
    upper(private.tidy_text(p_nopol)), private.tidy_text(p_nama_pelanggan), p_mechanic_id,
    nullif(btrim(p_catatan_servis), ''),
    v_subtotal, p_diskon_nota_jenis, p_diskon_nota_input, v_diskon_nota, v_total,
    p_metode_bayar, v_uang, v_uang - v_total, p_user_id
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    sale_id, urutan, product_id, nama_snapshot, merek_snapshot, tipe,
    qty, harga, jumlah, diskon_jenis, diskon_input, diskon, hpp_satuan
  )
  select
    v_sale_id, b.urutan, b.product_id, b.nama_snapshot, b.merek_snapshot, b.tipe,
    b.qty, b.harga, b.jumlah, b.diskon_jenis, b.diskon_input, b.diskon, b.hpp_satuan
  from jsonb_to_recordset(v_semua_baris) as b(
    urutan integer, product_id uuid, nama_snapshot text, merek_snapshot text, tipe text,
    qty numeric, harga bigint, jumlah bigint, diskon_jenis text, diskon_input numeric,
    diskon bigint, hpp_satuan numeric
  );

  -- Diskon nota dialokasikan ke setiap baris sebanding nilainya setelah diskon baris (PRD 4.6).
  -- Setiap baris dibulatkan ke bawah, lalu sisa rupiahnya dibagikan satu per satu ke baris
  -- dengan pecahan terbesar, sehingga alokasi tidak pernah melebihi nilai barisnya.
  if v_diskon_nota > 0 then
    with porsi as (
      select id, urutan, jumlah - diskon as neto,
             (v_diskon_nota::numeric * (jumlah - diskon)) / v_subtotal as tepat
      from public.sale_items
      where sale_id = v_sale_id
    ),
    bawah as (
      select id, floor(tepat)::bigint as dasar,
             row_number() over (order by tepat - floor(tepat) desc, neto desc, urutan) as peringkat
      from porsi
    )
    update public.sale_items si
    set alokasi_diskon_nota = b.dasar
      + case when b.peringkat <= v_diskon_nota - (select sum(dasar) from bawah) then 1 else 0 end
    from bawah b
    where si.id = b.id;
  end if;

  -- Mutasi keluar mencatat HPP, bukan harga jual (PRD 8).
  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, user_id)
  select si.product_id, 'jual', -si.qty, si.hpp_satuan, 'sale', si.sale_id, p_user_id
  from public.sale_items si
  where si.sale_id = v_sale_id and si.tipe = 'part'
  order by si.urutan;

  return jsonb_build_object(
    'id', v_sale_id, 'nomor', v_nomor, 'nomor_asli', v_nomor_asli,
    'total', v_total, 'sudah_ada', false
  );
end;
$$;

-- Void membatalkan seluruh nota. Stok kembali dengan HPP dari nota asal (PRD 4.7).
create or replace function public.void_sale(p_sale_id uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_alasan text := private.tidy_text(p_alasan);
  v_nota public.sales;
begin
  if v_alasan is null then
    raise exception 'Alasan void wajib diisi';
  end if;
  select * into v_nota from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Nota tidak ditemukan';
  end if;
  if v_nota.status = 'void' then
    raise exception 'Nota % sudah di-void', v_nota.nomor;
  end if;

  update public.sales
  set status = 'void', void_alasan = v_alasan, void_oleh = v_user, void_pada = now()
  where id = p_sale_id;

  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, user_id)
  select si.product_id, 'void_jual', si.qty, si.hpp_satuan, 'sale', si.sale_id, v_user
  from public.sale_items si
  where si.sale_id = p_sale_id and si.tipe = 'part'
  order by si.urutan;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'void_nota', 'sales', p_sale_id::text,
    jsonb_build_object('nomor', v_nota.nomor, 'status', 'lunas', 'total', v_nota.total),
    jsonb_build_object('status', 'void', 'alasan', v_alasan)
  );
end;
$$;

-- Daftar nopol dengan nama pelanggan dari nota terakhirnya, untuk isian otomatis (PRD 4.6).
create or replace view public.nopol_last_customer
with (security_invoker = true)
as
select distinct on (s.nopol_kunci)
  s.nopol_kunci,
  s.nopol,
  s.nama_pelanggan,
  s.dibuat_pada
from public.sales s
where s.nopol_kunci is not null and s.nopol_kunci <> ''
order by s.nopol_kunci, s.dibuat_pada desc;

-- Penerimaan -----------------------------------------------------------------

-- p_items: [{"product_id", "qty", "harga_beli"}]. Harga beli Rp 0 boleh untuk barang bonus (R6).
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
    v_harga := (v_baris.data ->> 'harga_beli')::bigint;
    perform private.check_qty(v_qty, v_produk.bisa_pecahan, v_produk.nama);
    if v_harga is null or v_harga < 0 then
      raise exception 'Harga beli % tidak valid', v_produk.nama;
    end if;
    insert into public.receipt_items (receipt_id, urutan, product_id, qty, harga_beli)
    values (v_id, v_baris.urutan, v_produk.id, v_qty, v_harga);
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

-- Void membatalkan seluruh penerimaan. Stok boleh menjadi minus, dan rata-rata dihitung ulang (PRD 4.4, R7).
create or replace function public.void_receipt(p_receipt_id uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_alasan text := private.tidy_text(p_alasan);
  v_penerimaan public.receipts;
begin
  if v_alasan is null then
    raise exception 'Alasan void wajib diisi';
  end if;
  select * into v_penerimaan from public.receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Penerimaan tidak ditemukan';
  end if;
  if v_penerimaan.status = 'void' then
    raise exception 'Penerimaan % sudah di-void', v_penerimaan.nomor;
  end if;

  -- Status diubah dulu, supaya hitung ulang rata-rata sudah mengabaikan penerimaan ini.
  update public.receipts
  set status = 'void', void_alasan = v_alasan, void_oleh = v_user, void_pada = now()
  where id = p_receipt_id;

  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, user_id)
  select ri.product_id, 'void_beli', -ri.qty, ri.harga_beli, 'receipt', ri.receipt_id, v_user
  from public.receipt_items ri
  where ri.receipt_id = p_receipt_id
  order by ri.urutan;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'void_penerimaan', 'receipts', p_receipt_id::text,
    jsonb_build_object('nomor', v_penerimaan.nomor, 'status', 'aktif'),
    jsonb_build_object('status', 'void', 'alasan', v_alasan)
  );
end;
$$;

-- Penyesuaian stok -----------------------------------------------------------

-- p_qty positif = tambah, negatif = kurang. Alasan dari daftar tetap, "lainnya" wajib keterangan (R8).
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

  -- Penyesuaian tambah masuk dengan rata-rata saat itu. Part tanpa rata-rata wajib disertai harga beli (PRD 4.3).
  if p_qty > 0 and v_produk.harga_beli_avg = 0 then
    if p_harga_beli is null or p_harga_beli <= 0 then
      raise exception 'Harga beli wajib diisi karena % belum punya harga rata-rata', v_produk.nama;
    end if;
    v_hpp := p_harga_beli;
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

-- Kartu stok per part: tanggal, jenis, nomor dokumen, qty masuk/keluar, saldo, HPP, akun (PRD 4.3).
create or replace view public.stock_card
with (security_invoker = true)
as
select
  sm.id,
  sm.product_id,
  sm.created_at,
  sm.jenis,
  sm.qty,
  case when sm.qty > 0 then sm.qty end as qty_masuk,
  case when sm.qty < 0 then -sm.qty end as qty_keluar,
  sum(sm.qty) over (partition by sm.product_id order by sm.id) as saldo,
  sm.hpp_satuan,
  sm.ref_type,
  sm.ref_id,
  coalesce(s.nomor, r.nomor, o.nomor) as nomor_dokumen,
  sm.alasan,
  sm.keterangan,
  sm.user_id,
  pr.nama as nama_akun
from public.stock_movements sm
left join public.sales s on sm.ref_type = 'sale' and s.id = sm.ref_id
left join public.receipts r on sm.ref_type = 'receipt' and r.id = sm.ref_id
left join public.stock_opnames o on sm.ref_type = 'opname' and o.id = sm.ref_id
left join public.profiles pr on pr.id = sm.user_id;

-- Stock opname ---------------------------------------------------------------

create or replace function public.open_opname(p_jenis text, p_category_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_terbuka text;
  v_nomor text;
  v_id uuid;
begin
  if p_jenis is null or p_jenis not in ('penuh', 'kategori') then
    raise exception 'Jenis sesi opname harus penuh atau kategori';
  end if;
  if p_jenis = 'kategori' and (p_category_id is null or not exists (select 1 from public.categories where id = p_category_id)) then
    raise exception 'Kategori sesi opname wajib dipilih';
  end if;
  if p_jenis = 'penuh' and p_category_id is not null then
    raise exception 'Sesi opname penuh tidak memakai kategori';
  end if;
  select nomor into v_terbuka from public.stock_opnames where status = 'dibuka';
  if found then
    raise exception 'Masih ada sesi opname yang terbuka: %', v_terbuka;
  end if;

  v_nomor := private.next_document_number('opname');
  insert into public.stock_opnames (nomor, jenis, category_id, dibuka_oleh)
  values (v_nomor, p_jenis, p_category_id, v_user)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'nomor', v_nomor);
end;
$$;

-- Sesi terbuka dan part yang masuk cakupannya (penuh = semua part aktif). Dipakai fungsi opname di bawah.
create or replace function private.require_open_opname(p_opname_id uuid, p_product_ids uuid[])
returns public.stock_opnames
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opname public.stock_opnames;
  v_luar text;
begin
  select * into v_opname from public.stock_opnames where id = p_opname_id;
  if not found or v_opname.status <> 'dibuka' then
    raise exception 'Sesi opname tidak terbuka';
  end if;
  select string_agg(coalesce(p.nama, x.id::text), ', ') into v_luar
  from unnest(p_product_ids) as x(id)
  left join public.products p on p.id = x.id
  where p.id is null or p.tipe <> 'part' or not p.aktif
     or (v_opname.jenis = 'kategori' and p.category_id <> v_opname.category_id);
  if v_luar is not null then
    raise exception 'Part di luar cakupan sesi opname: %', v_luar;
  end if;
  return v_opname;
end;
$$;

-- Mencatat hitungan satu part. p_tambah = true untuk scan (+qty), false untuk mengetik qty.
-- Stok sistem pada waktu hitung disimpan sebagai pembanding selisih (PRD 4.5).
create or replace function public.record_opname_count(
  p_opname_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_tambah boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_produk public.products;
  v_stok numeric;
  v_qty numeric;
begin
  perform private.require_open_opname(p_opname_id, array[p_product_id]);
  select * into v_produk from public.products where id = p_product_id;
  if p_qty is null or p_qty < 0 or p_qty <> round(p_qty, 2)
     or (not v_produk.bisa_pecahan and p_qty <> trunc(p_qty)) then
    raise exception 'Qty hitung % tidak valid', v_produk.nama;
  end if;
  select qty_on_hand into v_stok from public.stock_levels where product_id = p_product_id;

  insert into public.stock_opname_items as i (
    opname_id, product_id, keputusan, qty_hitung, dihitung_pada, stok_sistem_saat_hitung, dihitung_oleh
  )
  values (p_opname_id, p_product_id, 'dihitung', p_qty, now(), v_stok, v_user)
  on conflict (opname_id, product_id) do update set
    keputusan = 'dihitung',
    qty_hitung = case when p_tambah and i.keputusan = 'dihitung' then i.qty_hitung + p_qty else p_qty end,
    dihitung_pada = now(),
    stok_sistem_saat_hitung = v_stok,
    dihitung_oleh = v_user
  returning qty_hitung into v_qty;
  return v_qty;
end;
$$;

-- Keputusan untuk part yang belum dihitung: dianggap 0 atau dilewati (PRD 4.5).
-- Part yang sudah dihitung tidak ikut berubah, jadi bisa dipakai untuk "pilih sekaligus".
create or replace function public.set_opname_decision(p_opname_id uuid, p_product_ids uuid[], p_keputusan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if p_keputusan is null or p_keputusan not in ('dianggap_nol', 'dilewati') then
    raise exception 'Keputusan harus dianggap 0 atau dilewati';
  end if;
  perform private.require_open_opname(p_opname_id, p_product_ids);

  insert into public.stock_opname_items as i (opname_id, product_id, keputusan)
  select p_opname_id, x.id, p_keputusan
  from unnest(p_product_ids) as x(id)
  on conflict (opname_id, product_id) do update set keputusan = excluded.keputusan
  where i.keputusan <> 'dihitung';
end;
$$;

-- Alasan selisih untuk satu atau beberapa part sekaligus (R8). p_alasan null menghapus alasan.
create or replace function public.set_opname_reason(
  p_opname_id uuid,
  p_product_ids uuid[],
  p_alasan text,
  p_keterangan text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keterangan text := private.tidy_text(p_keterangan);
begin
  perform private.require_active_user();
  if p_alasan is not null and p_alasan not in ('rusak', 'hilang', 'ketemu', 'salah_input', 'lainnya') then
    raise exception 'Alasan harus rusak, hilang, ketemu, salah input, atau lainnya';
  end if;
  if p_alasan = 'lainnya' and v_keterangan is null then
    raise exception 'Keterangan wajib diisi untuk alasan Lainnya';
  end if;
  perform private.require_open_opname(p_opname_id, p_product_ids);

  update public.stock_opname_items
  set alasan = p_alasan, alasan_keterangan = case when p_alasan is null then null else v_keterangan end
  where opname_id = p_opname_id and product_id = any (p_product_ids);
end;
$$;

-- Harga beli untuk selisih lebih pada part tanpa harga rata-rata (PRD 4.5). Null menghapusnya.
create or replace function public.set_opname_purchase_price(p_opname_id uuid, p_product_id uuid, p_harga_beli bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if p_harga_beli is not null and p_harga_beli <= 0 then
    raise exception 'Harga beli harus lebih dari Rp 0';
  end if;
  perform private.require_open_opname(p_opname_id, array[p_product_id]);
  update public.stock_opname_items
  set harga_beli_input = p_harga_beli
  where opname_id = p_opname_id and product_id = p_product_id;
  if not found then
    raise exception 'Part ini belum dihitung di sesi opname';
  end if;
end;
$$;

-- Daftar tinjau: semua part dalam cakupan, termasuk yang belum dihitung, dengan selisih
-- dalam qty dan rupiah. Urutannya sama dengan lembar hitung: kategori, nama, merek (PRD 4.5).
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
    coalesce(h.selisih > 0 and p.harga_beli_avg = 0, false)
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

-- Konfirmasi: mutasi "opname" sebesar selisih, ditambahkan ke stok saat itu (PRD 4.5).
-- Sesi yang sudah dikonfirmasi tidak bisa dibatalkan.
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

  select string_agg(nama, ', ') into v_masalah from (
    select p.nama
    from public.stock_opname_items i
    join public.products p on p.id = i.product_id
    where i.opname_id = p_opname_id and i.selisih > 0 and p.harga_beli_avg = 0 and i.harga_beli_input is null
    order by p.nama
    limit 5
  ) x;
  if v_masalah is not null then
    raise exception 'Harga beli wajib diisi untuk part tanpa harga rata-rata: %', v_masalah;
  end if;

  insert into public.stock_movements (product_id, jenis, qty, hpp_satuan, ref_type, ref_id, alasan, keterangan, user_id)
  select
    i.product_id, 'opname', i.selisih,
    case when i.selisih > 0 and p.harga_beli_avg = 0 then i.harga_beli_input else p.harga_beli_avg end,
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

-- Batalkan sesi terbuka: stok tidak berubah, hasil hitungan tetap tersimpan (PRD 4.5).
create or replace function public.cancel_opname(p_opname_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_user();
  v_opname public.stock_opnames;
begin
  select * into v_opname from public.stock_opnames where id = p_opname_id for update;
  if not found or v_opname.status <> 'dibuka' then
    raise exception 'Sesi opname tidak terbuka';
  end if;
  update public.stock_opnames
  set status = 'dibatalkan', dibatalkan_pada = now(), dibatalkan_oleh = v_user
  where id = p_opname_id;
  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (
    v_user, 'batalkan_opname', 'stock_opnames', p_opname_id::text,
    jsonb_build_object('nomor', v_opname.nomor, 'status', 'dibuka'),
    jsonb_build_object('status', 'dibatalkan')
  );
end;
$$;

-- Hak eksekusi ---------------------------------------------------------------

grant select on public.stock_card, public.nopol_last_customer to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on all functions in schema private from public;
