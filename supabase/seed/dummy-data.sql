-- Data contoh Kashiru untuk mencoba semua fitur: produk (part dan jasa), stok awal, barcode internal,
-- penerimaan (termasuk barang bonus dan penerimaan void), nota 30 hari terakhir (semua metode bayar, diskon,
-- nopol, mekanik, nota void), penyesuaian stok, opname (dikonfirmasi dan dibatalkan), perubahan harga, dan
-- status stok Aman/Menipis/Habis/Minus, slow-moving, serta part tanpa harga beli.
--
-- HANYA UNTUK PROJECT UJI. Kartu stok dan riwayat perubahan tidak bisa dihapus lewat aplikasi; untuk
-- mengosongkan lagi, jalankan supabase/seed/reset-data.sql.
--
-- Prasyarat: semua migrasi sudah dijalankan (termasuk 20261019000009) dan sudah ada minimal satu akun aktif.
-- Cara pakai: tempel seluruh isi file ini di SQL Editor Supabase lalu Run. Semua langkah dicatat atas nama
-- akun aktif pertama; nota dibuat bergantian oleh semua akun aktif. Setelah selesai, buka ulang aplikasi
-- supaya salinan produk di laptop dimuat ulang.

-- Tabel dan fungsi sementara hilang di akhir transaksi, jadi file ini aman dijalankan ulang di sesi yang sama.
create temporary table seed_marks (mov bigint not null, log bigint not null) on commit drop;
insert into seed_marks
select coalesce((select max(id) from public.stock_movements), 0), coalesce((select max(id) from public.change_logs), 0);

-- Mutasi stok dan riwayat yang baru dibuat diberi waktu kejadian contohnya. Kedua tabel itu dikunci dari
-- perubahan oleh trigger hanya_tambah, yang dimatikan selama skrip ini berjalan (lihat blok di bawah).
-- Cara ini hanya butuh hak pemilik tabel; SQL Editor Supabase tidak boleh mengubah session_replication_role.
create or replace function pg_temp.seed_stamp(p_ts timestamptz) returns void language plpgsql as $f$
begin
  update public.stock_movements set created_at = p_ts where id > (select mov from pg_temp.seed_marks);
  update public.change_logs set created_at = p_ts where id > (select log from pg_temp.seed_marks);
  update pg_temp.seed_marks
  set mov = coalesce((select max(id) from public.stock_movements), 0),
      log = coalesce((select max(id) from public.change_logs), 0);
end;
$f$;

create temporary table seed_products (code text primary key, id uuid not null, created timestamptz not null) on commit drop;
create temporary table seed_times (kind text not null, id uuid not null, opened timestamptz, closed timestamptz) on commit drop;

do $$
declare
  v_owner uuid;
  v_users uuid[];
  v_prefix text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_devices uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  v_cat record;
  v_r record;
  v_id uuid;
  v_ts timestamptz;
  v_created timestamptz;
  v_off integer;
  v_day date;
  v_n integer;
  v_urut integer;
  v_s integer;
  v_code text;
  v_first text;
  v_pid uuid;
  v_price bigint;
  v_qty numeric;
  v_line jsonb;
  v_items jsonb;
  v_sub bigint;
  v_total bigint;
  v_nj text;
  v_ni numeric;
  v_method text;
  v_cash bigint;
  v_plate text;
  v_customer text;
  v_mech uuid;
  v_note text;
  v_service boolean;
  v_res jsonb;
  v_o jsonb;
  v_stock numeric;
  v_parts text[] := array['oli_mpx', 'yamalube', 'oli_gardan', 'shell', 'oli_curah', 'busi_cpr', 'busi_c7', 'kampas_depan',
    'kampas_belakang', 'minyak_rem', 'ban_luar', 'ban_dalam', 'lampu', 'sekring', 'filter_udara', 'v_belt', 'baut'];
  v_jasa text[] := array['servis_ringan', 'servis_besar', 'ganti_oli', 'tambal', 'cvt', 'cek'];
  v_plates text[] := array['B 1234 XYZ', 'B 4567 KJT', 'F 2231 AB', 'B 6612 TRQ', 'D 1890 ZZ', 'B 3301 PLM', 'B 9087 UUY', 'A 5521 KO'];
  v_customers text[] := array['Pak Budi', 'Bu Sari', 'Andre', 'Pak Hendra', 'Rizky', 'Bu Wati', 'Dimas', 'Pak Joko Susilo'];
  v_mechanics uuid[];
  -- Nota yang di-void: hari ke-20 dan ke-3 lalu, digeser sehari kalau jatuh di hari Minggu (bengkel tutup).
  v_void_days integer[];
begin
  select array_agg(id order by created_at, id) into v_users from public.profiles where aktif;
  if v_users is null then
    raise exception 'Belum ada akun aktif. Buat akun pemilik dulu (npm run setup).';
  end if;
  v_owner := v_users[1];
  if position('cashier_devices' in pg_get_functiondef('public.checkout_sale'::regproc)) > 0 then
    raise exception 'Jalankan dulu migrasi 20261019000009_any_device_sales.sql.';
  end if;
  if exists (select 1 from public.products where nama = 'Oli MPX 1 0.8L') then
    raise exception 'Data contoh sudah pernah dimuat. Jalankan reset-data.sql dulu kalau ingin memuat ulang.';
  end if;
  select awalan_nota into v_prefix from public.store_settings where id = 1;
  v_void_days := array[
    case when extract(isodow from v_today - 20) = 7 then 19 else 20 end,
    case when extract(isodow from v_today - 3) = 7 then 4 else 3 end];
  -- Semua fungsi Kashiru dijalankan atas nama akun aktif pertama.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  -- Pengunci kartu stok dan riwayat dimatikan supaya waktu kejadiannya bisa diatur; dinyalakan lagi di akhir.
  alter table public.stock_movements disable trigger hanya_tambah;
  alter table public.change_logs disable trigger hanya_tambah;

  -- Kategori, mekanik, produk --------------------------------------------------------------------------
  for v_cat in select unnest(array['Oli', 'Busi', 'Rem', 'Ban', 'Kelistrikan', 'Filter', 'CVT', 'Baut & aksesoris', 'Jasa Servis']) as nama loop
    insert into public.categories (nama) values (v_cat.nama) on conflict do nothing;
  end loop;
  insert into public.mechanics (nama) values ('Andi'), ('Budi Santoso'), ('Joko'), ('Rudi') on conflict do nothing;

  for v_r in
    select * from (values
      ('oli_mpx', 'part', 'Oli MPX 1 0.8L', 'AHM', 'Oli', 'botol', false, 6, '8997001100011', '08232-M99-K8LN0', 52000, 24, 41000, 40),
      ('yamalube', 'part', 'Oli Yamalube Matic 0.8L', 'Yamalube', 'Oli', 'botol', false, 6, '8997001100028', null, 50000, 18, 39000, 40),
      ('oli_gardan', 'part', 'Oli Gardan 120ml', 'AHM', 'Oli', 'botol', false, 10, '8997001100035', null, 18000, 30, 12500, 40),
      ('shell', 'part', 'Oli Shell Advance AX7 1L', 'Shell', 'Oli', 'botol', false, 4, '8997001100042', null, 68000, 12, 53000, 40),
      ('oli_curah', 'part', 'Oli Curah', null, 'Oli', 'liter', true, 5, null, null, 45000, 20, 30000, 40),
      ('busi_cpr', 'part', 'Busi CPR8EA-9', 'NGK', 'Busi', 'pcs', false, 5, '8997001200014', null, 25000, 15, 17000, 40),
      ('busi_c7', 'part', 'Busi C7HSA', 'NGK', 'Busi', 'pcs', false, 5, '8997001200021', null, 18000, 6, 12000, 40),
      ('busi_denso', 'part', 'Busi U20EPR9', 'Denso', 'Busi', 'pcs', false, 3, '8997001200038', null, 30000, null, null, 40),
      ('kampas_depan', 'part', 'Kampas Rem Depan Vario 125', 'Federal', 'Rem', 'set', false, 4, '8997001300011', '06455-KZR-602', 45000, 10, 32000, 40),
      ('kampas_belakang', 'part', 'Kampas Rem Belakang Beat', 'AHM', 'Rem', 'set', false, 3, '8997001300028', null, 38000, 8, 27000, 40),
      ('minyak_rem', 'part', 'Minyak Rem DOT 3 300ml', 'Prestone', 'Rem', 'botol', false, 3, '8997001300035', null, 28000, 8, 19000, 40),
      ('ban_luar', 'part', 'Ban Luar 80/90-14', 'IRC', 'Ban', 'pcs', false, 2, '8997001400018', null, 210000, 6, 165000, 40),
      ('ban_dalam', 'part', 'Ban Dalam 2.50-17', 'Swallow', 'Ban', 'pcs', false, 3, '8997001400025', null, 38000, 10, 26000, 40),
      ('aki', 'part', 'Aki GTZ5S', 'GS Astra', 'Kelistrikan', 'pcs', false, 2, '8997001500015', null, 245000, 2, 205000, 40),
      ('lampu', 'part', 'Lampu Depan LED H6', 'Osram', 'Kelistrikan', 'pcs', false, 2, '8997001500022', null, 65000, 5, 45000, 40),
      ('sekring', 'part', 'Sekring 10A', null, 'Kelistrikan', 'pcs', false, 10, null, null, 2000, 50, 800, 40),
      ('filter_udara', 'part', 'Filter Udara Beat', 'AHM', 'Filter', 'pcs', false, 3, '8997001600012', '17210-K44-V00', 55000, 8, 40000, 40),
      ('v_belt', 'part', 'V-Belt Vario 125', 'AHM', 'CVT', 'pcs', false, 2, '8997001700019', null, 135000, 4, 105000, 40),
      ('roller', 'part', 'Roller Set 9 gr', 'TDR', 'CVT', 'set', false, 1, '8997001700026', null, 55000, 3, 38000, 120),
      ('kabel_gas', 'part', 'Kabel Gas Beat', 'AHM', 'Baut & aksesoris', 'pcs', false, 0, '8997001800016', null, 45000, 2, 30000, 120),
      ('baut', 'part', 'Baut 10 mm', null, 'Baut & aksesoris', 'pcs', false, 50, null, null, 1000, 200, 400, 40),
      ('spion', 'part', 'Spion Standar Beat', 'AHM', 'Baut & aksesoris', 'pasang', false, 0, '8997001800023', null, 60000, null, null, 40),
      ('oli_lama', 'part', 'Oli Lama 1L', 'Federal', 'Oli', 'botol', false, 0, '8997001100059', null, 40000, null, null, 40),
      ('servis_ringan', 'jasa', 'Servis Ringan', null, 'Jasa Servis', null, false, 0, null, null, 35000, null, null, 40),
      ('servis_besar', 'jasa', 'Servis Besar', null, 'Jasa Servis', null, false, 0, null, null, 85000, null, null, 40),
      ('ganti_oli', 'jasa', 'Jasa Ganti Oli', null, 'Jasa Servis', null, false, 0, null, null, 10000, null, null, 40),
      ('tambal', 'jasa', 'Tambal Ban', null, 'Jasa Servis', null, false, 0, null, null, 15000, null, null, 40),
      ('cvt', 'jasa', 'Bongkar CVT', null, 'Jasa Servis', null, false, 0, null, null, 40000, null, null, 40),
      ('cek', 'jasa', 'Cek Kendaraan', null, 'Jasa Servis', null, false, 0, null, null, 0, null, null, 40)
    ) as t(code, tipe, nama, merek, kategori, satuan, pecahan, stok_min, barcode, kode_part, harga, stok, beli, umur)
  loop
    v_id := public.create_product(
      p_tipe => v_r.tipe,
      p_nama => v_r.nama,
      p_category_id => (select id from public.categories where nama = v_r.kategori),
      p_harga_jual => v_r.harga::bigint,
      p_merek => v_r.merek::text,
      p_satuan => v_r.satuan::text,
      p_bisa_pecahan => v_r.pecahan,
      p_stok_min => v_r.stok_min::numeric,
      p_barcodes => case when v_r.barcode is null then '{}'::text[] else array[v_r.barcode::text] end,
      p_kode_part => case when v_r.kode_part is null then '[]'::jsonb
                          else jsonb_build_array(jsonb_build_object('kode_part', v_r.kode_part, 'jenis', 'oem')) end,
      p_stok_awal => v_r.stok::numeric,
      p_harga_beli => v_r.beli::bigint
    );
    v_created := ((v_today - v_r.umur) + time '08:00') at time zone 'Asia/Jakarta';
    insert into seed_products values (v_r.code, v_id, v_created);
    if v_r.code in ('sekring', 'baut') then
      perform public.create_internal_barcode(v_id);
    end if;
    perform pg_temp.seed_stamp(v_created);
  end loop;

  -- Hari demi hari, dari 30 hari lalu sampai hari ini --------------------------------------------------
  for v_off in reverse 30..0 loop
    v_day := v_today - v_off;
    v_ts := (v_day + time '10:00') at time zone 'Asia/Jakarta';

    if v_off = 28 then
      update public.products set aktif = false where id = (select id from seed_products where code = 'oli_lama');
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 25 then
      v_res := public.create_receipt(p_tanggal_faktur => v_day, p_items => jsonb_build_array(
        jsonb_build_object('product_id', (select id from seed_products where code = 'oli_mpx'), 'qty', 24, 'harga_beli', 42000),
        jsonb_build_object('product_id', (select id from seed_products where code = 'yamalube'), 'qty', 12, 'harga_beli', 40000),
        jsonb_build_object('product_id', (select id from seed_products where code = 'busi_cpr'), 'qty', 10, 'harga_beli', 17500),
        jsonb_build_object('product_id', (select id from seed_products where code = 'kampas_depan'), 'qty', 6, 'harga_beli', 33000),
        jsonb_build_object('product_id', (select id from seed_products where code = 'ban_dalam'), 'qty', 10, 'harga_beli', 26000)));
      insert into seed_times values ('receipt', (v_res ->> 'id')::uuid, v_ts, null);
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 22 then
      update public.products set stok_min = 4 where id = (select id from seed_products where code = 'kampas_belakang');
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 18 then
      update public.products set harga_jual = 54000 where id = (select id from seed_products where code = 'oli_mpx');
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 15 then
      perform public.adjust_stock(p_product_id => (select id from seed_products where code = 'lampu'), p_qty => -1,
        p_alasan => 'rusak', p_keterangan => 'Pecah saat dipasang');
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 12 then
      -- Barang bonus Rp 0, termasuk part tanpa harga beli rata-rata (tetap Rp 0, ditandai di laporan stok).
      v_res := public.create_receipt(p_tanggal_faktur => v_day, p_items => jsonb_build_array(
        jsonb_build_object('product_id', (select id from seed_products where code = 'oli_gardan'), 'qty', 20, 'harga_beli', 13000),
        jsonb_build_object('product_id', (select id from seed_products where code = 'oli_gardan'), 'qty', 2, 'harga_beli', 0),
        jsonb_build_object('product_id', (select id from seed_products where code = 'spion'), 'qty', 2, 'harga_beli', 0),
        jsonb_build_object('product_id', (select id from seed_products where code = 'filter_udara'), 'qty', 6, 'harga_beli', 41000)));
      insert into seed_times values ('receipt', (v_res ->> 'id')::uuid, v_ts, null);
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 10 then
      -- Opname per kategori Busi: satu part hilang.
      v_o := public.open_opname('kategori', (select id from public.categories where nama = 'Busi'));
      for v_r in select sp.code, sp.id from seed_products sp join public.products p on p.id = sp.id
                 join public.categories k on k.id = p.category_id where k.nama = 'Busi' loop
        select qty_on_hand into v_stock from public.stock_levels where product_id = v_r.id;
        perform public.record_opname_count(p_opname_id => (v_o ->> 'id')::uuid, p_product_id => v_r.id,
          p_qty => case when v_r.code = 'busi_cpr' and v_stock > 0 then v_stock - 1 else greatest(v_stock, 0) end);
        if v_r.code = 'busi_cpr' and v_stock > 0 then
          perform public.set_opname_reason((v_o ->> 'id')::uuid, array[v_r.id], 'hilang', null);
        end if;
      end loop;
      perform public.confirm_opname((v_o ->> 'id')::uuid);
      insert into seed_times values ('opname', (v_o ->> 'id')::uuid, v_ts - interval '2 hours', v_ts);
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 9 then
      v_o := public.open_opname('penuh', null);
      perform public.cancel_opname((v_o ->> 'id')::uuid);
      insert into seed_times values ('opname', (v_o ->> 'id')::uuid, v_ts - interval '1 hour', v_ts);
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 8 then
      -- Penerimaan salah harga di-void, lalu diinput ulang dengan benar.
      v_res := public.create_receipt(p_tanggal_faktur => v_day, p_items => jsonb_build_array(
        jsonb_build_object('product_id', (select id from seed_products where code = 'lampu'), 'qty', 5, 'harga_beli', 64000)));
      perform pg_temp.seed_stamp(v_ts);
      perform public.void_receipt((v_res ->> 'id')::uuid, 'Salah input harga, diinput ulang');
      insert into seed_times values ('receipt', (v_res ->> 'id')::uuid, v_ts, v_ts + interval '30 minutes');
      perform pg_temp.seed_stamp(v_ts + interval '30 minutes');
      v_res := public.create_receipt(p_tanggal_faktur => v_day, p_items => jsonb_build_array(
        jsonb_build_object('product_id', (select id from seed_products where code = 'lampu'), 'qty', 5, 'harga_beli', 46000)));
      insert into seed_times values ('receipt', (v_res ->> 'id')::uuid, v_ts + interval '40 minutes', null);
      perform pg_temp.seed_stamp(v_ts + interval '40 minutes');
    elsif v_off = 6 then
      update public.mechanics set aktif = false where nama = 'Rudi';
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 5 then
      perform public.adjust_stock(p_product_id => (select id from seed_products where code = 'baut'), p_qty => 10,
        p_alasan => 'ketemu', p_keterangan => 'Ketemu di laci bawah');
      perform pg_temp.seed_stamp(v_ts);
    elsif v_off = 3 then
      v_res := public.create_receipt(p_tanggal_faktur => v_day, p_items => jsonb_build_array(
        jsonb_build_object('product_id', (select id from seed_products where code = 'oli_curah'), 'qty', 10, 'harga_beli', 31000),
        jsonb_build_object('product_id', (select id from seed_products where code = 'v_belt'), 'qty', 2, 'harga_beli', 106000)));
      insert into seed_times values ('receipt', (v_res ->> 'id')::uuid, v_ts, null);
      perform pg_temp.seed_stamp(v_ts);
    end if;

    -- Bengkel tutup hari Minggu.
    continue when extract(isodow from v_day) = 7;

    select array_agg(id order by nama) into v_mechanics from public.mechanics where aktif;
    v_n := 2 + (v_off * 7) % 4;
    select coalesce(max(urut), 0) into v_urut from public.sales where tanggal_nota = v_day;
    for k in 1..v_n loop
      v_s := v_off * 31 + k * 17;
      v_ts := ((v_day + time '08:30') + make_interval(mins => k * 95)) at time zone 'Asia/Jakarta';
      if v_ts > now() then
        v_ts := now() - make_interval(mins => (v_n - k + 1) * 3);
      end if;

      -- Part utama. Aki (stok 2) sengaja dijual di empat hari dengan hari-minggu berbeda, jadi minimal tiga kali
      -- walaupun salah satunya hari Minggu, supaya selalu ada part berstatus Minus.
      v_first := case when v_off in (12, 6, 2, 1) and k = 1 then 'aki' else v_parts[1 + v_s % array_length(v_parts, 1)] end;
      select p.id, p.harga_jual into v_pid, v_price from public.products p where p.id = (select id from seed_products where code = v_first);
      v_qty := case v_first when 'baut' then 4 when 'sekring' then 2 when 'oli_curah' then 1.5 else 1 end;
      v_line := jsonb_build_object('product_id', v_pid, 'qty', v_qty, 'harga', v_price);
      if v_s % 7 = 0 and round(v_qty * v_price) > 5000 then
        v_line := v_line || jsonb_build_object('diskon_jenis', 'nominal', 'diskon_input', 2000);
      end if;
      v_items := jsonb_build_array(v_line);

      -- Jasa.
      v_service := v_s % 3 <> 0;
      v_note := null;
      if v_service then
        v_code := v_jasa[1 + v_s % array_length(v_jasa, 1)];
        select p.id, p.harga_jual into v_pid, v_price from public.products p where p.id = (select id from seed_products where code = v_code);
        v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', case when v_code = 'tambal' then 2 else 1 end, 'harga', v_price));
        if v_code in ('servis_ringan', 'servis_besar', 'ganti_oli') then
          v_note := 'Ganti oli berikutnya: ' || replace(to_char(15000 + (v_s * 37) % 20000, 'FM999,999'), ',', '.') || ' km';
        end if;
      end if;

      -- Part kedua.
      if v_s % 5 = 0 then
        v_code := v_parts[1 + (v_s / 5) % array_length(v_parts, 1)];
        if v_code <> v_first then
          select p.id, p.harga_jual into v_pid, v_price from public.products p where p.id = (select id from seed_products where code = v_code);
          v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_pid,
            'qty', case v_code when 'baut' then 4 when 'sekring' then 2 when 'oli_curah' then 1.5 else 1 end, 'harga', v_price));
        end if;
      end if;

      -- Total dihitung dengan aturan yang sama dengan server (pembulatan dan diskon, PRD 4.6).
      select coalesce(sum(round((e ->> 'qty')::numeric * (e ->> 'harga')::bigint)
               - private.compute_discount(e ->> 'diskon_jenis', (e ->> 'diskon_input')::numeric,
                   round((e ->> 'qty')::numeric * (e ->> 'harga')::bigint)::bigint)), 0)
      into v_sub
      from jsonb_array_elements(v_items) e;
      v_nj := case when v_s % 11 = 0 then 'persen' end;
      v_ni := case when v_s % 11 = 0 then 5 end;
      v_total := v_sub - private.compute_discount(v_nj, v_ni, v_sub);

      v_method := case when v_s % 10 < 5 then 'tunai' when v_s % 10 < 7 then 'qris' when v_s % 10 < 9 then 'transfer' else 'edc' end;
      v_cash := case when v_method <> 'tunai' then null
                     when v_s % 4 = 0 then v_total
                     else (ceil(v_total / 10000.0) * 10000)::bigint end;
      if v_service or v_s % 2 = 0 then
        v_plate := v_plates[1 + (v_s / 3) % array_length(v_plates, 1)];
        v_customer := case when v_s % 13 = 0 then null else v_customers[1 + (v_s / 3) % array_length(v_customers, 1)] end;
      else
        v_plate := null;
        v_customer := null;
      end if;
      v_mech := case when v_service and v_s % 9 <> 0 then v_mechanics[1 + v_s % array_length(v_mechanics, 1)] end;

      v_res := public.checkout_sale(
        p_client_id => gen_random_uuid(),
        p_device_id => v_devices[1 + k % 2],
        p_user_id => v_users[1 + v_s % array_length(v_users, 1)],
        p_awalan => v_prefix,
        p_urut => v_urut + k,
        p_dibuat_pada => v_ts,
        p_items => v_items,
        p_metode_bayar => v_method,
        p_total => v_total,
        p_uang_diterima => v_cash,
        p_diskon_nota_jenis => v_nj,
        p_diskon_nota_input => v_ni,
        p_nopol => v_plate,
        p_nama_pelanggan => v_customer,
        p_mechanic_id => v_mech,
        p_catatan_servis => v_note
      );
      perform pg_temp.seed_stamp(v_ts);

      if v_off = any (v_void_days) and k = 1 then
        perform public.void_sale((v_res ->> 'id')::uuid, 'Salah input, pelanggan batal');
        insert into seed_times values ('sale', (v_res ->> 'id')::uuid, v_ts, v_ts + interval '20 minutes');
        perform pg_temp.seed_stamp(v_ts + interval '20 minutes');
      end if;
    end loop;
  end loop;

  -- Waktu kejadian di tabel lain. Trigger tabel itu (riwayat perubahan, perapian teks) dimatikan sebentar
  -- supaya pengaturan waktu ini tidak tercatat sebagai perubahan.
  alter table public.products disable trigger user;
  update public.products p set created_at = sp.created from seed_products sp where p.id = sp.id;
  alter table public.products enable trigger user;
  alter table public.categories disable trigger user;
  update public.categories set created_at = ((v_today - 40) + time '07:30') at time zone 'Asia/Jakarta'
  where nama in ('Oli', 'Busi', 'Rem', 'Ban', 'Kelistrikan', 'Filter', 'CVT', 'Baut & aksesoris', 'Jasa Servis');
  alter table public.categories enable trigger user;
  alter table public.mechanics disable trigger user;
  update public.mechanics set created_at = ((v_today - 40) + time '07:30') at time zone 'Asia/Jakarta'
  where nama in ('Andi', 'Budi Santoso', 'Joko', 'Rudi');
  alter table public.mechanics enable trigger user;
  alter table public.receipts disable trigger user;
  update public.receipts r set dibuat_pada = t.opened, void_pada = coalesce(t.closed, r.void_pada)
  from seed_times t where t.kind = 'receipt' and r.id = t.id;
  alter table public.receipts enable trigger user;
  alter table public.sales disable trigger user;
  update public.sales s set void_pada = t.closed from seed_times t where t.kind = 'sale' and s.id = t.id;
  alter table public.sales enable trigger user;
  alter table public.stock_opnames disable trigger user;
  update public.stock_opnames o set dibuka_pada = t.opened,
    dikonfirmasi_pada = case when o.status = 'dikonfirmasi' then t.closed else o.dikonfirmasi_pada end,
    dibatalkan_pada = case when o.status = 'dibatalkan' then t.closed else o.dibatalkan_pada end
  from seed_times t where t.kind = 'opname' and o.id = t.id;
  alter table public.stock_opnames enable trigger user;
  alter table public.stock_opname_items disable trigger user;
  update public.stock_opname_items i set dihitung_pada = t.opened + interval '30 minutes'
  from seed_times t where t.kind = 'opname' and i.opname_id = t.id and i.dihitung_pada is not null;
  alter table public.stock_opname_items enable trigger user;
  alter table public.stock_movements enable trigger hanya_tambah;
  alter table public.change_logs enable trigger hanya_tambah;

  raise notice 'Data contoh dimuat: % produk, % nota, % penerimaan.',
    (select count(*) from seed_products), (select count(*) from public.sales), (select count(*) from public.receipts);
end;
$$;
