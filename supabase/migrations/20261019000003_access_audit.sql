-- Kashiru 3/5: hak akses (RLS) dan riwayat perubahan data master.

-- Akses -----------------------------------------------------------------------

-- Hanya akun yang terdaftar di profiles dan aktif yang boleh membaca dan menulis (PRD 8).
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and aktif)
$$;

alter table public.store_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.cashier_devices enable row level security;
alter table public.categories enable row level security;
alter table public.mechanics enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_part_numbers enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.stock_opnames enable row level security;
alter table public.stock_opname_items enable row level security;
alter table public.internal_barcode_counter enable row level security;
alter table public.document_counters enable row level security;
alter table public.change_logs enable row level security;

-- Akun boleh membaca profilnya sendiri walaupun nonaktif, supaya aplikasi bisa menampilkan "Akun nonaktif".
create policy baca on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_user()));

create policy baca on public.store_settings for select to authenticated using ((select public.is_active_user()));
create policy baca on public.cashier_devices for select to authenticated using ((select public.is_active_user()));
create policy baca on public.categories for select to authenticated using ((select public.is_active_user()));
create policy baca on public.mechanics for select to authenticated using ((select public.is_active_user()));
create policy baca on public.suppliers for select to authenticated using ((select public.is_active_user()));
create policy baca on public.products for select to authenticated using ((select public.is_active_user()));
create policy baca on public.product_barcodes for select to authenticated using ((select public.is_active_user()));
create policy baca on public.product_part_numbers for select to authenticated using ((select public.is_active_user()));
create policy baca on public.stock_levels for select to authenticated using ((select public.is_active_user()));
create policy baca on public.stock_movements for select to authenticated using ((select public.is_active_user()));
create policy baca on public.sales for select to authenticated using ((select public.is_active_user()));
create policy baca on public.sale_items for select to authenticated using ((select public.is_active_user()));
create policy baca on public.receipts for select to authenticated using ((select public.is_active_user()));
create policy baca on public.receipt_items for select to authenticated using ((select public.is_active_user()));
create policy baca on public.stock_opnames for select to authenticated using ((select public.is_active_user()));
create policy baca on public.stock_opname_items for select to authenticated using ((select public.is_active_user()));
create policy baca on public.internal_barcode_counter for select to authenticated using ((select public.is_active_user()));
create policy baca on public.document_counters for select to authenticated using ((select public.is_active_user()));
create policy baca on public.change_logs for select to authenticated using ((select public.is_active_user()));

-- Data master ditulis langsung dari aplikasi. Dokumen dan stok hanya lewat RPC.
create policy tambah on public.categories for insert to authenticated with check ((select public.is_active_user()));
create policy ubah on public.categories for update to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy tambah on public.mechanics for insert to authenticated with check ((select public.is_active_user()));
create policy ubah on public.mechanics for update to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy tambah on public.suppliers for insert to authenticated with check ((select public.is_active_user()));
create policy ubah on public.suppliers for update to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy ubah on public.products for update to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
-- Barcode internal hanya dibuat lewat RPC create_internal_barcode.
create policy tambah on public.product_barcodes for insert to authenticated
  with check ((select public.is_active_user()) and jenis = 'pabrik');
create policy hapus on public.product_barcodes for delete to authenticated using ((select public.is_active_user()));
create policy tambah on public.product_part_numbers for insert to authenticated with check ((select public.is_active_user()));
create policy hapus on public.product_part_numbers for delete to authenticated using ((select public.is_active_user()));
create policy ubah on public.store_settings for update to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));

-- Supabase tidak lagi otomatis membuka tabel baru ke Data API (changelog 45329, 2026), jadi semua hak
-- ditulis eksplisit di sini dan berlaku sama dengan atau tanpa opsi "Automatically expose new tables".
-- Anon key saja tidak bisa mengakses data apa pun.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
-- service_role dipakai Edge Function manage-accounts dan skrip setup (membuat profil dan mencatat riwayat).
grant select, insert, update, delete on all tables in schema public to service_role;
grant insert (nama), update (nama, aktif) on public.categories to authenticated;
grant insert (nama), update (nama, aktif) on public.mechanics to authenticated;
grant insert (nama, telepon), update (nama, telepon, aktif) on public.suppliers to authenticated;
-- Tipe produk dan harga beli rata-rata tidak bisa diubah langsung.
grant update (nama, merek, category_id, satuan, bisa_pecahan, harga_jual, stok_min, aktif) on public.products to authenticated;
grant insert (product_id, barcode, jenis), delete on public.product_barcodes to authenticated;
grant insert (product_id, kode_part, jenis), delete on public.product_part_numbers to authenticated;
grant update (
  nama_bengkel, alamat, telepon, logo_url, footer_struk,
  awalan_nota, awalan_penerimaan, awalan_opname,
  ukuran_kertas, jumlah_salinan, blind_count, auto_logout_jam
) on public.store_settings to authenticated;

-- Riwayat perubahan -----------------------------------------------------------

-- Semua perubahan atas data yang sudah ada dicatat (R10). Pembuatan data baru tidak dicatat.
-- Argumen trigger: label entitas untuk nama aksi, mis. 'produk' -> ubah_produk.
create or replace function private.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := tg_argv[0];
  v_old jsonb;
  v_new jsonb;
  v_lama jsonb := '{}';
  v_baru jsonb := '{}';
  v_kolom text;
  v_aksi text;
  v_entitas text := tg_table_name;
  v_entitas_id text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_kolom in select jsonb_object_keys(v_new) loop
      -- Harga beli rata-rata diubah sistem dan sudah tercatat di kartu stok.
      if v_kolom not in ('harga_beli_avg', 'created_at')
         and (v_old -> v_kolom) is distinct from (v_new -> v_kolom) then
        v_lama := v_lama || jsonb_build_object(v_kolom, v_old -> v_kolom);
        v_baru := v_baru || jsonb_build_object(v_kolom, v_new -> v_kolom);
      end if;
    end loop;
    if v_baru = '{}'::jsonb then
      return null;
    end if;
    v_entitas_id := v_new ->> 'id';
    v_aksi := case
      when v_baru ? 'aktif' and not (v_new ->> 'aktif')::boolean then 'nonaktifkan_' || v_label
      when v_baru ? 'aktif' then 'aktifkan_' || v_label
      when v_label = 'produk' and v_baru ? 'harga_jual' then 'ubah_harga_jual'
      else 'ubah_' || v_label
    end;
  else
    -- Barcode dan kode part dicatat di bawah produknya.
    if tg_op = 'INSERT' then
      -- Barcode yang ikut dibuat bersama produk baru termasuk pembuatan data, jadi tidak dicatat.
      if exists (select 1 from public.products where id = new.product_id and created_at = now()) then
        return null;
      end if;
      v_aksi := 'tambah_' || v_label;
      v_lama := null;
      v_baru := to_jsonb(new);
      v_entitas_id := new.product_id::text;
    else
      v_aksi := 'hapus_' || v_label;
      v_lama := to_jsonb(old);
      v_baru := null;
      v_entitas_id := old.product_id::text;
    end if;
    v_entitas := 'products';
  end if;

  insert into public.change_logs (user_id, aksi, entitas, entitas_id, data_lama, data_baru)
  values (auth.uid(), v_aksi, v_entitas, v_entitas_id, v_lama, v_baru);
  return null;
end;
$$;

create trigger riwayat after update on public.products
  for each row execute function private.log_change('produk');
create trigger riwayat after update on public.categories
  for each row execute function private.log_change('kategori');
create trigger riwayat after update on public.mechanics
  for each row execute function private.log_change('mekanik');
create trigger riwayat after update on public.suppliers
  for each row execute function private.log_change('supplier');
create trigger riwayat after update on public.store_settings
  for each row execute function private.log_change('pengaturan');
create trigger riwayat after insert or delete on public.product_barcodes
  for each row execute function private.log_change('barcode');
create trigger riwayat after insert or delete on public.product_part_numbers
  for each row execute function private.log_change('kode_part');
