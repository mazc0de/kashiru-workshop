import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { ACTION_GROUPS, type ActionGroup, type ChangeEntry } from '@/history/changeLog'
import { addDays } from '@/reports/period'

// Menu Riwayat (PRD 4.12, R35): terbaru di atas, 100 catatan per muat.

export const PAGE_SIZE = 100

export type ChangeLogFilter = { accountId: string | null; from: string; to: string; group: ActionGroup | null }

/** Awal hari "YYYY-MM-DD" menurut WIB sebagai waktu ISO. */
const wibStart = (date: string) => `${date}T00:00:00+07:00`

export function useChangeLog(filter: ChangeLogFilter) {
  return useInfiniteQuery({
    queryKey: ['change-log', filter],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<ChangeEntry[]> => {
      let q = supabase()
        .from('change_log_entries')
        .select('id, created_at, akun, aksi, entitas, objek, data_lama, data_baru')
        .gte('created_at', wibStart(filter.from))
        .lt('created_at', wibStart(addDays(filter.to, 1)))
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (pageParam !== null) q = q.lt('id', pageParam)
      if (filter.accountId) q = q.eq('user_id', filter.accountId)
      if (filter.group) q = q.in('aksi', ACTION_GROUPS.find((g) => g.id === filter.group)?.actions ?? [])
      return unwrap(await q).map((r) => ({
        id: Number(r.id),
        createdAt: r.created_at ?? '',
        account: r.akun,
        action: r.aksi ?? '',
        entity: r.entitas ?? '',
        object: r.objek,
        before: (r.data_lama as Record<string, unknown> | null) ?? null,
        after: (r.data_baru as Record<string, unknown> | null) ?? null,
      }))
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  })
}

/** Semua akun, termasuk yang nonaktif, untuk filter akun. */
export function useAccountOptions() {
  return useQuery({
    queryKey: ['change-log', 'accounts'],
    queryFn: async () => unwrap(await supabase().from('profiles').select('id, nama, aktif').order('nama')),
  })
}
