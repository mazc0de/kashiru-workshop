// Logika Edge Function manage-accounts, tanpa ketergantungan Deno supaya bisa diuji dengan Vitest.
// Operasi admin Supabase Auth tidak boleh dijalankan dari browser (PRD 7.4, ADR 0006):
// membuat akun, membuat password baru, mengubah nama tampilan, menonaktifkan akun, dan mengaktifkannya lagi.
// Akun tidak bisa menonaktifkan dirinya sendiri, sehingga selalu ada minimal satu akun aktif (R14).
// Kashiru tidak pernah mengirim email: akun langsung aktif dengan password awal.

export type Profile = { id: string; email: string; nama: string; aktif: boolean }

export type ChangeLogEntry = {
  user_id: string
  aksi: 'buat_akun' | 'reset_password' | 'ubah_nama_akun' | 'nonaktifkan_akun' | 'aktifkan_akun'
  entitas_id: string
  data_lama: Record<string, unknown> | null
  data_baru: Record<string, unknown> | null
}

/** Akses ke Supabase yang dibutuhkan fungsi ini. Implementasinya ada di index.ts. */
export interface Services {
  profile(id: string): Promise<Profile | null>
  createUser(email: string, password: string): Promise<{ id: string } | { error: string; code?: string }>
  deleteUser(id: string): Promise<void>
  saveProfile(profile: Omit<Profile, 'aktif'>): Promise<string | null>
  setPassword(id: string, password: string): Promise<string | null>
  renameAccount(id: string, name: string): Promise<string | null>
  deactivate(id: string): Promise<string | null>
  activate(id: string): Promise<string | null>
  log(entry: ChangeLogEntry): Promise<void>
}

export type Result = { status: number; body: { ok: true; id?: string } | { pesan: string } }

const fail = (status: number, pesan: string): Result => ({ status, body: { pesan } })
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tidyName = (v: unknown) => text(v).replace(/\s+/g, ' ')

function checkPassword(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 6) return 'Password minimal 6 karakter'
  return null
}

export async function manageAccounts(callerId: string, request: unknown, services: Services): Promise<Result> {
  const caller = await services.profile(callerId)
  if (!caller?.aktif) return fail(403, 'Akun Anda tidak aktif')

  const body = (request ?? {}) as Record<string, unknown>
  switch (body.aksi) {
    case 'buat':
      return createAccount(caller, body, services)
    case 'reset_password':
      return resetPassword(caller, body, services)
    case 'ubah_nama':
      return renameAccount(caller, body, services)
    case 'nonaktifkan':
      return deactivate(caller, body, services)
    case 'aktifkan':
      return activate(caller, body, services)
    default:
      return fail(400, 'Aksi tidak dikenal')
  }
}

async function createAccount(caller: Profile, body: Record<string, unknown>, services: Services): Promise<Result> {
  const email = text(body.email).toLowerCase()
  const name = tidyName(body.nama)
  if (!EMAIL_PATTERN.test(email)) return fail(400, 'Email tidak valid')
  if (!name) return fail(400, 'Nama wajib diisi')
  const passwordError = checkPassword(body.password)
  if (passwordError) return fail(400, passwordError)

  const user = await services.createUser(email, body.password as string)
  if ('error' in user) {
    if (user.code === 'email_exists') return fail(409, 'Email ini sudah dipakai akun lain')
    return fail(500, `Akun gagal dibuat: ${user.error}`)
  }

  const profileError = await services.saveProfile({ id: user.id, email, nama: name })
  if (profileError) {
    // Jangan tinggalkan user Auth tanpa profil.
    await services.deleteUser(user.id)
    return fail(500, `Akun gagal dibuat: ${profileError}`)
  }

  await services.log({
    user_id: caller.id,
    aksi: 'buat_akun',
    entitas_id: user.id,
    data_lama: null,
    data_baru: { email, nama: name },
  })
  return { status: 200, body: { ok: true, id: user.id } }
}

async function resetPassword(caller: Profile, body: Record<string, unknown>, services: Services): Promise<Result> {
  const target = await services.profile(text(body.user_id))
  if (!target) return fail(404, 'Akun tidak ditemukan')
  const passwordError = checkPassword(body.password)
  if (passwordError) return fail(400, passwordError)

  const error = await services.setPassword(target.id, body.password as string)
  if (error) return fail(500, `Password gagal diganti: ${error}`)

  // Password tidak pernah dicatat di riwayat.
  await services.log({
    user_id: caller.id,
    aksi: 'reset_password',
    entitas_id: target.id,
    data_lama: null,
    data_baru: { email: target.email },
  })
  return { status: 200, body: { ok: true } }
}

async function deactivate(caller: Profile, body: Record<string, unknown>, services: Services): Promise<Result> {
  const target = await services.profile(text(body.user_id))
  if (!target) return fail(404, 'Akun tidak ditemukan')
  if (target.id === caller.id) return fail(409, 'Akun tidak bisa menonaktifkan dirinya sendiri')
  if (!target.aktif) return fail(409, 'Akun ini sudah nonaktif')

  const error = await services.deactivate(target.id)
  if (error) return fail(500, `Akun gagal dinonaktifkan: ${error}`)

  await services.log({
    user_id: caller.id,
    aksi: 'nonaktifkan_akun',
    entitas_id: target.id,
    data_lama: { email: target.email, aktif: true },
    data_baru: { aktif: false },
  })
  return { status: 200, body: { ok: true } }
}

async function activate(caller: Profile, body: Record<string, unknown>, services: Services): Promise<Result> {
  const target = await services.profile(text(body.user_id))
  if (!target) return fail(404, 'Akun tidak ditemukan')
  if (target.aktif) return fail(409, 'Akun ini sudah aktif')

  const error = await services.activate(target.id)
  if (error) return fail(500, `Akun gagal diaktifkan: ${error}`)

  await services.log({
    user_id: caller.id,
    aksi: 'aktifkan_akun',
    entitas_id: target.id,
    data_lama: { email: target.email, aktif: false },
    data_baru: { aktif: true },
  })
  return { status: 200, body: { ok: true } }
}

/** Nama tampilan tercetak di struk. Email tidak bisa diubah karena menjadi identitas login (R16). */
async function renameAccount(caller: Profile, body: Record<string, unknown>, services: Services): Promise<Result> {
  const target = await services.profile(text(body.user_id))
  if (!target) return fail(404, 'Akun tidak ditemukan')
  const name = tidyName(body.nama)
  if (!name) return fail(400, 'Nama wajib diisi')
  const oldName = target.nama
  if (name === oldName) return { status: 200, body: { ok: true } }

  const error = await services.renameAccount(target.id, name)
  if (error) return fail(500, `Nama gagal diubah: ${error}`)

  await services.log({
    user_id: caller.id,
    aksi: 'ubah_nama_akun',
    entitas_id: target.id,
    data_lama: { nama: oldName },
    data_baru: { nama: name },
  })
  return { status: 200, body: { ok: true } }
}
