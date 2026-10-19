import { beforeEach, describe, expect, test } from 'vitest'

import { manageAccounts, type ChangeLogEntry, type Services, type Profile } from './manage-accounts.ts'

// Layanan palsu di memori: perilaku yang sama dengan Supabase untuk keperluan fungsi ini.
function fakeServices(initial: Profile[]) {
  const profiles = new Map(initial.map((p) => [p.id, { ...p }]))
  const userAuth = new Map<string, { email: string; password: string; banned: boolean }>(
    initial.map((p) => [p.id, { email: p.email, password: 'lama123', banned: !p.aktif }]),
  )
  const logs: ChangeLogEntry[] = []
  let failSaveProfile = false
  let counter = 0

  const services: Services = {
    async profile(id) {
      // Seperti Supabase: setiap baca mengembalikan objek baru.
      const p = profiles.get(id)
      return p ? { ...p } : null
    },
    async createUser(email, password) {
      if ([...userAuth.values()].some((u) => u.email === email)) {
        return { error: 'A user with this email address has already been registered', code: 'email_exists' }
      }
      const id = `baru-${++counter}`
      userAuth.set(id, { email, password, banned: false })
      return { id }
    },
    async deleteUser(id) {
      userAuth.delete(id)
    },
    async saveProfile(p) {
      if (failSaveProfile) return 'duplicate key value violates unique constraint "profiles_email_key"'
      profiles.set(p.id, { ...p, aktif: true })
      return null
    },
    async setPassword(id, password) {
      userAuth.get(id)!.password = password
      return null
    },
    async deactivate(id) {
      profiles.get(id)!.aktif = false
      userAuth.get(id)!.banned = true
      return null
    },
    async renameAccount(id, name) {
      profiles.get(id)!.nama = name
      return null
    },
    async activate(id) {
      profiles.get(id)!.aktif = true
      userAuth.get(id)!.banned = false
      return null
    },
    async log(entry) {
      logs.push(entry)
    },
  }
  return { services, profiles, userAuth, logs, makeSaveProfileFail: () => (failSaveProfile = true) }
}

const OWNER: Profile = { id: 'pemilik', email: 'pemilik@gmail.com', nama: 'Pak Budi', aktif: true }
const CASHIER: Profile = { id: 'kasir', email: 'rina@gmail.com', nama: 'Rina', aktif: true }
const FORMER: Profile = { id: 'mantan', email: 'joko@gmail.com', nama: 'Joko', aktif: false }

let fake: ReturnType<typeof fakeServices>
beforeEach(() => {
  fake = fakeServices([OWNER, CASHIER, FORMER])
})

describe('pemanggil', () => {
  test('akun nonaktif atau tidak terdaftar ditolak', async () => {
    expect(await manageAccounts('mantan', { aksi: 'buat' }, fake.services)).toEqual({ status: 403, body: { pesan: 'Akun Anda tidak aktif' } })
    expect((await manageAccounts('orang-lain', { aksi: 'buat' }, fake.services)).status).toBe(403)
  })

  test('aksi yang tidak dikenal ditolak', async () => {
    expect(await manageAccounts('pemilik', { aksi: 'hapus' }, fake.services)).toEqual({ status: 400, body: { pesan: 'Aksi tidak dikenal' } })
  })
})

describe('buat akun', () => {
  test('akun baru langsung aktif, email dirapikan, tercatat di riwayat tanpa password', async () => {
    const result = await manageAccounts(
      'kasir',
      { aksi: 'buat', email: '  Andi@Gmail.com ', nama: ' Andi   Saputra ', password: 'rahasia1' },
      fake.services,
    )
    expect(result).toEqual({ status: 200, body: { ok: true, id: 'baru-1' } })
    expect(fake.profiles.get('baru-1')).toEqual({ id: 'baru-1', email: 'andi@gmail.com', nama: 'Andi Saputra', aktif: true })
    expect(fake.userAuth.get('baru-1')).toEqual({ email: 'andi@gmail.com', password: 'rahasia1', banned: false })
    expect(fake.logs).toEqual([
      { user_id: 'kasir', aksi: 'buat_akun', entitas_id: 'baru-1', data_lama: null, data_baru: { email: 'andi@gmail.com', nama: 'Andi Saputra' } },
    ])
  })

  test('isian tidak lengkap ditolak sebelum menyentuh Auth', async () => {
    const attempt = (body: object) => manageAccounts('pemilik', { aksi: 'buat', ...body }, fake.services)
    expect((await attempt({ email: 'bukan-email', nama: 'A', password: 'rahasia1' })).body).toEqual({ pesan: 'Email tidak valid' })
    expect((await attempt({ email: 'a@b.co', nama: '  ', password: 'rahasia1' })).body).toEqual({ pesan: 'Nama wajib diisi' })
    expect((await attempt({ email: 'a@b.co', nama: 'A', password: '12345' })).body).toEqual({ pesan: 'Password minimal 6 karakter' })
    expect(fake.userAuth.size).toBe(3)
  })

  test('email yang sudah dipakai ditolak dengan pesan jelas', async () => {
    const result = await manageAccounts('pemilik', { aksi: 'buat', email: 'rina@gmail.com', nama: 'Rina 2', password: 'rahasia1' }, fake.services)
    expect(result).toEqual({ status: 409, body: { pesan: 'Email ini sudah dipakai akun lain' } })
  })

  test('kalau profil gagal disimpan, user Auth yang baru dibuat dihapus lagi', async () => {
    fake.makeSaveProfileFail()
    const result = await manageAccounts('pemilik', { aksi: 'buat', email: 'andi@gmail.com', nama: 'Andi', password: 'rahasia1' }, fake.services)
    expect(result.status).toBe(500)
    expect(fake.userAuth.has('baru-1')).toBe(false)
    expect(fake.logs).toEqual([])
  })
})

describe('buat password baru untuk akun lain', () => {
  test('password diganti dan riwayat hanya mencatat email', async () => {
    const result = await manageAccounts('pemilik', { aksi: 'reset_password', user_id: 'kasir', password: 'baru123' }, fake.services)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(fake.userAuth.get('kasir')!.password).toBe('baru123')
    expect(fake.logs).toEqual([
      { user_id: 'pemilik', aksi: 'reset_password', entitas_id: 'kasir', data_lama: null, data_baru: { email: 'rina@gmail.com' } },
    ])
    expect(JSON.stringify(fake.logs)).not.toContain('baru123')
  })

  test('akun tidak dikenal atau password pendek ditolak', async () => {
    expect((await manageAccounts('pemilik', { aksi: 'reset_password', user_id: 'x', password: 'baru123' }, fake.services)).status).toBe(404)
    expect((await manageAccounts('pemilik', { aksi: 'reset_password', user_id: 'kasir', password: '123' }, fake.services)).status).toBe(400)
  })
})

describe('nonaktifkan akun', () => {
  test('profil nonaktif, user Auth diban, tercatat di riwayat', async () => {
    const result = await manageAccounts('pemilik', { aksi: 'nonaktifkan', user_id: 'kasir' }, fake.services)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(fake.profiles.get('kasir')!.aktif).toBe(false)
    expect(fake.userAuth.get('kasir')!.banned).toBe(true)
    expect(fake.logs).toEqual([
      { user_id: 'pemilik', aksi: 'nonaktifkan_akun', entitas_id: 'kasir', data_lama: { email: 'rina@gmail.com', aktif: true }, data_baru: { aktif: false } },
    ])
  })

  test('akun yang sudah nonaktif tidak dinonaktifkan dua kali', async () => {
    expect(await manageAccounts('pemilik', { aksi: 'nonaktifkan', user_id: 'mantan' }, fake.services)).toEqual({
      status: 409,
      body: { pesan: 'Akun ini sudah nonaktif' },
    })
  })
})

describe('aturan nonaktif (R14)', () => {
  test('akun tidak bisa menonaktifkan dirinya sendiri', async () => {
    expect(await manageAccounts('pemilik', { aksi: 'nonaktifkan', user_id: 'pemilik' }, fake.services)).toEqual({
      status: 409,
      body: { pesan: 'Akun tidak bisa menonaktifkan dirinya sendiri' },
    })
    expect(fake.profiles.get('pemilik')!.aktif).toBe(true)
  })

  test('selalu tersisa minimal satu akun aktif', async () => {
    await manageAccounts('pemilik', { aksi: 'nonaktifkan', user_id: 'kasir' }, fake.services)
    // Kasir sudah nonaktif, jadi tidak bisa lagi menonaktifkan pemilik.
    expect((await manageAccounts('kasir', { aksi: 'nonaktifkan', user_id: 'pemilik' }, fake.services)).status).toBe(403)
    expect([...fake.profiles.values()].filter((p) => p.aktif).map((p) => p.id)).toEqual(['pemilik'])
  })

  test('akun nonaktif bisa diaktifkan lagi oleh akun mana pun dan tercatat di riwayat', async () => {
    const result = await manageAccounts('kasir', { aksi: 'aktifkan', user_id: 'mantan' }, fake.services)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(fake.profiles.get('mantan')!.aktif).toBe(true)
    expect(fake.userAuth.get('mantan')!.banned).toBe(false)
    expect(fake.logs).toEqual([
      { user_id: 'kasir', aksi: 'aktifkan_akun', entitas_id: 'mantan', data_lama: { email: 'joko@gmail.com', aktif: false }, data_baru: { aktif: true } },
    ])
  })

  test('akun yang masih aktif tidak diaktifkan lagi', async () => {
    expect(await manageAccounts('pemilik', { aksi: 'aktifkan', user_id: 'kasir' }, fake.services)).toEqual({
      status: 409,
      body: { pesan: 'Akun ini sudah aktif' },
    })
  })
})

describe('ubah nama tampilan (R16)', () => {
  test('akun mana pun bisa mengubah nama akun lain, dirapikan, tercatat lama dan baru', async () => {
    const result = await manageAccounts('kasir', { aksi: 'ubah_nama', user_id: 'pemilik', nama: '  Budi   Santoso ' }, fake.services)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(fake.profiles.get('pemilik')!.nama).toBe('Budi Santoso')
    expect(fake.logs).toEqual([
      { user_id: 'kasir', aksi: 'ubah_nama_akun', entitas_id: 'pemilik', data_lama: { nama: 'Pak Budi' }, data_baru: { nama: 'Budi Santoso' } },
    ])
  })

  test('nama kosong ditolak, nama yang sama tidak dicatat, email tidak ikut berubah', async () => {
    expect((await manageAccounts('pemilik', { aksi: 'ubah_nama', user_id: 'kasir', nama: '   ' }, fake.services)).body).toEqual({
      pesan: 'Nama wajib diisi',
    })
    expect(await manageAccounts('pemilik', { aksi: 'ubah_nama', user_id: 'kasir', nama: 'Rina', email: 'x@y.co' }, fake.services)).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(fake.logs).toEqual([])
    expect(fake.profiles.get('kasir')!.email).toBe('rina@gmail.com')
  })
})
