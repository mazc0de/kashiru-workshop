import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { z } from 'zod'

import { useProfile } from '@/auth/session'
import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { TableRow } from '@/lib/database.types'
import { formatDateTime } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { supabase } from '@/lib/supabase'
import { callManageAccounts } from '@/settings/manageAccounts'

type Account = Pick<TableRow<'profiles'>, 'id' | 'email' | 'nama' | 'aktif' | 'terakhir_login'>
type OpenDialog =
  | { kind: 'tambah' }
  | { kind: 'password'; account: Account }
  | { kind: 'nama'; account: Account }
  | { kind: 'nonaktifkan'; account: Account }
  | { kind: 'aktifkan'; account: Account }
  | null

const ACCOUNTS_KEY = ['akun'] as const

/**
 * Pengaturan, Akun: semua akun setara dan bisa dikelola oleh akun mana pun (PRD 4.1).
 * Akun tidak bisa menonaktifkan dirinya sendiri, dan akun nonaktif bisa diaktifkan lagi (R14).
 * Nama tampilan bisa diubah, email tidak (R16).
 */
export function AccountsPage() {
  const me = useProfile()
  const online = useOnline()
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const account = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase()
        .from('profiles')
        .select('id, email, nama, aktif, terakhir_login')
        .order('aktif', { ascending: false })
        .order('nama')
      if (error) throw new Error(error.message)
      return data
    },
  })

  const list = account.data ?? []
  const activeCount = list.filter((a) => a.aktif).length
  const inactiveCount = list.length - activeCount

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Akun</h1>
          <p className="mt-1 text-muted-foreground">
            {account.isSuccess
              ? `${activeCount} akun aktif${inactiveCount ? ` · ${inactiveCount} nonaktif` : ''}. Semua akun bisa membuka semua menu.`
              : 'Semua akun bisa membuka semua menu.'}
          </p>
        </div>
        <Button
          disabled={!online}
          title={online ? undefined : 'Butuh internet'}
          onClick={() => setDialog({ kind: 'tambah' })}
        >
          Tambah akun
        </Button>
      </div>

      {!online && (
        <Notice tone="warning" className="mt-6">
          Tidak ada koneksi internet. Akun hanya bisa dikelola saat online.
        </Notice>
      )}

      <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="h-11 text-sm text-muted-foreground">
              <th className="px-4 font-normal">Nama</th>
              <th className="px-4 font-normal">Email</th>
              <th className="px-4 text-right font-normal">Terakhir masuk</th>
              <th className="w-[200px] px-4 font-normal">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {account.isPending &&
              [0, 1, 2].map((i) => (
                <tr key={i} className="h-12 border-t border-rule" aria-hidden="true">
                  <td className="px-4"><div className="h-4 w-28 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="h-4 w-40 rounded-sm bg-muted" /></td>
                  <td className="px-4"><div className="ml-auto h-4 w-32 rounded-sm bg-muted" /></td>
                  <td />
                </tr>
              ))}
            {account.isError && (
              <tr className="border-t border-rule">
                <td colSpan={4} className="px-4 py-3 text-muted-foreground">
                  Daftar akun tidak bisa dimuat.{' '}
                  <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void account.refetch()}>
                    Coba lagi
                  </button>
                </td>
              </tr>
            )}
            {list.map((a) => (
              <tr key={a.id} className="h-12 border-t border-rule">
                <td className="px-4">
                  <span className={a.aktif ? undefined : 'text-muted-foreground'}>{a.nama}</span>
                  {a.id === me.id && <span className="ml-2 text-sm text-muted-foreground">Anda</span>}
                </td>
                <td className="px-4 text-muted-foreground">{a.email}</td>
                <td className="px-4 text-right text-muted-foreground">
                  {a.terakhir_login ? formatDateTime(a.terakhir_login) : '–'}
                </td>
                <td className="px-2 text-right whitespace-nowrap">
                  {!a.aktif && (
                    <span className="mr-2 inline-flex h-6 flex-none items-center rounded-sm bg-muted px-2 text-sm text-muted-foreground">
                      Nonaktif
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" disabled={!online} aria-label={`Aksi untuk ${a.nama}`} />}
                    >
                      <MoreHorizontal className="size-4" strokeWidth={1.75} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDialog({ kind: 'nama', account: a })}>Ubah nama</DropdownMenuItem>
                      {a.aktif && (
                        <DropdownMenuItem onClick={() => setDialog({ kind: 'password', account: a })}>Password baru</DropdownMenuItem>
                      )}
                      {a.aktif && a.id !== me.id && (
                        <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: 'nonaktifkan', account: a })}>
                          Nonaktifkan
                        </DropdownMenuItem>
                      )}
                      {!a.aktif && (
                        <DropdownMenuItem onClick={() => setDialog({ kind: 'aktifkan', account: a })}>Aktifkan lagi</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog?.kind === 'tambah' && <AddAccountForm onDone={() => setDialog(null)} />}
          {dialog?.kind === 'password' && <NewPasswordForm account={dialog.account} onDone={() => setDialog(null)} />}
          {dialog?.kind === 'nama' && <RenameForm account={dialog.account} onDone={() => setDialog(null)} />}
          {dialog?.kind === 'nonaktifkan' && <ConfirmDeactivate account={dialog.account} onDone={() => setDialog(null)} />}
          {dialog?.kind === 'aktifkan' && <ConfirmActivate account={dialog.account} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

const passwordField = z.string().min(6, 'Password minimal 6 karakter')

const addSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi'),
  email: z.string().trim().min(1, 'Email wajib diisi').pipe(z.email('Email tidak valid')),
  password: passwordField,
})

function AddAccountForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: z.infer<typeof addSchema>) =>
      callManageAccounts({ aksi: 'buat', nama: values.name, email: values.email.toLowerCase(), password: values.password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
      onDone()
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Tambah akun</DialogTitle>
        <DialogDescription>Akun langsung aktif. Berikan email dan password awal ini kepada pemiliknya.</DialogDescription>
      </DialogHeader>
      <Field id="account-name" label="Nama" hint="Tercetak di struk sebagai kasir." error={errors.name?.message}>
        <Input id="account-name" autoFocus aria-invalid={Boolean(errors.name)} {...form.register('name')} />
      </Field>
      <Field id="account-email" label="Email" error={errors.email?.message}>
        <Input id="account-email" type="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
      </Field>
      <Field id="account-password" label="Password awal" hint="Minimal 6 karakter." error={errors.password?.message}>
        <Input
          id="account-password"
          type="text"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </Field>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan akun'}
        </Button>
      </DialogFooter>
    </form>
  )
}

const passwordSchema = z.object({ password: passwordField })

/** Juga dipakai untuk mengganti password sendiri dari baris akun sendiri (R15). */
function NewPasswordForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const me = useProfile()
  const isOwnAccount = account.id === me.id
  const queryClient = useQueryClient()
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: ({ password }: z.infer<typeof passwordSchema>) =>
      callManageAccounts({ aksi: 'reset_password', user_id: account.id, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
      onDone()
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{isOwnAccount ? 'Password baru untuk akun Anda' : `Password baru untuk ${account.nama}`}</DialogTitle>
        <DialogDescription>
          {isOwnAccount
            ? 'Password lama tidak bisa dipakai lagi. Anda tetap masuk di perangkat ini.'
            : `Password lama tidak bisa dipakai lagi. Berikan password baru ini kepada ${account.nama}.`}
        </DialogDescription>
      </DialogHeader>
      <Field id="reset-password" label="Password baru" hint="Minimal 6 karakter." error={errors.password?.message}>
        <Input
          id="reset-password"
          type="text"
          autoComplete="new-password"
          autoFocus
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </Field>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan password'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ConfirmDeactivate({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => callManageAccounts({ aksi: 'nonaktifkan', user_id: account.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
      onDone()
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Nonaktifkan {account.nama}?</DialogTitle>
        <DialogDescription>
          {account.email} tidak bisa masuk lagi dan tidak bisa membuka data dari perangkat mana pun. Nota yang sudah dibuat
          akun ini tetap tersimpan, termasuk nota offline yang belum terkirim.
        </DialogDescription>
      </DialogHeader>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="button" variant="destructive" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Menonaktifkan…' : 'Nonaktifkan akun'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function ConfirmActivate({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => callManageAccounts({ aksi: 'aktifkan', user_id: account.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
      onDone()
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Aktifkan lagi {account.nama}?</DialogTitle>
        <DialogDescription>
          {account.email} bisa masuk lagi dengan password terakhirnya. Kalau password itu sudah lupa, buat password baru
          setelah akun aktif.
        </DialogDescription>
      </DialogHeader>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Mengaktifkan…' : 'Aktifkan akun'}
        </Button>
      </DialogFooter>
    </div>
  )
}

const nameSchema = z.object({ name: z.string().trim().min(1, 'Nama wajib diisi') })

/** Nama tampilan tercetak di struk, termasuk saat nota lama dicetak ulang (R16). */
function RenameForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: account.nama },
  })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: ({ name }: z.infer<typeof nameSchema>) => callManageAccounts({ aksi: 'ubah_nama', user_id: account.id, nama: name }),
    onSuccess: async () => {
      // Nama akun sendiri juga tampil di pojok layar.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['session', 'profile', account.id] }),
      ])
      onDone()
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Ubah nama</DialogTitle>
        <DialogDescription>
          Nama ini tercetak di struk sebagai kasir, termasuk saat nota lama dicetak ulang. Email {account.email} tidak berubah.
        </DialogDescription>
      </DialogHeader>
      <Field id="rename" label="Nama" error={errors.name?.message}>
        <Input id="rename" autoFocus aria-invalid={Boolean(errors.name)} {...form.register('name')} />
      </Field>
      {save.isError && <Notice tone="error">{save.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan nama'}
        </Button>
      </DialogFooter>
    </form>
  )
}
