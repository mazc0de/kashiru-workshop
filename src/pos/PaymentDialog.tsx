import { useEffect, useState } from 'react'
import { cn } from 'cn'

import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatNumber, formatRupiah, parseRupiah } from '@/lib/format'
import { calculatePayment, PAYMENT_METHOD_LABELS, QUICK_CASH, type PaymentMethod } from '@/pos/calculate'
import { previewNumber, prepareAttempt, type Attempt } from '@/pos/checkout'

const METHODS: { method: PaymentMethod; key: string }[] = [
  { method: 'tunai', key: 'U' },
  { method: 'qris', key: 'Q' },
  { method: 'transfer', key: 'T' },
  { method: 'edc', key: 'E' },
]

/**
 * F9 Bayar (PRD 4.6): satu metode bayar sebagai catatan. Tunai mengisi uang diterima dengan bantuan
 * Uang pas dan pecahan cepat; metode lain otomatis sebesar total. Percobaan ulang memakai nomor yang sama.
 */
export function PaymentDialog({
  total,
  prefix,
  pay,
  cancel,
}: {
  total: number
  prefix: string
  pay: (options: { method: PaymentMethod; cash: number | null; attempt: Attempt }) => Promise<void>
  cancel: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('tunai')
  const [cash, setCash] = useState('')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [sending, setSending] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    prepareAttempt()
      .then((p) => !cancel && setAttempt(p))
      .catch((e: unknown) => !cancel && setErrorText(e instanceof Error ? e.message : String(e)))
    return () => {
      cancel = true
    }
  }, [])

  const cashAmount = method === 'tunai' ? parseRupiah(cash) : null
  const result = calculatePayment(method, total, cashAmount)
  const short = method === 'tunai' && cashAmount !== null && cashAmount < total ? total - cashAmount : null

  const send = async () => {
    if (!attempt || !result || sending) return
    setSending(true)
    setErrorText(null)
    try {
      await pay({ method, cash: method === 'tunai' ? result.cash : null, attempt })
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e))
      setSending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        const foldCase = e.key.toUpperCase()
        const choice = METHODS.find((m) => m.key === foldCase)
        if (choice) {
          e.preventDefault()
          setMethod(choice.method)
        } else if (foldCase === 'P' && method === 'tunai') {
          e.preventDefault()
          setCash(formatNumber(total))
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Bayar</DialogTitle>
        <DialogDescription>{attempt ? `Nota ${previewNumber(prefix, attempt)}` : 'Menyiapkan nomor nota…'}</DialogDescription>
      </DialogHeader>

      <div>
        <p className="text-sm text-muted-foreground">Total</p>
        <p className="text-3xl font-bold tracking-tight">{formatRupiah(total)}</p>
      </div>

      <div role="radiogroup" aria-label="Metode bayar" className="grid grid-cols-4 gap-1 rounded-md border border-input bg-card p-1">
        {METHODS.map((m) => (
          <button
            key={m.method}
            type="button"
            role="radio"
            aria-checked={method === m.method}
            onClick={() => setMethod(m.method)}
            className={cn('h-11 rounded-sm text-[15px] text-muted-foreground', method === m.method && 'bg-active text-foreground')}
          >
            {PAYMENT_METHOD_LABELS[m.method]} <span className="text-muted-foreground">{m.key}</span>
          </button>
        ))}
      </div>

      {method === 'tunai' ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="cash-received" className="text-sm font-medium">
            Uang diterima
          </label>
          <div className="relative w-60">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">Rp</span>
            <Input
              id="cash-received"
              autoFocus
              inputMode="numeric"
              className="h-14 pl-10 text-right text-xl"
              value={cash}
              onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))}
              onBlur={() => {
                const v = parseRupiah(cash)
                if (v !== null) setCash(formatNumber(v))
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setCash(formatNumber(total))}>
              Uang pas <span className="text-muted-foreground">P</span>
            </Button>
            {QUICK_CASH.map((p) => (
              <Button key={p} type="button" variant="outline" onClick={() => setCash(formatNumber(p))}>
                {formatNumber(p)}
              </Button>
            ))}
          </div>
          <p className="text-lg">
            {result ? (
              <>
                Kembali <span className="font-bold">{formatRupiah(result.change)}</span>
              </>
            ) : short !== null ? (
              <span className="text-negative">Kurang {formatRupiah(short)}</span>
            ) : (
              <span className="text-muted-foreground">Isi uang yang diterima.</span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">Nominal {PAYMENT_METHOD_LABELS[method]} sama dengan total. Metode bayar hanya dicatat di nota.</p>
      )}

      {errorText && <Notice tone="error">Nota belum tersimpan: {errorText}</Notice>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel} disabled={sending}>
          Batal <span className="text-muted-foreground">Esc</span>
        </Button>
        <Button type="submit" size="lg" disabled={!attempt || !result || sending}>
          {sending ? 'Menyimpan…' : errorText ? 'Coba lagi' : 'Bayar dan cetak'} <span className="opacity-60">Enter</span>
        </Button>
      </DialogFooter>
    </form>
  )
}
