import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type ManageAccountsRequest =
  | { aksi: 'buat'; email: string; nama: string; password: string }
  | { aksi: 'reset_password'; user_id: string; password: string }
  | { aksi: 'ubah_nama'; user_id: string; nama: string }
  | { aksi: 'nonaktifkan'; user_id: string }
  | { aksi: 'aktifkan'; user_id: string }

/** Memanggil Edge Function manage-accounts. Pesan salah dari server diteruskan apa adanya. */
export async function callManageAccounts(request: ManageAccountsRequest): Promise<void> {
  const { error } = await supabase().functions.invoke('manage-accounts', { body: request })
  if (!error) return
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { pesan?: string; message?: string } | null
    throw new Error(body?.pesan ?? body?.message ?? 'Server menolak permintaan.')
  }
  throw new Error('Tidak bisa menghubungi server. Periksa internet.')
}
