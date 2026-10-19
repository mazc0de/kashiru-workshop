import { createContext, useContext } from 'react'

import type { TableRow } from '@/lib/database.types'
import { readStored, removeStored, writeStored } from '@/lib/localStore'
import { supabase } from '@/lib/supabase'

export type Profile = Pick<TableRow<'profiles'>, 'id' | 'email' | 'nama' | 'aktif'>

export type SessionState =
  | { stage: 'loading' }
  | { stage: 'signedOut'; message: string | null }
  | { stage: 'signedIn'; profile: Profile }
  | { stage: 'inactive'; email: string }
  | { stage: 'unregistered'; email: string }
  | { stage: 'error'; message: string }

export type SessionValue = {
  status: SessionState
  /** Keluar dari perangkat ini saja (sesi akun di perangkat lain tetap jalan). */
  signOut: (message?: string) => Promise<void>
  /** Coba muat profil lagi setelah gagal. */
  reload: () => void
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSesi dipakai di luar PenyediaSesi')
  return value
}

/** Profil akun yang sedang login. Hanya untuk layar di dalam RequireLogin. */
export function useProfile(): Profile {
  const { status } = useSession()
  if (status.stage !== 'signedIn') throw new Error('useProfil dipakai sebelum login')
  return status.profile
}

const PROFILE_KEY = 'kashiru.profile'

/**
 * Profil akun yang login: null kalau akun tidak terdaftar di profiles.
 * Saat offline atau server tidak terjangkau, salinan terakhir untuk akun yang sama dipakai,
 * supaya kasir tetap bisa membuat nota (PRD 4.13).
 */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('id, email, nama, aktif')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    const stored = readStored<Profile>(PROFILE_KEY)
    if (stored?.id === userId) return stored
    throw new Error(error.message)
  }
  if (data) writeStored(PROFILE_KEY, data)
  else removeStored(PROFILE_KEY)
  return data
}

/** Salinan profil di perangkat untuk akun ini, atau undefined. */
export function storedProfile(userId: string): Profile | undefined {
  const stored = readStored<Profile>(PROFILE_KEY)
  return stored?.id === userId ? stored : undefined
}

export function forgetProfile(): void {
  removeStored(PROFILE_KEY)
}
