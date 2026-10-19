import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { z } from 'zod'

import { Field, FieldAction } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/lib/online'
import { reloadLocalCopy } from '@/lib/localCopy'
import { ACCESS, CONFIG, masterDataKey, useMasterData, type MasterDataRow, type MasterDataKind } from '@/settings/masterData'

const schema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi'),
})

export function MasterDataPage({ kind }: { kind: MasterDataKind }) {
  const k = CONFIG[kind]
  const online = useOnline()
  const queryClient = useQueryClient()
  const list = useMasterData(kind)
  const [changed, setChanged] = useState<MasterDataRow | null>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: masterDataKey(kind) })
    if (k.refreshesLocalCopy) await reloadLocalCopy().catch(() => undefined)
  }

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: '' } })
  const add = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => ACCESS[kind].add(values),
    onSuccess: async () => {
      form.reset({ name: '' })
      form.setFocus('name')
      await refresh()
    },
  })
  const changeStatus = useMutation({
    mutationFn: (b: MasterDataRow) => ACCESS[kind].update(b.id, { active: !b.active }),
    onSuccess: refresh,
  })

  const lines = list.data ?? []
  const active = lines.filter((b) => b.active).length

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{k.title}</h1>
      <p className="mt-1 max-w-[720px] text-muted-foreground">{k.note}</p>

      <form
        onSubmit={form.handleSubmit((values) => add.mutate(values))}
        noValidate
        className="mt-6 flex flex-wrap items-start gap-3 rounded-md border border-border bg-card p-4"
      >
        <Field id={`${kind}-name`} label={k.nameLabel} error={form.formState.errors.name?.message} className="min-w-[240px] flex-1">
          <Input id={`${kind}-name`} autoComplete="off" {...form.register('name')} />
        </Field>
        <FieldAction>
          <Button type="submit" disabled={!online || add.isPending}>
            {add.isPending ? 'Menyimpan…' : 'Tambah'}
          </Button>
        </FieldAction>
        {add.isError && (
          <Notice tone="error" className="w-full">
            {add.error.message}
          </Notice>
        )}
      </form>

      <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
        <div className="flex h-11 items-center justify-between px-4 text-sm text-muted-foreground">
          <span>{list.isSuccess ? `${active} aktif${lines.length > active ? ` · ${lines.length - active} nonaktif` : ''}` : 'Memuat…'}</span>
        </div>
        {list.isError && (
          <p className="border-t border-rule px-4 py-3 text-muted-foreground">
            Daftar tidak bisa dimuat.{' '}
            <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void list.refetch()}>
              Coba lagi
            </button>
          </p>
        )}
        {list.isSuccess && lines.length === 0 && (
          <p className="border-t border-rule px-4 py-3 text-muted-foreground">Belum ada {k.title.toLowerCase()}. Tambahkan di atas.</p>
        )}
        <ul>
          {lines.map((b) => (
            <li key={b.id} className="flex h-12 items-center gap-3 border-t border-rule pr-2 pl-4">
              <span className={b.active ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-muted-foreground'}>{b.name}</span>
              {!b.active && (
                <span className="inline-flex h-6 flex-none items-center rounded-sm bg-muted px-2 text-sm text-muted-foreground">Nonaktif</span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={!online} aria-label={`Aksi untuk ${b.name}`} />}>
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setChanged(b)}>Ubah</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeStatus.mutate(b)}>{b.active ? 'Nonaktifkan' : 'Aktifkan lagi'}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
        {changeStatus.isError && (
          <Notice tone="error" className="m-4">
            {changeStatus.error.message}
          </Notice>
        )}
      </div>

      <Dialog open={changed !== null} onOpenChange={(open) => !open && setChanged(null)}>
        <DialogContent>
          {changed && <EditForm kind={kind} row={changed} onDone={() => setChanged(null)} refresh={refresh} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function EditForm({ kind, row, onDone, refresh }: { kind: MasterDataKind; row: MasterDataRow; onDone: () => void; refresh: () => Promise<void> }) {
  const k = CONFIG[kind]
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: row.name },
  })
  const save = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      ACCESS[kind].update(row.id, values),
    onSuccess: async () => {
      await refresh()
      onDone()
    },
  })
  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Ubah {k.title.toLowerCase()}</DialogTitle>
        <DialogDescription>Perubahan tercatat di riwayat.</DialogDescription>
      </DialogHeader>
      <Field id="rename-master" label={k.nameLabel} error={form.formState.errors.name?.message}>
        <Input id="rename-master" autoFocus autoComplete="off" {...form.register('name')} />
      </Field>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  )
}
