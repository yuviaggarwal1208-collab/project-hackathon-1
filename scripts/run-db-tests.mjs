#!/usr/bin/env node
/**
 * Runs supabase/tests/workflow_and_rls.test.sql against a throwaway Supabase database.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:db
 *
 * Get the URL from `supabase start` / `supabase status -o env` (local stack) or from a
 * dedicated development project. NEVER run this against production: it creates and deletes
 * test accounts and donation records.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL_POOLER
if (!url) {
  console.error(
    'Missing DATABASE_URL.\n' +
    'Start the local stack with `supabase start`, then run:\n' +
    '  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:db\n' +
    'See supabase/tests/README.md.'
  )
  process.exit(1)
}
if (/prod|production/i.test(url)) {
  console.error('Refusing to run destructive test fixtures against what looks like production.')
  process.exit(1)
}

const sql = readFileSync(new URL('../supabase/tests/workflow_and_rls.test.sql', import.meta.url), 'utf8')
const client = new Client({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined })

try {
  await client.connect()
  console.log('Connected. Running RLS / workflow / token test suite…\n')
  await client.query(sql)
  console.log('\n✅ All database assertions passed (RLS, claims, tokens, state machine, impact).')
} catch (err) {
  console.error('\n❌ Database test failed:\n', err.message)
  if (err.position) console.error(`   at SQL character ${err.position}`)
  if (err.detail) console.error('   detail:', err.detail)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
