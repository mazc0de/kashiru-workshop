import type { PaperWidth } from '@/lib/print'
import { CHARS_PER_LINE, buildReceipt, type ReceiptData } from '@/pos/receipt'

/**
 * Struk sebagai teks monospace. Di kertas, 48 karakter tepat mengisi area cetak 72 mm (dan 32 karakter
 * mengisi 48 mm), yaitu 1,5 mm per karakter. Logo opsional dicetak hitam-putih di atas.
 */
export function ReceiptSheet({
  data,
  width,
  logo,
  screen = false,
}: {
  data: ReceiptData
  width: PaperWidth
  logo: string | null
  /** Pratinjau di layar memakai ukuran huruf layar, bukan milimeter. */
  screen?: boolean
}) {
  const lines = buildReceipt(data, CHARS_PER_LINE[width])
  return (
    <div style={{ color: '#000', background: '#fff' }}>
      {logo && (
        <img
          src={logo}
          alt=""
          style={{ display: 'block', margin: '0 auto 2mm', maxWidth: screen ? '60%' : '40mm', maxHeight: screen ? '72px' : '18mm', filter: 'grayscale(1) contrast(1.4)' }}
        />
      )}
      <pre
        style={{
          margin: 0,
          fontFamily: '"Courier New", Courier, monospace',
          // Lebar satu karakter Courier New = 0,6 em, jadi 2,5 mm menghasilkan 1,5 mm per karakter.
          fontSize: screen ? '12px' : '2.5mm',
          lineHeight: 1.25,
          whiteSpace: 'pre',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}
