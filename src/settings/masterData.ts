import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// Data master sederhana di Pengaturan (PRD 4.14): kategori dan mekanik. Supplier dihapus (R52).
// Yang nonaktif tidak muncul lagi di pilihan. Semua perubahan tercatat di riwayat oleh trigger database.

export type MasterDataRow = { id: string; name: string; active: boolean }
export type FormValues = { name: string }

export type MasterDataKind = 'category' | 'mechanic'

export const CONFIG: Record<
  MasterDataKind,
  { title: string; note: string; nameLabel: string; refreshesLocalCopy: boolean }
> = {
  category: {
    title: 'Kategori',
    note:
      'Satu tingkat, tanpa sub-kategori. Kategori nonaktif hilang dari pilihan, tetapi produk yang sudah memakainya tetap memakainya.',
    nameLabel: 'Nama kategori',
    refreshesLocalCopy: true,
  },
  mechanic: {
    title: 'Mekanik',
    note: 'Mekanik bukan pengguna aplikasi. Namanya dicatat di nota dan dipakai di laporan jasa per mekanik.',
    nameLabel: 'Nama mekanik',
    refreshesLocalCopy: true,
  },
}

/** Baris tabel kategori atau mekanik di database. */
type DbRow = { id: string; nama: string; aktif: boolean }
const toRow = (b: DbRow): MasterDataRow => ({ id: b.id, name: b.nama, active: b.aktif })

/** Akses tabel per jenis, supaya kueri tetap bertipe. */
export const ACCESS: Record<MasterDataKind, { load(): Promise<MasterDataRow[]>; add(values: FormValues): Promise<void>; update(id: string, values: Partial<FormValues> & { active?: boolean }): Promise<void> }> = {
  category: {
    async load() {
      return unwrap(await supabase().from('categories').select('id, nama, aktif').order('aktif', { ascending: false }).order('nama')).map(toRow)
    },
    async add({ name }) {
      unwrap(await supabase().from('categories').insert({ nama: name }))
    },
    async update(id, { name, active }) {
      unwrap(await supabase().from('categories').update({ nama: name, aktif: active }).eq('id', id))
    },
  },
  mechanic: {
    async load() {
      return unwrap(await supabase().from('mechanics').select('id, nama, aktif').order('aktif', { ascending: false }).order('nama')).map(toRow)
    },
    async add({ name }) {
      unwrap(await supabase().from('mechanics').insert({ nama: name }))
    },
    async update(id, { name, active }) {
      unwrap(await supabase().from('mechanics').update({ nama: name, aktif: active }).eq('id', id))
    },
  },
}

export const masterDataKey = (kind: MasterDataKind) => ['master-data', kind] as const

/** Daftar data master untuk pilihan di form (mis. kategori di form produk). */
export function useMasterData(kind: MasterDataKind) {
  return useQuery({ queryKey: masterDataKey(kind), queryFn: () => ACCESS[kind].load() })
}
