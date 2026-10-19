import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { BACKUP_TABLES, buildBackupSql, findInconsistency, type BackupMeta, type BackupTable, type Row, type TableDump } from '@/settings/backup'

// Backup manual (PRD 7.6, R45, R47): membaca semua tabel lewat Data API dan mencatat setiap unduhan.

export const BACKUP_KEY = ['backup'] as const

const PAGE_SIZE = 1000 // batas baris per permintaan di Data API Supabase
const ATTEMPTS = 3

/** Satu tabel lengkap, per 1.000 baris dengan urutan kunci utama. Nama tabel dinamis, jadi tanpa tipe tabel. */
async function fetchTable(t: BackupTable): Promise<Row[]> {
  const client = supabase() as unknown as SupabaseClient
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = client.from(t.name).select('*')
    for (const k of t.key) q = q.order(k)
    const data = unwrap(await q.range(from, from + PAGE_SIZE - 1)) as Row[]
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}

/**
 * Isi file backup. Kalau ada transaksi tersimpan selagi tabel dibaca satu per satu, isinya tidak utuh;
 * pembacaan diulang sampai 3 kali sebelum menyerah.
 */
export async function createBackupSql(meta: BackupMeta, onProgress: (label: string, index: number, total: number) => void): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const dump: TableDump[] = []
    for (const [i, t] of BACKUP_TABLES.entries()) {
      onProgress(t.label, i, BACKUP_TABLES.length)
      dump.push({ table: t, rows: await fetchTable(t) })
    }
    if (!findInconsistency(dump)) return buildBackupSql(dump, meta)
    if (attempt === ATTEMPTS) throw new Error('Data berubah selama dibaca karena ada transaksi yang sedang tersimpan. Coba lagi setelah kasir selesai.')
  }
}

export async function recordBackup(): Promise<void> {
  unwrap(await supabase().rpc('record_backup'))
}

export type LastBackup = { createdAt: string; account: string }

/** Backup terakhir untuk Pengaturan dan pengingat di Dashboard (R47). */
export function useLastBackup() {
  return useQuery({
    queryKey: [...BACKUP_KEY, 'last'],
    queryFn: async (): Promise<LastBackup | null> => {
      const [r] = unwrap(await supabase().from('backup_logs').select('created_at, profiles ( nama )').order('created_at', { ascending: false }).limit(1))
      return r ? { createdAt: r.created_at, account: r.profiles?.nama ?? '' } : null
    },
  })
}
