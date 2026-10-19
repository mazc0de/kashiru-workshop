// Edge Function manage-accounts (Deno). Deploy tanpa Docker:
//   supabase functions deploy manage-accounts --project-ref <ref> --use-api
// withSupabase memverifikasi JWT pemanggil, menangani CORS, dan menyediakan klien admin.
import { withSupabase } from 'npm:@supabase/server@1'

import { manageAccounts, type Services } from './manage-accounts.ts'

// Ban 100 tahun: akun nonaktif tidak bisa login atau memperpanjang sesi. Datanya sudah tertutup RLS.
const INACTIVE_BAN = '876000h'

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ pesan: 'Gunakan POST' }, { status: 405 })

    const admin = ctx.supabaseAdmin
    const services: Services = {
      async profile(id) {
        if (!id) return null
        const { data } = await admin.from('profiles').select('id, email, nama, aktif').eq('id', id).maybeSingle()
        return data
      },
      async createUser(email, password) {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        return error ? { error: error.message, code: error.code } : { id: data.user.id }
      },
      async deleteUser(id) {
        await admin.auth.admin.deleteUser(id)
      },
      async saveProfile(profile) {
        const { error } = await admin.from('profiles').insert(profile)
        return error?.message ?? null
      },
      async setPassword(id, password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password })
        return error?.message ?? null
      },
      async renameAccount(id, name) {
        const { error } = await admin.from('profiles').update({ nama: name }).eq('id', id)
        return error?.message ?? null
      },
      async deactivate(id) {
        const { error } = await admin.from('profiles').update({ aktif: false }).eq('id', id)
        if (error) return error.message
        const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: INACTIVE_BAN })
        return banError?.message ?? null
      },
      async activate(id) {
        const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
        if (banError) return banError.message
        const { error } = await admin.from('profiles').update({ aktif: true }).eq('id', id)
        return error?.message ?? null
      },
      async log(entry) {
        const { error } = await admin.from('change_logs').insert({ ...entry, entitas: 'profiles' })
        if (error) console.error('Riwayat perubahan gagal dicatat', error)
      },
    }

    let request: unknown
    try {
      request = await req.json()
    } catch {
      return Response.json({ pesan: 'Isi permintaan bukan JSON' }, { status: 400 })
    }

    const result = await manageAccounts(ctx.userClaims!.id, request, services)
    return Response.json(result.body, { status: result.status })
  }),
}
