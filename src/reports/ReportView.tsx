import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'

import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { exportExcelReport, exportPdfReport } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import type { Section } from '@/reports/sections'

/** Tanda dokumen void yang tidak dihitung di laporan. */
export function VoidPill() {
  return <span className="inline-flex h-6 items-center rounded-sm bg-pill-negative px-2 text-sm text-pill-negative-ink">Void</span>
}

/**
 * Isi satu laporan: tombol ekspor, keadaan memuat/offline/galat, lalu bagian-bagiannya.
 * `sections` null selama datanya belum lengkap.
 */
export function ReportView({
  title,
  fileName,
  note,
  queries,
  sections,
  orientation = 'portrait',
}: {
  title: string
  fileName: string
  /** Baris keterangan di bawah judul ekspor dan di atas laporan, mis. periodenya. */
  note: string[]
  queries: UseQueryResult[]
  sections: Section[] | null
  orientation?: 'portrait' | 'landscape'
}) {
  const online = useOnline()
  const workshop = useSettings().data?.nama_bengkel
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null)
  // Saat offline kueri ditahan, jadi laporan tidak pernah selesai dimuat (R24).
  const needsInternet = !online && !sections
  const errored = queries.filter((q) => q.isError)

  const run = async (kind: 'excel' | 'pdf') => {
    if (!sections) return
    setBusy(kind)
    try {
      const report = {
        fileName,
        title,
        note: [...(workshop ? [workshop] : []), ...note, `Dibuat ${formatDateTime(new Date())}`],
        tables: sections.map((s) => s.table),
      }
      await (kind === 'excel' ? exportExcelReport(report) : exportPdfReport(report, orientation))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{note.join(' · ')}</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!sections || busy !== null} onClick={() => void run('excel')}>
            {busy === 'excel' ? 'Membuat file…' : 'Ekspor Excel'}
          </Button>
          <Button variant="outline" disabled={!sections || busy !== null} onClick={() => void run('pdf')}>
            {busy === 'pdf' ? 'Membuat file…' : 'Ekspor PDF'}
          </Button>
        </div>
      </div>
      {needsInternet && (
        <Notice tone="warning" className="mt-6">
          Butuh internet untuk menampilkan laporan.
        </Notice>
      )}
      {!needsInternet && errored.length > 0 && (
        <Notice tone="error" className="mt-6">
          Laporan tidak bisa dimuat. {errored[0].error?.message}{' '}
          <button type="button" className="underline underline-offset-4" onClick={() => errored.forEach((q) => void q.refetch())}>
            Coba lagi
          </button>
        </Notice>
      )}
      {!needsInternet && errored.length === 0 && !sections && <p className="mt-6 text-muted-foreground">Memuat laporan…</p>}
      {sections?.map((s) => s.node)}
    </>
  )
}
