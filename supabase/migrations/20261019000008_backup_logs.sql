-- Kashiru 8: catatan backup manual (PRD 7.6, R45, R47). Setiap "Unduh backup" yang berhasil dicatat,
-- supaya Pengaturan dan Dashboard bisa menampilkan backup terakhir dan mengingatkan kalau sudah lama.
-- Mengunduh backup bukan perubahan data, jadi tidak masuk riwayat perubahan.

create table public.backup_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id)
);

create index backup_logs_created_at on public.backup_logs (created_at);

alter table public.backup_logs enable row level security;
create policy baca on public.backup_logs for select to authenticated using ((select public.is_active_user()));

-- Dicatat lewat RPC, bukan insert langsung, supaya akun dan waktunya tidak bisa diisi sembarang.
create or replace function public.record_backup()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waktu timestamptz;
begin
  insert into public.backup_logs (user_id)
  values (private.require_active_user())
  returning created_at into v_waktu;
  return v_waktu;
end;
$$;

-- Hak akses ditulis eksplisit (lihat migrasi 3). Di project yang membuka tabel baru otomatis, hak bawaannya
-- dicabut dulu. Fungsi baru otomatis bisa dijalankan PUBLIC, jadi juga dicabut dulu.
revoke all on public.backup_logs from anon, authenticated;
revoke all on sequence public.backup_logs_id_seq from anon, authenticated;
grant select on public.backup_logs to authenticated;
grant select, insert, update, delete on public.backup_logs to service_role;
revoke execute on function public.record_backup() from public, anon;
grant execute on function public.record_backup() to authenticated, service_role;
