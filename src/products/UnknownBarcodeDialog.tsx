import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatQty } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { PRODUCT_LIST_KEY, linkBarcode } from '@/products/data'
import { searchProducts, fullName, type LocalProduct } from '@/products/product'

/**
 * Barcode hasil scan belum terdaftar (PRD 4.8): daftarkan sebagai produk baru, atau tautkan ke part
 * yang sudah ada (mis. kemasan baru dari pabrik). Saat offline produk baru tidak bisa dibuat.
 */
export function NewBarcodeDialog({ code, list, onClose }: { code: string | null; list: LocalProduct[]; onClose: () => void }) {
  const online = useOnline()
  const navigate = useNavigate()
  const [linking, setLinking] = useState(false)

  const close = () => {
    setLinking(false)
    onClose()
  }

  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        {code !== null && !linking && (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Barcode belum terdaftar</DialogTitle>
              <DialogDescription>
                <span className="font-mono text-foreground">{code}</span> belum dipakai produk mana pun.
              </DialogDescription>
            </DialogHeader>
            {!online && <Notice tone="warning">Produk baru hanya bisa dibuat saat online.</Notice>}
            <DialogFooter>
              <Button variant="outline" disabled={!online} onClick={() => setLinking(true)}>
                Tautkan ke produk yang ada
              </Button>
              <Button disabled={!online} autoFocus onClick={() => navigate(`/products/new?barcode=${encodeURIComponent(code)}`)}>
                Daftarkan produk baru
              </Button>
            </DialogFooter>
          </div>
        )}
        {code !== null && linking && <LinkProductPicker code={code} list={list} onDone={close} back={() => setLinking(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkProductPicker({
  code,
  list,
  onDone,
  back,
}: {
  code: string
  list: LocalProduct[]
  onDone: () => void
  back: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const result = useMemo(() => searchProducts(list.filter((p) => p.type === 'part'), query, { limit: 8 }), [list, query])
  const save = useMutation({
    mutationFn: (p: LocalProduct) => linkBarcode(p.id, code),
    onSuccess: async (_, p) => {
      await queryClient.invalidateQueries({ queryKey: PRODUCT_LIST_KEY })
      onDone()
      navigate(`/products/${p.id}`)
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Tautkan {code}</DialogTitle>
        <DialogDescription>Pilih part yang memakai barcode ini. Barcode lamanya tetap bisa di-scan.</DialogDescription>
      </DialogHeader>
      <Input autoFocus placeholder="Cari nama, merek, atau kode part" aria-label="Cari part" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
        {result.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(p)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate">{fullName(p)}</span>
                <span className="block truncate text-sm text-muted-foreground">{p.category}</span>
              </span>
              <span className="flex-none text-sm text-muted-foreground">
                {formatQty(p.stock ?? 0)} {p.unit}
              </span>
            </button>
          </li>
        ))}
        {result.length === 0 && <li className="px-3 py-2.5 text-muted-foreground">Tidak ada part yang cocok.</li>}
      </ul>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button variant="outline" onClick={back}>
          Kembali
        </Button>
      </DialogFooter>
    </div>
  )
}
