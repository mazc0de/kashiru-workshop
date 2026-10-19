-- Kashiru 5/5: bucket logo bengkel. Privat, hanya akun aktif yang bisa membaca dan mengubahnya.
-- Aplikasi menyalin logo ke perangkat supaya tetap tercetak di struk saat offline.

insert into storage.buckets (id, name, public)
values ('logo', 'logo', false)
on conflict (id) do nothing;

create policy "logo: baca akun aktif" on storage.objects for select to authenticated
  using (bucket_id = 'logo' and (select public.is_active_user()));
create policy "logo: unggah akun aktif" on storage.objects for insert to authenticated
  with check (bucket_id = 'logo' and (select public.is_active_user()));
create policy "logo: ganti akun aktif" on storage.objects for update to authenticated
  using (bucket_id = 'logo' and (select public.is_active_user()))
  with check (bucket_id = 'logo' and (select public.is_active_user()));
create policy "logo: hapus akun aktif" on storage.objects for delete to authenticated
  using (bucket_id = 'logo' and (select public.is_active_user()));
