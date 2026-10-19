-- Kashiru 7: laporan, dashboard, dan menu Riwayat (PRD 4.11, 4.12, R28-R35).
-- Semua fungsi dan view berjalan dengan hak pemanggil, jadi RLS tetap berlaku: hanya akun aktif yang
-- mendapat data. Periode memakai tanggal WIB: tanggal nota, tanggal faktur, atau tanggal konfirmasi opname.
-- Omzet = yang dibayar pelanggan, setelah diskon baris dan alokasi diskon nota (R28). Laba kotor =
-- omzet - HPP; jasa tidak punya HPP. Nota dan penerimaan yang di-void tidak dihitung.

-- Satu baris per item nota yang tidak di-void, dengan omzet dan HPP-nya.
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
  case when i.tipe = 'part' then round(i.qty * i.hpp_satuan)::bigint else 0 end as hpp
from public.sales s
join public.sale_items i on i.sale_id = s.id
where s.status = 'lunas';

-- Ringkasan penjualan dalam periode, termasuk jumlah kendaraan (nopol berbeda) dan nota void.
create or replace function public.report_sales_summary(p_from date, p_to date)
returns table (
  nota integer,
  kendaraan integer,
  omzet_part bigint,
  omzet_jasa bigint,
  diskon bigint,
  total bigint,
  hpp bigint,
  void_nota integer,
  void_total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with nota as (
    select * from public.sales where tanggal_nota between p_from and p_to
  ),
  baris as (
    select * from public.sale_lines where tanggal_nota between p_from and p_to
  )
  select
    (select count(*) from nota where status = 'lunas')::integer,
    (select count(distinct nopol_kunci) from nota where status = 'lunas')::integer,
    (select coalesce(sum(omzet) filter (where tipe = 'part'), 0) from baris)::bigint,
    (select coalesce(sum(omzet) filter (where tipe = 'jasa'), 0) from baris)::bigint,
    (select coalesce(sum(diskon), 0) from baris)::bigint,
    (select coalesce(sum(total), 0) from nota where status = 'lunas')::bigint,
    (select coalesce(sum(hpp), 0) from baris)::bigint,
    (select count(*) from nota where status = 'void')::integer,
    (select coalesce(sum(total), 0) from nota where status = 'void')::bigint
$$;

-- Per hari, termasuk hari tanpa penjualan (grafik 30 hari dan tabel per hari).
create or replace function public.report_sales_by_day(p_from date, p_to date)
returns table (tanggal date, nota integer, omzet_part bigint, omzet_jasa bigint, diskon bigint, hpp bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d::date,
    (select count(*) from public.sales s where s.tanggal_nota = d::date and s.status = 'lunas')::integer,
    coalesce(sum(l.omzet) filter (where l.tipe = 'part'), 0)::bigint,
    coalesce(sum(l.omzet) filter (where l.tipe = 'jasa'), 0)::bigint,
    coalesce(sum(l.diskon), 0)::bigint,
    coalesce(sum(l.hpp), 0)::bigint
  from generate_series(p_from, p_to, interval '1 day') d
  left join public.sale_lines l on l.tanggal_nota = d::date
  group by d
  order by d
$$;

-- Per kategori produk (kategori saat ini), urut omzet terbesar.
create or replace function public.report_sales_by_category(p_from date, p_to date)
returns table (category_id uuid, kategori text, omzet bigint, hpp bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id, k.nama, sum(l.omzet)::bigint, sum(l.hpp)::bigint
  from public.sale_lines l
  join public.products p on p.id = l.product_id
  join public.categories k on k.id = p.category_id
  where l.tanggal_nota between p_from and p_to
  group by k.id, k.nama
  order by sum(l.omzet) desc, k.nama
$$;

-- Per metode bayar.
create or replace function public.report_sales_by_method(p_from date, p_to date)
returns table (metode_bayar text, nota integer, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.metode_bayar, count(*)::integer, sum(s.total)::bigint
  from public.sales s
  where s.tanggal_nota between p_from and p_to and s.status = 'lunas'
  group by s.metode_bayar
  order by s.metode_bayar
$$;

-- Per produk: laba kotor per produk dan fast-moving (R29). Stok sekarang hanya untuk part.
create or replace function public.report_sales_by_product(p_from date, p_to date)
returns table (product_id uuid, nama text, merek text, tipe text, kategori text, qty numeric, omzet bigint, hpp bigint, stok numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.nama, p.merek, p.tipe, k.nama, sum(l.qty), sum(l.omzet)::bigint, sum(l.hpp)::bigint,
         case when p.tipe = 'part' then sl.qty_on_hand end
  from public.sale_lines l
  join public.products p on p.id = l.product_id
  join public.categories k on k.id = p.category_id
  left join public.stock_levels sl on sl.product_id = p.id
  where l.tanggal_nota between p_from and p_to
  group by p.id, p.nama, p.merek, p.tipe, k.nama, sl.qty_on_hand
  order by sum(l.omzet) - sum(l.hpp) desc, p.nama, p.id
$$;

-- Jasa per mekanik: jumlah nota dan omzet jasa. Mekanik null = nota tanpa mekanik.
create or replace function public.report_services_by_mechanic(p_from date, p_to date)
returns table (mechanic_id uuid, mekanik text, nota integer, omzet_jasa bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.mechanic_id, m.nama, count(*)::integer,
         coalesce(sum((select sum(l.omzet) from public.sale_lines l where l.sale_id = s.id and l.tipe = 'jasa')), 0)::bigint
  from public.sales s
  left join public.mechanics m on m.id = s.mechanic_id
  where s.tanggal_nota between p_from and p_to and s.status = 'lunas'
  group by s.mechanic_id, m.nama
  order by s.mechanic_id is null, 4 desc, m.nama
$$;

-- Nilai persediaan part aktif saat ini (R30): stok minus dihitung 0. Tanggal terdaftar dan tanggal
-- terakhir terjual dipakai untuk slow-moving (R29).
create or replace function public.report_stock_value()
returns table (
  product_id uuid,
  nama text,
  merek text,
  kategori text,
  satuan text,
  stok numeric,
  harga_beli_avg numeric,
  nilai bigint,
  terdaftar_pada timestamptz,
  terakhir_terjual date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.nama, p.merek, k.nama, p.satuan, sl.qty_on_hand, p.harga_beli_avg,
         round(greatest(sl.qty_on_hand, 0) * p.harga_beli_avg)::bigint,
         p.created_at,
         (select max(l.tanggal_nota) from public.sale_lines l where l.product_id = p.id)
  from public.products p
  join public.categories k on k.id = p.category_id
  join public.stock_levels sl on sl.product_id = p.id
  where p.tipe = 'part' and p.aktif
  order by p.nama, p.merek nulls first, p.id
$$;

-- Penerimaan per supplier pada periode tanggal faktur. Supplier null = tanpa supplier.
create or replace function public.report_receiving_by_supplier(p_from date, p_to date)
returns table (supplier_id uuid, supplier text, penerimaan integer, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.supplier_id, s.nama, count(distinct r.id)::integer, coalesce(sum(round(i.qty * i.harga_beli)), 0)::bigint
  from public.receipts r
  join public.receipt_items i on i.receipt_id = r.id
  left join public.suppliers s on s.id = r.supplier_id
  where r.tanggal_faktur between p_from and p_to and r.status = 'aktif'
  group by r.supplier_id, s.nama
  order by r.supplier_id is null, 4 desc, s.nama
$$;

-- Sesi opname yang dikonfirmasi dalam periode (tanggal konfirmasi WIB), dengan selisih dalam rupiah
-- dari mutasi opname-nya. Sesi yang dibatalkan tidak punya mutasi dan tidak ikut.
create or replace function public.report_stocktake_sessions(p_from date, p_to date)
returns table (id uuid, nomor text, jenis text, kategori text, dikonfirmasi_pada timestamptz, part_selisih integer, lebih bigint, kurang bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.nomor, o.jenis, k.nama, o.dikonfirmasi_pada,
         count(m.id)::integer,
         coalesce(sum(round(m.qty * m.hpp_satuan)) filter (where m.qty > 0), 0)::bigint,
         coalesce(sum(round(m.qty * m.hpp_satuan)) filter (where m.qty < 0), 0)::bigint
  from public.stock_opnames o
  left join public.categories k on k.id = o.category_id
  left join public.stock_movements m on m.ref_type = 'opname' and m.ref_id = o.id
  where o.status = 'dikonfirmasi'
    and (o.dikonfirmasi_pada at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by o.id, o.nomor, o.jenis, k.nama, o.dikonfirmasi_pada
  order by o.dikonfirmasi_pada desc
$$;

-- Total selisih opname per alasan (PRD 4.5) dalam qty dan rupiah.
create or replace function public.report_stocktake_by_reason(p_from date, p_to date)
returns table (alasan text, qty numeric, nilai bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.alasan, sum(m.qty), sum(round(m.qty * m.hpp_satuan))::bigint
  from public.stock_opnames o
  join public.stock_movements m on m.ref_type = 'opname' and m.ref_id = o.id
  where o.status = 'dikonfirmasi'
    and (o.dikonfirmasi_pada at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by m.alasan
  order by m.alasan
$$;

-- Menu Riwayat (R35): catatan riwayat perubahan dengan nama akun dan nama objeknya.
create or replace view public.change_log_entries
with (security_invoker = true)
as
select
  c.id,
  c.created_at,
  c.user_id,
  a.nama as akun,
  c.aksi,
  c.entitas,
  c.entitas_id,
  case c.entitas
    when 'products' then (select p.nama || coalesce(' · ' || p.merek, '') from public.products p where p.id::text = c.entitas_id)
    when 'categories' then (select k.nama from public.categories k where k.id::text = c.entitas_id)
    when 'mechanics' then (select m.nama from public.mechanics m where m.id::text = c.entitas_id)
    when 'suppliers' then (select s.nama from public.suppliers s where s.id::text = c.entitas_id)
    when 'profiles' then (select p.nama from public.profiles p where p.id::text = c.entitas_id)
    when 'sales' then (select s.nomor from public.sales s where s.id::text = c.entitas_id)
    when 'receipts' then (select r.nomor from public.receipts r where r.id::text = c.entitas_id)
    when 'stock_opnames' then (select o.nomor from public.stock_opnames o where o.id::text = c.entitas_id)
    when 'store_settings' then 'Pengaturan bengkel'
    when 'cashier_devices' then (select coalesce(d.nama, 'Perangkat Kasir') from public.cashier_devices d where d.id::text = c.entitas_id)
  end as objek,
  c.data_lama,
  c.data_baru
from public.change_logs c
left join public.profiles a on a.id = c.user_id;

-- Hak akses ditulis eksplisit (lihat migrasi 3). Fungsi baru otomatis bisa dijalankan PUBLIC, jadi dicabut dulu.
grant select on public.sale_lines, public.change_log_entries to authenticated, service_role;
revoke execute on function
  public.report_sales_summary(date, date),
  public.report_sales_by_day(date, date),
  public.report_sales_by_category(date, date),
  public.report_sales_by_method(date, date),
  public.report_sales_by_product(date, date),
  public.report_services_by_mechanic(date, date),
  public.report_stock_value(),
  public.report_receiving_by_supplier(date, date),
  public.report_stocktake_sessions(date, date),
  public.report_stocktake_by_reason(date, date)
from public, anon;
grant execute on function
  public.report_sales_summary(date, date),
  public.report_sales_by_day(date, date),
  public.report_sales_by_category(date, date),
  public.report_sales_by_method(date, date),
  public.report_sales_by_product(date, date),
  public.report_services_by_mechanic(date, date),
  public.report_stock_value(),
  public.report_receiving_by_supplier(date, date),
  public.report_stocktake_sessions(date, date),
  public.report_stocktake_by_reason(date, date)
to authenticated, service_role;
