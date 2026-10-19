import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { TableUpdate } from '@/lib/database.types'
import { unwrap } from '@/lib/errors'
import { SETTINGS_QUERY_KEY } from '@/lib/settings'
import { supabase } from '@/lib/supabase'

/** Simpan sebagian pengaturan bengkel. Setiap perubahan tercatat di riwayat oleh trigger database (R10). */
export function useSaveSettings(onSaved?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: TableUpdate<'store_settings'>) => {
      unwrap(await supabase().from('store_settings').update(changes).eq('id', 1))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
      onSaved?.()
    },
  })
}
