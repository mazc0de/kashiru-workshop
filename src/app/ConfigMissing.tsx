import { KashiruMark } from '@/components/KashiruMark'

/** Tampil kalau .env belum berisi alamat dan kunci Supabase. */
export function ConfigMissing({ short }: { short: string[] }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pt-[12vh]">
      <div className="w-full max-w-[520px]">
        <KashiruMark />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Supabase belum diatur</h1>
        <p className="mt-2 text-muted-foreground">
          Salin <code className="font-mono text-foreground">.env.example</code> menjadi{' '}
          <code className="font-mono text-foreground">.env</code>, isi nilai berikut dari Supabase (Project Settings, API Keys),
          lalu jalankan ulang aplikasi.
        </p>
        <ul className="mt-4 flex flex-col gap-1">
          {short.map((name) => (
            <li key={name} className="font-mono text-sm">
              {name}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
