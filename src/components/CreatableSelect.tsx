import { useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from 'cn'

import { Input } from '@/components/ui/input'

export type Options = { id: string; name: string; active: boolean }

/**
 * Isian pilihan yang bisa membuat item baru dari teks yang diketik: "+ Buat kategori '…'" (PRD 4.2).
 * Yang nonaktif tidak muncul di pilihan, kecuali sedang menjadi nilai (ditandai "nonaktif").
 * Pola ARIA combobox dengan listbox: ↑/↓ memilih, Enter memakai, Esc menutup.
 */
export function CreatableSelect({
  id,
  options,
  value,
  onSelect,
  onCreate,
  kind,
  canCreate = true,
  invalid,
  disabled,
}: {
  id: string
  options: Options[]
  value: string | null
  onSelect: (id: string) => void
  /** Membuat item baru dan mengembalikan id-nya. */
  onCreate: (name: string) => Promise<string>
  /** Kata untuk tombol buat, mis. "kategori". */
  kind: string
  /** false saat offline: data master baru tidak bisa dibuat. */
  canCreate?: boolean
  invalid?: boolean
  disabled?: boolean
}) {
  const idList = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.id === value) ?? null
  const [text, setText] = useState<string | null>(null) // null = tidak sedang mengetik
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [creating, setCreating] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const query = (text ?? '').trim()
  const matched = useMemo(() => {
    const k = query.toLowerCase()
    return options
      .filter((o) => o.active && (!k || o.name.toLowerCase().includes(k)))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [options, query])
  const hasExact = options.some((o) => o.name.toLowerCase() === query.toLowerCase())
  const offerCreate = canCreate && query.length > 0 && !hasExact
  const optionCount = matched.length + (offerCreate ? 1 : 0)

  const close = () => {
    setOpen(false)
    setText(null)
    setHighlight(0)
  }

  const choose = async (index: number) => {
    if (index < matched.length) {
      onSelect(matched[index].id)
      close()
      return
    }
    if (!offerCreate) return
    setCreating(true)
    setErrorText(null)
    try {
      const newId = await onCreate(query)
      onSelect(newId)
      close()
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const shown = text ?? (selected ? `${selected.name}${selected.active ? '' : ' (nonaktif)'}` : '')

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={idList}
        aria-autocomplete="list"
        aria-activedescendant={open && optionCount ? `${idList}-${highlight}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        disabled={disabled || creating}
        value={shown}
        className="pr-10"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setHighlight(0)
          setErrorText(null)
        }}
        onBlur={() => setTimeout(close, 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHighlight((s) => (optionCount ? (s + 1) % optionCount : 0))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((s) => (optionCount ? (s - 1 + optionCount) % optionCount : 0))
          } else if (e.key === 'Enter' && open && optionCount) {
            e.preventDefault()
            void choose(highlight)
          } else if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      {open && (
        <ul
          id={idList}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {matched.map((o, i) => (
            <li
              key={o.id}
              id={`${idList}-${i}`}
              role="option"
              aria-selected={o.id === value}
              className={cn('flex h-11 cursor-default items-center rounded-sm px-3', i === highlight && 'bg-accent')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => void choose(i)}
            >
              {o.name}
            </li>
          ))}
          {offerCreate && (
            <li
              id={`${idList}-${matched.length}`}
              role="option"
              aria-selected={false}
              className={cn('flex h-11 cursor-default items-center gap-2 rounded-sm px-3', highlight === matched.length && 'bg-accent')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(matched.length)}
              onClick={() => void choose(matched.length)}
            >
              <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
              Buat {kind} &lsquo;{query}&rsquo;
            </li>
          )}
          {optionCount === 0 && (
            <li className="px-3 py-2.5 text-muted-foreground">
              {canCreate ? `Ketik nama untuk membuat ${kind} baru.` : `Tidak ada ${kind} yang cocok. ${kind[0].toUpperCase()}${kind.slice(1)} baru hanya bisa dibuat saat online.`}
            </li>
          )}
        </ul>
      )}
      {errorText && <p className="mt-2 text-sm text-negative" role="alert">{errorText}</p>}
    </div>
  )
}
