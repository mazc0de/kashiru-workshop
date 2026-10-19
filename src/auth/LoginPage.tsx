import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { recordActivity } from '@/auth/autoLogout'
import { useSession } from '@/auth/session'
import { Field } from '@/components/Field'
import { Notice } from '@/components/Notice'
import { KashiruMark } from '@/components/KashiruMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/lib/online'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().trim().min(1, 'Email wajib diisi').pipe(z.email('Email tidak valid')),
  password: z.string().min(1, 'Password wajib diisi'),
})
type LoginValues = z.infer<typeof schema>

function loginErrorMessage(code: string | undefined, message: string): string {
  if (code === 'invalid_credentials') return 'Email atau password salah.'
  if (code === 'user_banned') return 'Akun ini sudah dinonaktifkan.'
  if (/fetch|network/i.test(message)) return 'Tidak bisa terhubung ke server. Periksa internet.'
  return `Gagal masuk: ${message}`
}

export function LoginPage() {
  const { status } = useSession()
  const online = useOnline()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? '/'
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  if (status.stage === 'signedIn') return <Navigate to={destination} replace />

  const signIn = form.handleSubmit(async ({ email, password }) => {
    setServerError(null)
    const { error } = await supabase().auth.signInWithPassword({ email: email.toLowerCase(), password })
    if (error) {
      setServerError(loginErrorMessage(error.code, error.message))
      return
    }
    recordActivity()
    void supabase().rpc('touch_last_login')
    navigate(destination, { replace: true })
  })

  const signOutMessage = status.stage === 'signedOut' ? status.message : null

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pt-[12vh] pb-10">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5">
          <KashiruMark />
          <span className="text-base font-semibold">Kashiru</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Masuk</h1>

        {!online && (
          <Notice tone="warning" className="mt-4">
            Tidak ada koneksi internet. Masuk butuh internet.
          </Notice>
        )}
        {signOutMessage && online && <Notice className="mt-4">{signOutMessage}</Notice>}

        <form onSubmit={signIn} noValidate className="mt-6 flex flex-col gap-4">
          <Field id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(errors.email)}
              {...form.register('email')}
            />
          </Field>
          <Field id="password" label="Password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...form.register('password')}
            />
          </Field>
          {serverError && <Notice tone="error">{serverError}</Notice>}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting || !online}>
            {isSubmitting ? 'Memeriksa…' : 'Masuk'}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Lupa password? Minta akun lain di bengkel membuat password baru dari Pengaturan, Akun.
        </p>
      </div>
    </main>
  )
}
