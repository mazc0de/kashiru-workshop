// Menggabungkan Edge Function manage-accounts menjadi satu file untuk ditempel di editor dashboard Supabase.
// Sumber tetap supabase/functions/manage-accounts/{index.ts,manage-accounts.ts}; file gabungan jangan diedit.
//
//   npm run functions:dashboard
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const folder = new URL('../supabase/functions/manage-accounts/', import.meta.url)
const target = new URL('../supabase/dashboard/manage-accounts.ts', import.meta.url)

const logic = readFileSync(new URL('manage-accounts.ts', folder), 'utf8')
const lines = readFileSync(new URL('index.ts', folder), 'utf8').split('\n')

const externalImports = lines.filter((b) => b.startsWith('import ') && !b.includes("'./manage-accounts.ts'"))
const rest = lines.filter((b) => !b.startsWith('import ')).join('\n').replace(/^(\/\/.*\n)+\n*/, '')

writeFileSync(
  (mkdirSync(new URL('.', target), { recursive: true }), target),
  `// Edge Function manage-accounts dalam satu file, untuk editor dashboard Supabase.
// Dibuat oleh \`npm run functions:dashboard\` dari supabase/functions/manage-accounts. Jangan diedit langsung.
${externalImports.join('\n')}

${logic.trim()}

// --- Penghubung ke Supabase (index.ts) ---

${rest.trim()}
`,
)
console.log('Ditulis: supabase/dashboard/manage-accounts.ts')
