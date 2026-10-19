import { useQuery } from '@tanstack/react-query'

import type { TableRow } from '@/lib/database.types'
import { readStored, writeStored } from '@/lib/localStore'
import { supabase } from '@/lib/supabase'

export type Settings = TableRow<'store_settings'>

const STORAGE_KEY = 'kashiru.settings'
export const SETTINGS_QUERY_KEY = ['settings'] as const

/** Pengaturan bengkel (satu baris). Salinan terakhir dipakai saat offline. */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase().from('store_settings').select('*').eq('id', 1).single()
      if (error) {
        const stored = readStored<Settings>(STORAGE_KEY)
        if (stored) return stored
        throw new Error(error.message)
      }
      writeStored(STORAGE_KEY, data)
      return data
    },
    initialData: () => readStored<Settings>(STORAGE_KEY) ?? undefined,
    initialDataUpdatedAt: 0,
    retry: false,
    // Tetap dijalankan saat offline supaya salinan terakhir terpakai (PRD 4.13).
    networkMode: 'always',
  })
}
