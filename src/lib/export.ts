import { formatNumber, formatQty } from '@/lib/format'

// Ekspor ke Excel dan PDF (PRD 4.5, 4.11, R22): file dibuat di browser lalu diunduh, jadi berjalan sama
// di laptop kasir (kiosk printing) dan di HP pemilik. Library baru dimuat saat tombol ekspor ditekan.
// Laporan bisa berisi beberapa tabel: satu sheet per tabel di Excel, berurutan di PDF (R34).

export type ColumnKind = 'text' | 'rupiah' | 'qty'
export type Cell = string | number | null

export type ExportColumn<T> = {
  title: string
  value: (row: T) => Cell
  kind?: ColumnKind
  /** Lebar kolom Excel dalam karakter. */
  width?: number
}

export type ExportData<T> = {
  /** Nama file tanpa ekstensi, mis. "opname-OPN-20261018-01". */
  fileName: string
  title: string
  /** Baris keterangan di bawah judul PDF (nama bengkel, periode, dll.). */
  note?: string[]
  columns: ExportColumn<T>[]
  rows: T[]
  /** Baris total di bawah tabel PDF dan Excel. */
  total?: Cell[]
}

/** Satu tabel yang sudah diubah menjadi sel, siap ditulis ke Excel atau PDF. */
export type ExportTable = {
  title: string
  columns: { title: string; kind: ColumnKind; width: number }[]
  rows: Cell[][]
  total?: Cell[]
}

export type ExportReport = {
  fileName: string
  title: string
  note?: string[]
  tables: ExportTable[]
}

export function toTable<T>(title: string, columns: ExportColumn<T>[], rows: T[], total?: Cell[]): ExportTable {
  return {
    title,
    columns: columns.map((c) => ({ title: c.title, kind: c.kind ?? 'text', width: c.width ?? 16 })),
    rows: rows.map((r) => columns.map((c) => c.value(r))),
    total,
  }
}

const toReport = <T,>(d: ExportData<T>): ExportReport => ({
  fileName: d.fileName,
  title: d.title,
  note: d.note,
  tables: [toTable(d.title, d.columns, d.rows, d.total)],
})

const FORMAT_EXCEL: Record<ColumnKind, string | undefined> = { text: undefined, rupiah: '#,##0', qty: '#,##0.##' }

/** Nama sheet Excel: paling banyak 31 karakter, tanpa []:*?/\ dan unik. */
export function sheetNames(titles: string[]): string[] {
  const used = new Set<string>()
  return titles.map((t) => {
    const base = t.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Data'
    let name = base
    for (let i = 2; used.has(name); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`
    used.add(name)
    return name
  })
}

function excelCell(v: Cell, kind: ColumnKind, bold = false) {
  if (v === null || v === '') return null
  const weight = bold ? { fontWeight: 'bold' as const } : {}
  return typeof v === 'number' ? { value: v, type: Number, format: FORMAT_EXCEL[kind], ...weight } : { value: String(v), ...weight }
}

/** Isi file Excel (.xlsx) sebagai Blob, satu sheet per tabel. */
export async function createExcelReport(r: ExportReport): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const names = sheetNames(r.tables.map((t) => t.title))
  const sheets = r.tables.map((t, i) => ({
    sheet: names[i],
    columns: t.columns.map((c) => ({ width: c.width })),
    data: [
      t.columns.map((c) => ({ value: c.title, fontWeight: 'bold' as const })),
      ...t.rows.map((row) => row.map((v, j) => excelCell(v, t.columns[j].kind))),
      ...(t.total ? [t.total.map((v, j) => excelCell(v, t.columns[j]?.kind ?? 'text', true))] : []),
    ],
  }))
  return writeExcelFile(sheets).toBlob()
}

export const createExcel = <T,>(d: ExportData<T>) => createExcelReport(toReport(d))

/** Unduh file yang dibuat di browser (ekspor laporan, backup). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function exportExcelReport(r: ExportReport): Promise<void> {
  downloadBlob(await createExcelReport(r), `${r.fileName}.xlsx`)
}

export const exportExcel = <T,>(d: ExportData<T>) => exportExcelReport(toReport(d))

function cellText(v: Cell, kind: ColumnKind | undefined): string {
  if (v === null) return ''
  if (typeof v !== 'number') return v
  return kind === 'qty' ? formatQty(v) : formatNumber(v)
}

/** Dokumen PDF A4: judul, keterangan, lalu setiap tabel berurutan dengan judulnya. */
export async function createPdfReport(r: ExportReport, orientation: 'portrait' | 'landscape' = 'portrait') {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(r.title, 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  ;(r.note ?? []).forEach((line, i) => doc.text(line, 14, 22 + i * 4.5))
  let y = 22 + (r.note?.length ?? 0) * 4.5 + 2
  const single = r.tables.length === 1
  for (const t of r.tables) {
    if (!single) {
      // Judul bagian; pindah halaman kalau sisa ruang terlalu sedikit untuk judul dan beberapa baris.
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        y = 16
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(t.title, 14, y + 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      y += 7
    }
    autoTable(doc, {
      startY: y,
      head: [t.columns.map((c) => c.title)],
      body: t.rows.map((row) => row.map((v, j) => cellText(v, t.columns[j].kind))),
      foot: t.total ? [t.total.map((v, j) => cellText(v, t.columns[j]?.kind))] : undefined,
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: [226, 225, 221], lineWidth: 0.1, textColor: [20, 20, 20] },
      headStyles: { fillColor: [243, 242, 239], textColor: [20, 20, 20], fontStyle: 'bold' },
      footStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(t.columns.map((c, j) => [j, { halign: c.kind === 'text' ? 'left' : 'right' }])),
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(110)
    doc.text(`Halaman ${i} dari ${pages}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
    doc.setTextColor(20)
  }
  return doc
}

export const createPdf = <T,>(d: ExportData<T>, orientation: 'portrait' | 'landscape' = 'portrait') => createPdfReport(toReport(d), orientation)

export async function exportPdfReport(r: ExportReport, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<void> {
  const doc = await createPdfReport(r, orientation)
  doc.save(`${r.fileName}.pdf`)
}

export const exportPdf = <T,>(d: ExportData<T>, orientation: 'portrait' | 'landscape' = 'portrait') => exportPdfReport(toReport(d), orientation)
