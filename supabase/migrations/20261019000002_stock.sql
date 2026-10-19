-- Kashiru 2/5: buku mutasi stok dan harga beli rata-rata (average cost, PRD 4.3).

-- Setiap part punya satu baris saldo sejak dibuat.
create or replace function private.create_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipe = 'part' then
    insert into public.stock_levels (product_id) values (new.id);
  end if;
  return null;
end;
$$;

create trigger buat_saldo after insert on public.products
  for each row execute function private.create_stock_level();

-- Harga rata-rata setelah satu mutasi, menurut aturan PRD 4.3:
-- - mutasi keluar tidak mengubah rata-rata (void beli ditangani terpisah, lihat apply_stock_movements);
-- - opname lebih dan penyesuaian tambah masuk dengan rata-rata saat itu, atau harga input kalau rata-rata masih 0;
-- - baris Rp 0 (barang bonus) saat stok <= 0 tidak mengubah rata-rata;
-- - masuk saat stok <= 0: rata-rata = harga mutasi itu;
-- - masuk saat stok > 0: rata-rata tertimbang.
create or replace function private.avg_after(
  p_jenis text,
  p_qty numeric,
  p_hpp numeric,
  p_stok_sebelum numeric,
  p_avg numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_qty < 0 then p_avg
    when p_jenis in ('opname', 'penyesuaian') then
      case when p_avg > 0 then p_avg else p_hpp end
    when p_hpp = 0 and p_stok_sebelum <= 0 then p_avg
    when p_stok_sebelum <= 0 then p_hpp
    else round((p_stok_sebelum * p_avg + p_qty * p_hpp) / (p_stok_sebelum + p_qty), 2)
  end
$$;

-- Hitung ulang rata-rata dari seluruh kartu stok, seolah penerimaan yang di-void tidak pernah ada (R7).
create or replace function private.recompute_avg(p_product_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutasi record;
  v_stok numeric := 0;
  v_avg numeric := 0;
begin
  for v_mutasi in
    select sm.jenis, sm.qty, sm.hpp_satuan
    from public.stock_movements sm
    where sm.product_id = p_product_id
      and not exists (
        select 1 from public.receipts r
        where sm.ref_type = 'receipt' and r.id = sm.ref_id and r.status = 'void'
      )
    order by sm.id
  loop
    v_avg := private.avg_after(v_mutasi.jenis, v_mutasi.qty, v_mutasi.hpp_satuan, v_stok, v_avg);
    v_stok := v_stok + v_mutasi.qty;
  end loop;
  return v_avg;
end;
$$;

-- Satu-satunya jalan stok berubah. Dijalankan sekali per perintah INSERT,
-- supaya semua baris satu dokumen diproses bersama sesuai urutan id.
create or replace function private.apply_stock_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutasi record;
  v_stok numeric;
  v_avg numeric;
  v_avg_baru numeric;
  v_void_beli uuid[] := '{}';
  v_product_id uuid;
begin
  for v_mutasi in select * from baru order by id loop
    update public.stock_levels
    set qty_on_hand = qty_on_hand + v_mutasi.qty
    where product_id = v_mutasi.product_id
    returning qty_on_hand into v_stok;

    if not found then
      raise exception 'Produk % bukan part, jadi tidak punya stok', v_mutasi.product_id;
    end if;

    if v_mutasi.jenis = 'void_beli' then
      v_void_beli := array_append(v_void_beli, v_mutasi.product_id);
    else
      select harga_beli_avg into v_avg from public.products where id = v_mutasi.product_id;
      v_avg_baru := private.avg_after(v_mutasi.jenis, v_mutasi.qty, v_mutasi.hpp_satuan, v_stok - v_mutasi.qty, v_avg);
      if v_avg_baru <> v_avg then
        update public.products set harga_beli_avg = v_avg_baru where id = v_mutasi.product_id;
      end if;
    end if;
  end loop;

  -- Void penerimaan: rata-rata dihitung ulang, kecuali stok setelah void <= 0.
  for v_product_id in select distinct unnest(v_void_beli) loop
    select qty_on_hand into v_stok from public.stock_levels where product_id = v_product_id;
    if v_stok > 0 then
      update public.products
      set harga_beli_avg = private.recompute_avg(v_product_id)
      where id = v_product_id;
    end if;
  end loop;

  return null;
end;
$$;

create trigger terapkan after insert on public.stock_movements
  referencing new table as baru
  for each statement execute function private.apply_stock_movements();

-- Kartu stok dan riwayat perubahan tidak bisa diubah atau dihapus siapa pun.
create or replace function private.reject_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabel % hanya boleh ditambah, tidak boleh diubah atau dihapus', tg_table_name;
end;
$$;

create trigger hanya_tambah before update or delete on public.stock_movements
  for each row execute function private.reject_change();
create trigger hanya_tambah_truncate before truncate on public.stock_movements
  for each statement execute function private.reject_change();
create trigger hanya_tambah before update or delete on public.change_logs
  for each row execute function private.reject_change();
create trigger hanya_tambah_truncate before truncate on public.change_logs
  for each statement execute function private.reject_change();
