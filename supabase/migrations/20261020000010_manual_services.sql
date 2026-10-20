-- Kashiru 10: jasa manual di Kasir. Kasir bisa mengetik nama dan tarif jasa yang belum ada di menu Jasa.
-- Jasa manual hanya tercatat di baris nota (product_id kosong), tidak masuk daftar jasa, dan tetap bisa
-- dibuat saat offline. Di laporan, jasa manual dihitung sebagai omzet jasa dengan kategori "Jasa manual".

alter table public.sale_items alter column product_id drop not null;
alter table public.sale_items add constraint jasa_manual check (
  product_id is not null or (tipe = 'jasa' and merek_snapshot is null)
);

-- p_items: [{"product_id", "qty", "harga", "diskon_jenis", "diskon_input"}] untuk produk, atau
-- [{"product_id": null, "nama", "qty", "harga", ...}] untuk jasa manual.
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
  v_product_id uuid;
  v_nama text;
  v_merek text;
  v_tipe text;
  v_hpp numeric;
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
    v_qty := (v_baris.data ->> 'qty')::numeric;
    v_harga := (v_baris.data ->> 'harga')::bigint;
    if v_baris.data ->> 'product_id' is null then
      -- Jasa manual: nama diketik kasir, tanpa produk dan tanpa stok.
      v_nama := private.tidy_text(v_baris.data ->> 'nama');
      if v_nama is null then
        raise exception 'Nama jasa manual di baris % kosong', v_baris.urutan;
      end if;
      if length(v_nama) > 100 then
        raise exception 'Nama jasa manual di baris % lebih dari 100 huruf', v_baris.urutan;
      end if;
      v_product_id := null;
      v_merek := null;
      v_tipe := 'jasa';
      perform private.check_qty(v_qty, false, v_nama);
    else
      select * into v_produk from public.products where id = (v_baris.data ->> 'product_id')::uuid;
      if not found then
        raise exception 'Produk di baris % tidak dikenal', v_baris.urutan;
      end if;
      v_product_id := v_produk.id;
      v_nama := v_produk.nama;
      v_merek := v_produk.merek;
      v_tipe := v_produk.tipe;
      perform private.check_qty(v_qty, v_produk.tipe = 'part' and v_produk.bisa_pecahan, v_produk.nama);
    end if;
    if v_harga is null or v_harga < 0 then
      raise exception 'Harga % tidak valid', v_nama;
    end if;
    -- HPP = harga beli rata-rata saat nota diterima server (PRD 7.5). Jasa tidak punya HPP.
    v_hpp := case when v_tipe = 'part' then v_produk.harga_beli_avg end;
    v_jumlah := round(v_qty * v_harga);
    v_diskon := private.compute_discount(
      v_baris.data ->> 'diskon_jenis', (v_baris.data ->> 'diskon_input')::numeric, v_jumlah
    );
    v_subtotal := v_subtotal + v_jumlah - v_diskon;
    v_semua_baris := v_semua_baris || jsonb_build_object(
      'urutan', v_baris.urutan,
      'product_id', v_product_id,
      'nama_snapshot', v_nama,
      'merek_snapshot', v_merek,
      'tipe', v_tipe,
      'qty', v_qty,
      'harga', v_harga,
      'jumlah', v_jumlah,
      'diskon_jenis', v_baris.data ->> 'diskon_jenis',
      'diskon_input', (v_baris.data ->> 'diskon_input')::numeric,
      'diskon', v_diskon,
      'hpp_satuan', v_hpp
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

-- Nama di nota ikut dibawa, untuk mengelompokkan jasa manual di laporan per produk.
create or replace view public.sale_lines
with (security_invoker = true)
as
select
  s.id as sale_id,
  s.tanggal_nota,
  s.metode_bayar,
  s.mechanic_id,
  i.product_id,
  i.tipe,
  i.qty,
  i.diskon + i.alokasi_diskon_nota as diskon,
  i.jumlah - i.diskon - i.alokasi_diskon_nota as omzet,
  case when i.tipe = 'part' then round(i.qty * i.hpp_satuan)::bigint else 0 end as hpp,
  i.nama_snapshot
from public.sales s
join public.sale_items i on i.sale_id = s.id
where s.status = 'lunas';

-- Per kategori. Jasa manual tidak punya kategori, jadi dikumpulkan sebagai "Jasa manual".
create or replace function public.report_sales_by_category(p_from date, p_to date)
returns table (category_id uuid, kategori text, omzet bigint, hpp bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id, coalesce(k.nama, 'Jasa manual'), sum(l.omzet)::bigint, sum(l.hpp)::bigint
  from public.sale_lines l
  left join public.products p on p.id = l.product_id
  left join public.categories k on k.id = p.category_id
  where l.tanggal_nota between p_from and p_to
  group by k.id, k.nama
  order by sum(l.omzet) desc, 2
$$;

-- Per produk. Jasa manual dikelompokkan per nama (tanpa membedakan huruf besar-kecil).
create or replace function public.report_sales_by_product(p_from date, p_to date)
returns table (product_id uuid, nama text, merek text, tipe text, kategori text, qty numeric, omzet bigint, hpp bigint, stok numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select p.id, p.nama, p.merek, p.tipe, k.nama as kategori, sum(l.qty) as qty, sum(l.omzet)::bigint as omzet,
           sum(l.hpp)::bigint as hpp, case when p.tipe = 'part' then sl.qty_on_hand end as stok
    from public.sale_lines l
    join public.products p on p.id = l.product_id
    join public.categories k on k.id = p.category_id
    left join public.stock_levels sl on sl.product_id = p.id
    where l.tanggal_nota between p_from and p_to
    group by p.id, p.nama, p.merek, p.tipe, k.nama, sl.qty_on_hand
    union all
    select null, min(l.nama_snapshot), null, 'jasa', 'Jasa manual', sum(l.qty), sum(l.omzet)::bigint, 0, null
    from public.sale_lines l
    where l.product_id is null and l.tanggal_nota between p_from and p_to
    group by lower(l.nama_snapshot)
  ) r
  order by r.omzet - r.hpp desc, r.nama, r.id
$$;
