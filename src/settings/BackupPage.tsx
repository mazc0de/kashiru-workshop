import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useProfile } from '@/auth/session'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { downloadBlob } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { backupFileName, backupOverdue, daysSinceBackup } from '@/settings/backup'
import { BACKUP_KEY, createBackupSql, recordBackup, useLastBackup } from '@/settings/backupData'

/**
 * Pengaturan, Backup (PRD 7.6, R45, R47): unduh semua data bengkel sebagai satu file SQL.
 * Pemulihannya dilakukan developer dengan `npm run restore` ke project Supabase baru.
 */
export function BackupPage() {
  const online = useOnline()
  const profile = useProfile()
  const settings = useSettings()
  const last = useLastBackup()
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const run = useMutation({
    mutationFn: async () => {
      const now = new Date()
      const workshop = settings.data?.nama_bengkel ?? 'Bengkel'
      const sql = await createBackupSql({ workshop, createdAt: now, account: profile.nama }, (label, i, total) =>
        setProgress(`Membaca ${label.toLowerCase()} (${i + 1} dari ${total})…`),
      )
      const fileName = backupFileName(workshop, now)
      downloadBlob(new Blob([sql], { type: 'application/sql' }), fileName)
      // File sudah terunduh; kalau pencatatan gagal, backup tetap sah dan hanya pengingatnya yang tertinggal.
      const recorded = await recordBackup().then(
        () => null,
        (e: Error) => e.message,
      )
      return { fileName, recordError: recorded }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUP_KEY }),
    onSettled: () => setProgress(null),
  })

  const days = daysSinceBackup(last.data?.createdAt ?? null, now)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Backup</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">
        Paket Supabase gratis tidak menyimpan backup sendiri. Unduh backup minimal seminggu sekali, sebaiknya saat kasir tidak sedang membuat nota.
      </p>

      <div className="mt-6 flex max-w-[560px] flex-col gap-4 rounded-md border border-border bg-card p-5">
        <div>
          <p className="text-sm text-muted-foreground">Backup terakhir</p>
          <p className="mt-0.5 text-lg font-semibold">
            {last.isPending ? '–' : last.data ? formatDateTime(last.data.createdAt) : 'Belum pernah'}
          </p>
          {last.data && (
            <p className="text-sm text-muted-foreground">
              oleh {last.data.account}
              {days !== null && (days === 0 ? ', hari ini' : `, ${days} hari lalu`)}
            </p>
          )}
        </div>
        {last.isSuccess && backupOverdue(days) && (
          <Notice tone="warning">{last.data ? `Backup terakhir sudah ${days} hari lalu.` : 'Belum pernah ada backup.'} Unduh backup sekarang.</Notice>
        )}

        <Button className="w-fit" disabled={!online || run.isPending} title={online ? undefined : 'Butuh internet'} onClick={() => run.mutate()}>
          {run.isPending ? 'Menyiapkan backup…' : 'Unduh backup'}
        </Button>
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        {!online && <Notice tone="warning">Backup hanya bisa dibuat saat online.</Notice>}
        {run.isError && <Notice tone="error">Backup gagal dibuat. {run.error.message}</Notice>}
        {run.isSuccess && (
          <Notice>
            {run.data.fileName} sudah diunduh. Salin file itu ke Google Drive atau flashdisk, karena file di folder Unduhan ikut hilang kalau laptop rusak.
            {run.data.recordError && ` Catatan backup gagal disimpan (${run.data.recordError}), jadi tanggal backup terakhir belum berubah.`}
          </Notice>
        )}

        <p className="border-t border-rule pt-4 text-sm text-muted-foreground">
          File berisi semua data bengkel: produk, stok, nota, penerimaan, opname, pengaturan, dan riwayat perubahan, termasuk nama dan nopol pelanggan.
          Simpan di tempat yang aman. Password akun dan logo tidak ikut; saat pemulihan, semua akun memakai password sementara dan logo diunggah lagi.
        </p>
      </div>
    </>
  )
}
