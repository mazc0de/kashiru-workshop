// Membuat src/lib/database.types.ts dari migrasi SQL, dengan format yang sama seperti `supabase gen types`.
// Berjalan di Postgres sementara (PGlite), jadi tidak butuh Docker, login, atau koneksi ke Supabase.
//
//   npm run gen:types
import { writeFileSync } from 'node:fs'
import { migratedDb } from '../supabase/tests/harness.mjs'

const TARGET = new URL('../src/lib/database.types.ts', import.meta.url)

const PG_TYPES = {
  uuid: 'string', text: 'string', varchar: 'string', date: 'string', timestamptz: 'string', timestamp: 'string',
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number', float4: 'number', float8: 'number',
  bool: 'boolean', json: 'Json', jsonb: 'Json',
  // Nama dari regtype (argumen fungsi).
  'timestamp with time zone': 'string', smallint: 'number', integer: 'number', bigint: 'number',
  boolean: 'boolean', 'character varying': 'string', 'double precision': 'number',
}

function tsType(name) {
  if (name.startsWith('_')) return `${tsType(name.slice(1))}[]`
  if (name.endsWith('[]')) return `${tsType(name.slice(0, -2))}[]`
  const t = PG_TYPES[name]
  if (!t) throw new Error(`Tipe Postgres belum dipetakan: ${name}`)
  return t
}

const quoteKey = (k) => (/^[a-z_][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k))
const objectBlock = (lines, indent) =>
  lines.length ? `{\n${lines.map((b) => `${' '.repeat(indent + 2)}${b}`).join('\n')}\n${' '.repeat(indent)}}` : '{}'

const db = await migratedDb()

const columns = (
  await db.query(`
    select c.table_name, c.column_name, c.is_nullable = 'YES' as nullable, c.udt_name,
           c.column_default is not null as has_default, c.is_identity = 'YES' as is_identity,
           c.is_generated = 'ALWAYS' as is_generated, t.table_type
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public'
    order by c.table_name, c.column_name`)
).rows

const relations = (
  await db.query(`
    select con.conname, rel.relname as table_name, fr.relname as referenced_table,
           array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as columns,
           array(select a.attname::text from unnest(con.confkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as referenced_columns,
           exists (select 1 from pg_index ix where ix.indrelid = con.conrelid and ix.indisunique
                   and (select array_agg(x order by x) from unnest(ix.indkey::int2[]) x)
                     = (select array_agg(x order by x) from unnest(con.conkey) x)) as one_to_one
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_class fr on fr.oid = con.confrelid
    join pg_namespace fns on fns.oid = fr.relnamespace
    where con.contype = 'f' and ns.nspname = 'public' and fns.nspname = 'public'
    order by rel.relname, con.conname`)
).rows

const functions = (
  await db.query(`
    select p.proname, p.proretset, p.pronargdefaults, p.prorettype::regtype::text as return_type,
           coalesce(p.proargnames, '{}') as arg_names, coalesce(p.proargmodes::text[], '{}') as arg_modes,
           coalesce(p.proallargtypes::regtype[]::text[], p.proargtypes::regtype[]::text[]) as arg_types
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
    order by p.proname`)
).rows
await db.close()

function tableBlock(name) {
  const k = columns.filter((x) => x.table_name === name)
  const row = k.map((x) => `${quoteKey(x.column_name)}: ${tsType(x.udt_name)}${x.nullable ? ' | null' : ''}`)
  const insert = k.map((x) => {
    if (x.is_identity || x.is_generated) return `${quoteKey(x.column_name)}?: never`
    const optional = x.nullable || x.has_default
    return `${quoteKey(x.column_name)}${optional ? '?' : ''}: ${tsType(x.udt_name)}${x.nullable ? ' | null' : ''}`
  })
  const update = k.map((x) =>
    x.is_identity || x.is_generated
      ? `${quoteKey(x.column_name)}?: never`
      : `${quoteKey(x.column_name)}?: ${tsType(x.udt_name)}${x.nullable ? ' | null' : ''}`,
  )
  const rel = relations
    .filter((r) => r.table_name === name)
    .map(
      (r) =>
        `{\n            foreignKeyName: ${JSON.stringify(r.conname)}\n            columns: ${JSON.stringify(r.columns)}\n            isOneToOne: ${r.one_to_one}\n            referencedRelation: ${JSON.stringify(r.referenced_table)}\n            referencedColumns: ${JSON.stringify(r.referenced_columns)}\n          },`,
    )
  return `${quoteKey(name)}: {
        Row: ${objectBlock(row, 8)}
        Insert: ${objectBlock(insert, 8)}
        Update: ${objectBlock(update, 8)}
        Relationships: ${rel.length ? `[\n          ${rel.join('\n          ')}\n        ]` : '[]'}
      }`
}

function viewBlock(name) {
  const k = columns.filter((x) => x.table_name === name)
  const row = k.map((x) => `${quoteKey(x.column_name)}: ${tsType(x.udt_name)} | null`)
  return `${quoteKey(name)}: {
        Row: ${objectBlock(row, 8)}
        Relationships: []
      }`
}

function functionBlock(f) {
  const inputs = []
  const outputs = []
  f.arg_types.forEach((type, i) => {
    const mode = f.arg_modes[i] ?? 'i'
    const name = f.arg_names[i]
    if (mode === 'i' || mode === 'b') inputs.push({ name, type })
    if (mode === 't' || mode === 'o' || mode === 'b') outputs.push({ name, type })
  })
  const firstDefault = inputs.length - f.pronargdefaults
  const args = inputs.map((a, i) => `${quoteKey(a.name)}${i >= firstDefault ? '?' : ''}: ${tsType(a.type)}`)
  let result
  if (f.proretset && outputs.length) {
    result = `{\n${outputs.map((o) => `            ${quoteKey(o.name)}: ${tsType(o.type)} | null`).join('\n')}\n          }[]`
  } else if (f.return_type === 'void') {
    result = 'undefined'
  } else {
    result = tsType(f.return_type)
  }
  return `${quoteKey(f.proname)}: {
        Args: ${args.length ? objectBlock(args, 8) : 'Record<PropertyKey, never>'}
        Returns: ${result}
      }`
}

const tables = [...new Set(columns.filter((x) => x.table_type === 'BASE TABLE').map((x) => x.table_name))]
const views = [...new Set(columns.filter((x) => x.table_type === 'VIEW').map((x) => x.table_name))]

const content = `// File ini dibuat oleh \`npm run gen:types\` dari supabase/migrations. Jangan diedit langsung.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      ${tables.map(tableBlock).join('\n      ')}
    }
    Views: {
      ${views.map(viewBlock).join('\n      ')}
    }
    Functions: {
      ${functions.map(functionBlock).join('\n      ')}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicTables = Database['public']['Tables']
export type TableRow<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TableInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TableUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
`

writeFileSync(TARGET, content)
console.log(`Tipe ditulis: ${tables.length} tabel, ${views.length} view, ${functions.length} fungsi -> src/lib/database.types.ts`)
