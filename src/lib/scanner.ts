import { useEffect, useRef } from 'react'

// Scanner Zebra DS2208 di mode USB HID Keyboard dengan suffix Enter (PRD 4.8, 7.2).
// Scan dibedakan dari ketikan manusia lewat kecepatan: jeda < 30 ms per karakter,
// diakhiri Enter, panjang >= 4. Kalau fokus sedang di kolom teks, karakter hasil scan
// dikeluarkan lagi dari kolom itu.

export const MAX_GAP_MS = 30
export const MIN_LENGTH = 4

export type KeyResult =
  | { kind: 'start' }
  | { kind: 'continue' }
  | { kind: 'scan'; code: string }
  | { kind: 'normal' }

const MODIFIER_KEYS = new Set(['Shift', 'CapsLock'])

/** Mesin keadaan tanpa DOM: diberi tombol dan waktunya, mengembalikan apa yang terjadi. */
export class ScanDetector {
  private chars: string[] = []
  private last = 0

  press(key: string, timeMs: number): KeyResult {
    if (MODIFIER_KEYS.has(key)) return { kind: 'normal' }

    const quick = this.chars.length > 0 && timeMs - this.last < MAX_GAP_MS
    if (key === 'Enter') {
      const code = this.chars.join('')
      const scan = quick && code.length >= MIN_LENGTH
      this.chars = []
      return scan ? { kind: 'scan', code } : { kind: 'normal' }
    }
    if (key.length !== 1) {
      this.chars = []
      return { kind: 'normal' }
    }

    if (!quick) this.chars = []
    this.chars.push(key)
    this.last = timeMs
    return this.chars.length === 1 ? { kind: 'start' } : { kind: 'continue' }
  }
}

// Satu pendengar global; layar yang paling akhir terpasang yang menerima scan.

type Handler = (code: string) => void
const stack: Handler[] = []
let attached = false

type Snapshot = { el: HTMLInputElement | HTMLTextAreaElement; value: string; start: number | null; end: number | null }

function takeSnapshot(): Snapshot | null {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { el, value: el.value, start: el.selectionStart, end: el.selectionEnd }
  }
  return null
}

/** Kembalikan isi kolom teks ke sebelum scan, lewat setter bawaan supaya state React ikut berubah. */
function restore(c: Snapshot) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c.el), 'value')?.set
  setter?.call(c.el, c.value)
  c.el.dispatchEvent(new Event('input', { bubbles: true }))
  if (c.start !== null && c.end !== null) {
    try {
      c.el.setSelectionRange(c.start, c.end)
    } catch {
      // Beberapa tipe input (mis. number) tidak punya seleksi.
    }
  }
}

function attachListener() {
  if (attached) return
  attached = true
  const detector = new ScanDetector()
  let snapshot: Snapshot | null = null
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const result = detector.press(e.key, e.timeStamp)
      if (result.kind === 'start') snapshot = takeSnapshot()
      if (result.kind !== 'scan') return
      e.preventDefault()
      e.stopPropagation()
      if (snapshot) restore(snapshot)
      snapshot = null
      stack.at(-1)?.(result.code)
    },
    { capture: true },
  )
}

/** Menerima hasil scan selama komponen terpasang dan `aktif`. */
export function useBarcodeScanner(onScan: (code: string) => void, active = true) {
  const latest = useRef(onScan)
  useEffect(() => {
    latest.current = onScan
  })
  useEffect(() => {
    if (!active) return
    attachListener()
    const handler: Handler = (code) => latest.current(code)
    stack.push(handler)
    return () => {
      const i = stack.lastIndexOf(handler)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}
