-- Kashiru 9: semua laptop setara (R50). Konsep Perangkat Kasir dihapus: siapa pun yang login bisa membuat
-- nota dari laptop mana pun, online maupun offline. Nomor nota tetap dibuat laptop yang membuatnya; kalau dua
-- laptop memakai nomor yang sama, server memberi nomor kosong berikutnya dan menyimpan nomor aslinya (PRD 4.13).
-- Tabel cashier_devices dan riwayatnya tetap disimpan, tetapi tidak dipakai lagi untuk menolak nota.

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

  -- Tanggal nota = tanggal nota dibuat menurut jam laptop yang membuatnya, dalam WIB.
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

  -- Server sengaja longgar terhadap nota offline (PRD 4.13): akun pembuat cukup terdaftar walaupun
  -- sekarang nonaktif. Laptop mana pun boleh membuat nota (R50); device_id hanya disimpan sebagai keterangan.
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

-- Hak akses ditulis eksplisit (lihat migrasi 3).
revoke execute on function public.checkout_sale(uuid, uuid, uuid, text, integer, timestamptz, jsonb, text, bigint, bigint, text, numeric, text, text, uuid, text) from public, anon;
grant execute on function public.checkout_sale(uuid, uuid, uuid, text, integer, timestamptz, jsonb, text, bigint, bigint, text, numeric, text, text, uuid, text) to authenticated, service_role;
