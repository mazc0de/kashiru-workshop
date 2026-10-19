import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { forgetActivity } from '@/auth/autoLogout'
import { SessionContext, forgetProfile, loadProfile, storedProfile, type SessionValue, type SessionState } from '@/auth/session'
import { storedSession, supabase } from '@/lib/supabase'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // undefined = sesi belum diketahui. Sesi tersimpan langsung dipakai supaya aplikasi tidak menunggu
  // Supabase Auth memperpanjang token, yang saat offline baru menyerah setelah ±30 detik (PRD 4.13).
  const [session, setSession] = useState<Session | null | undefined>(() => storedSession() ?? undefined)
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null)

  useEffect(() => {
    const { data } = supabase().auth.onAuthStateChange((event, newSession) => {
      // Dibuka saat offline dengan token kedaluwarsa: perpanjangan gagal karena jaringan, tetapi login belum
      // berakhir. Kasir tetap bisa membuat nota; token diperpanjang otomatis begitu online (PRD 4.13).
      setSession(event === 'INITIAL_SESSION' && !newSession ? storedSession() : newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const profile = useQuery({
    queryKey: ['session', 'profile', userId],
    queryFn: () => loadProfile(userId!),
    enabled: Boolean(userId),
    retry: false,
    // Salinan profil di perangkat langsung dipakai, lalu diperbarui dari server di belakang layar.
    initialData: () => (userId ? storedProfile(userId) : undefined),
    initialDataUpdatedAt: 0,
    networkMode: 'always',
    staleTime: 5 * 60_000,
  })

  const signOut = useCallback(
    async (message?: string) => {
      setSignOutMessage(message ?? null)
      await supabase().auth.signOut({ scope: 'local' })
      forgetProfile()
      forgetActivity()
      queryClient.clear()
    },
    [queryClient],
  )

  const status = useMemo<SessionState>(() => {
    if (session === undefined) return { stage: 'loading' }
    if (session === null) return { stage: 'signedOut', message: signOutMessage }
    if (profile.isPending) return { stage: 'loading' }
    // Server tidak terjangkau dan belum ada salinan profil di perangkat ini.
    if (profile.isError) return { stage: 'error', message: 'Akun tidak bisa dimuat. Periksa internet lalu coba lagi.' }
    const email = session.user.email ?? ''
    if (!profile.data) return { stage: 'unregistered', email }
    if (!profile.data.aktif) return { stage: 'inactive', email }
    return { stage: 'signedIn', profile: profile.data }
  }, [session, signOutMessage, profile.isPending, profile.isError, profile.data])

  const { refetch } = profile
  const reload = useCallback(() => void refetch(), [refetch])
  const value = useMemo<SessionValue>(() => ({ status, signOut, reload }), [status, signOut, reload])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
