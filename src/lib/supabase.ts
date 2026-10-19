import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'
import { readEnv } from '@/lib/env'

let client: SupabaseClient<Database> | null = null
const AUTH_KEY = 'kashiru.auth'

/** Klien Supabase tunggal. Gagal dengan pesan jelas kalau .env belum diisi. */
export function supabase(): SupabaseClient<Database> {
  if (!client) {
    const env = readEnv()
    if (!env.ok) {
      throw new Error(`Supabase belum diatur. Isi ${env.short.join(', ')} di .env (lihat .env.example).`)
    }
    client = createClient<Database>(env.url, env.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY },
    })
  }
  return client
}

/**
 * Sesi yang masih tersimpan di perangkat. Supabase Auth menghapusnya hanya kalau login benar-benar
 * berakhir; kalau perpanjangan token gagal karena offline, sesinya tetap tersimpan (PRD 4.13).
 */
export function storedSession(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as Session | null
    return session?.user?.id && session.refresh_token ? session : null
  } catch {
    return null
  }
}
