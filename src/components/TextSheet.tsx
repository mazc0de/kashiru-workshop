/** Lembar teks lebar tetap untuk printer struk: 1,5 mm per karakter seperti struk (PRD 4.10). */
export function TextSheet({ lines, screen = false }: { lines: string[]; screen?: boolean }) {
  return (
    <pre
      style={{
        margin: 0,
        color: '#000',
        background: '#fff',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: screen ? '12px' : '2.5mm',
        lineHeight: 1.25,
        whiteSpace: 'pre',
      }}
    >
      {lines.join('\n')}
    </pre>
  )
}
