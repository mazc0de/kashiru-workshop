// Uji database tanpa Supabase lokal: jalankan `node supabase/tests/scenarios.mjs` (butuh paket @electric-sql/pglite).
// Postgres sementara (PGlite) yang meniru bagian Supabase yang dipakai migrasi Kashiru:
// role anon/authenticated/service_role, auth.users + auth.uid(), schema extensions, storage.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url))

const STUB_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.buckets, storage.objects to service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

// Project lama (atau opsi "Automatically expose new tables" dicentang): tabel dan sequence baru
// otomatis terbuka untuk semua role API. Project baru sejak 2026 tidak lagi begitu.
// Uji kondisi lama dengan KASHIRU_AUTO_EXPOSE=1 npm run test:db
const AUTO_EXPOSE = `
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export const ACCOUNTS = {
  owner: '00000000-0000-0000-0000-000000000001',
  cashier: '00000000-0000-0000-0000-000000000002',
  former: '00000000-0000-0000-0000-000000000003',
  noProfile: '00000000-0000-0000-0000-000000000004',
}

const SEED_ACCOUNTS = `
insert into auth.users (id, email) values
  ('${ACCOUNTS.owner}', 'pemilik@gmail.com'),
  ('${ACCOUNTS.cashier}', 'rina@gmail.com'),
  ('${ACCOUNTS.former}', 'mantan@gmail.com'),
  ('${ACCOUNTS.noProfile}', 'orang@gmail.com');
insert into public.profiles (id, email, nama, aktif) values
  ('${ACCOUNTS.owner}', 'pemilik@gmail.com', 'Pak Budi', true),
  ('${ACCOUNTS.cashier}', 'rina@gmail.com', 'Rina', true),
  ('${ACCOUNTS.former}', 'mantan@gmail.com', 'Joko', false);
`

let snapshot

// Postgres sementara dengan semua migrasi terpasang, tanpa data akun. Dipakai juga oleh scripts/gen-types.mjs.
export async function migratedDb() {
  const db = await PGlite.create({ extensions: { pg_trgm } })
  await db.exec(STUB_SUPABASE)
  if (process.env.KASHIRU_AUTO_EXPOSE === '1') await db.exec(AUTO_EXPOSE)
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    } catch (e) {
      throw new Error(`Migrasi ${f} gagal: ${e.message}`)
    }
  }
  return db
}

export async function createSnapshot() {
  const db = await migratedDb()
  await db.exec(SEED_ACCOUNTS)
  snapshot = await db.dumpDataDir('none')
  await db.close()
}

export async function freshDb() {
  return PGlite.create({ loadDataDir: snapshot, extensions: { pg_trgm } })
}

// Menjalankan query sebagai akun login (role authenticated + klaim JWT), seperti lewat API Supabase.
export async function asUser(db, userId, sql, params = []) {
  return db.transaction(async (tx) => {
    if (userId === null) {
      await tx.query('set local role anon')
    } else if (userId === 'service_role') {
      await tx.query('set local role service_role')
    } else {
      await tx.query('set local role authenticated')
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
    }
    return tx.query(sql, params)
  })
}

// Menjalankan SQL seperti di SQL Editor Supabase: role postgres di Supabase memiliki tabel tetapi bukan
// superuser, jadi misalnya tidak boleh mengubah session_replication_role. Di sini ditiru dengan role
// kashiru_owner yang menjadi pemilik semua tabel public.
export async function asTableOwner(db, fn) {
  const exists = (await db.query(`select 1 from pg_roles where rolname = 'kashiru_owner'`)).rows.length > 0
  if (!exists) {
    await db.exec(`
      create role kashiru_owner nosuperuser nologin;
      grant usage, create on schema public, private, auth to kashiru_owner;
      grant execute on all functions in schema public, private, auth to kashiru_owner;
      grant select, insert, update, delete on auth.users to kashiru_owner;
      do $$
      declare t record;
      begin
        for t in select tablename from pg_tables where schemaname = 'public' loop
          execute format('alter table public.%I owner to kashiru_owner', t.tablename);
        end loop;
      end $$;
    `)
  }
  await db.exec('set role kashiru_owner')
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

// Memanggil RPC dengan argumen bernama: rpc(db, user, 'create_product', { p_tipe: 'part', ... })
export async function rpc(db, userId, functionName, args = {}) {
  const name = Object.keys(args)
  const nilai = name.map((k) => args[k] ?? null)
  const argSql = name.map((k, i) => `${k} => $${i + 1}`).join(', ')
  const result = await asUser(db, userId, `select public.${functionName}(${argSql}) as r`, nilai)
  return result.rows[0].r
}
