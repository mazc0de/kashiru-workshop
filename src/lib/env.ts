import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  // Publishable key (sb_publishable_...) atau anon key lama. Jangan pernah memakai service role di sini.
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export type EnvResult = { ok: true; url: string; key: string } | { ok: false; short: string[] }

export function readEnv(source: Record<string, unknown> = import.meta.env): EnvResult {
  const result = schema.safeParse(source)
  if (result.success) {
    return { ok: true, url: result.data.VITE_SUPABASE_URL, key: result.data.VITE_SUPABASE_PUBLISHABLE_KEY }
  }
  return { ok: false, short: [...new Set(result.error.issues.map((i) => String(i.path[0])))] }
}
