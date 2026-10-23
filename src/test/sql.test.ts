import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// libpg_query WASM build; the package's ESM entry is broken (directory import), so use CJS.
const requireCjs = createRequire(import.meta.url)
const { parse } = requireCjs('@pgsql/parser/v17') as {
  parse: (sql: string) => Promise<{ stmts: unknown[] }>
}

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const schema: string = read('supabase/schema.sql')
const makeAdmin: string = read('supabase/make_admin.sql')

describe('SQL syntax (libpg_query)', () => {
  const files = [
    'supabase/schema.sql',
    'supabase/seed_demo.sql',
    'supabase/make_admin.sql',
    'supabase/tests/workflow_and_rls.test.sql',
    ...readdirSync(join(process.cwd(), 'supabase/migrations')).filter((f: string) => f.endsWith('.sql')).map((f: string) => `supabase/migrations/${f}`),
  ]

  it('has at least one versioned migration', () => {
    expect(files.filter(f => f.includes('/migrations/')).length).toBeGreaterThanOrEqual(2)
  })

  for (const f of files) {
    it(`${f} parses without syntax errors`, async () => {
      const r = await parse(read(f))
      expect(r.stmts.length).toBeGreaterThan(0)
    })
  }
})

describe('schema security invariants (SECURITY.md §6, §14)', () => {
  const TABLES = ['profiles', 'organizations', 'donations', 'donation_private', 'pickups',
    'pickup_tokens', 'pickup_token_attempts', 'notifications', 'reports', 'audit_events']

  it.each(TABLES)('enables row level security on %s', t => {
    expect(schema).toMatch(new RegExp(`alter table ${t} enable row level security`))
  })

  it('never uses a broad USING (true) policy on private tables', () => {
    const privSection = schema.slice(schema.indexOf('donation_private') - 2000)
    expect(privSection).not.toMatch(/using\s*\(\s*true\s*\)/i)
  })

  it('defines no client policy on pickup_tokens or pickup_token_attempts', () => {
    for (const t of ['pickup_tokens', 'pickup_token_attempts']) {
      const policyLines: string[] = schema.split('\n').filter((l: string) => /^create policy/i.test(l.trim()))
      expect(policyLines.some((l: string) => l.includes(` on ${t} `))).toBe(false)
    }
  })

  it('self-registration can never produce an admin (handle_new_user falls back to donor)', () => {
    const fn = schema.slice(schema.indexOf('handle_new_user'), schema.indexOf('on_auth_user_created'))
    expect(fn).toMatch(/when 'ngo' then 'ngo'::user_role/)
    expect(fn).toMatch(/when 'volunteer' then 'volunteer'::user_role/)
    expect(fn).not.toMatch(/when 'admin'/)  // 'admin' metadata must fall through to the donor default
  })

  it('stores only token hashes (digest), never plaintext tokens', () => {
    expect(schema).toContain("encode(digest(raw,'sha256'),'hex')")
    expect(schema).toContain("encode(digest(p_token,'sha256'),'hex')")
  })

  it('expires pickup tokens after 15 minutes and consumes them atomically', () => {
    expect(schema).toMatch(/now\(\) \+ interval '15 minutes'/)
    expect(schema).toMatch(/update pickup_tokens set used_at = now\(\), used_by = auth\.uid\(\) where id = t\.id/)
  })

  it('rate-limits failed pickup-code attempts', () => {
    expect(schema).toContain('pickup_token_attempts')
    expect(schema).toMatch(/too many failed attempts/)
  })

  it('guards protected columns with triggers (role, status, verification)', () => {
    expect(schema).toContain('protected profile fields cannot be changed directly')
    expect(schema).toContain('verification fields can only be changed by an administrator')
    expect(schema).toContain('donation status and ownership change only through workflow functions')
  })

  it('enforces claim atomicity with a conditional update and a one-live-pickup index', () => {
    expect(schema).toMatch(/update donations set status = 'reserved'\s+where id = p_donation_id and status = 'available' and pickup_deadline > now\(\)/)
    expect(schema).toContain('pickups_one_live_idx')
  })

  it('re-checks deadline at claim time even if the expiry job has not run', () => {
    const claim = schema.slice(schema.indexOf('claim_donation'), schema.indexOf('accept_pickup'))
    expect(claim).toContain('pickup_deadline > now()')
  })

  it('re-checks suspension inside privileged workflow functions', () => {
    for (const fn of ['confirm_pickup', 'complete_delivery', 'create_pickup_token']) {
      const start = schema.indexOf(`function ${fn}`)
      const body = schema.slice(start, start + 2500)
      expect(body, `${fn} must reject suspended accounts`).toMatch(/suspended/)
    }
  })

  it('blocks claims when the donor is suspended', () => {
    const claim = schema.slice(schema.indexOf('claim_donation'), schema.indexOf('accept_pickup'))
    expect(claim).toMatch(/profiles where id = d\.donor_id and suspended/)
  })

  it('keeps the exact address in a separate private table', () => {
    expect(schema).toContain('create table donation_private')
    expect(schema).toContain('pickup_address text not null')
    // the public donations table must not carry a street-address column (comments stripped)
    const donationsBlock = schema
      .slice(schema.indexOf('create table donations'), schema.indexOf('create table donation_private'))
      .replace(/--.*$/gm, '')
    expect(donationsBlock).not.toMatch(/address/)
  })

  it('writes an audit event for every sensitive admin and workflow operation', () => {
    for (const action of ['organization.verification', 'account.suspended', 'account.restored',
      'donation.claimed', 'pickup.confirmed', 'pickup.delivered', 'report.resolution', 'admin.provisioned']) {
      expect(schema + makeAdmin, `missing audit action ${action}`).toContain(action)
    }
  })

  it('restricts admin functions to admins inside the function body', () => {
    for (const fn of ['admin_set_org_verification', 'admin_set_suspended', 'admin_set_report_status', 'admin_overview']) {
      const start = schema.indexOf(`function ${fn}`)
      const body = schema.slice(start, start + 1600)
      expect(body, `${fn} must check the admin role`).toMatch(/current_role_is\('admin'\)/)
    }
  })

  it('admin suspension cannot target admins or the acting admin', () => {
    const fn = schema.slice(schema.indexOf('function admin_set_suspended'), schema.indexOf('function admin_set_report_status'))
    expect(fn).toContain("role <> 'admin'")
    expect(fn).toContain('p_user = auth.uid()')
  })

  it('grants workflow functions only to authenticated, never to anon or public', () => {
    const grants: string[] = schema.split('\n').filter((l: string) => l.trim().startsWith('grant execute'))
    const privileged = ['claim_donation', 'confirm_pickup', 'create_pickup_token', 'complete_delivery',
      'admin_set_org_verification', 'admin_set_suspended', 'admin_set_report_status', 'admin_overview']
    for (const fn of privileged) {
      const grantLines = grants.filter((l: string) => l.includes(`${fn}(`))
      for (const l of grantLines) {
        expect(l, `${fn} granted too widely: ${l}`).not.toMatch(/\banon\b/)
        expect(l, `${fn} granted too widely: ${l}`).not.toMatch(/\bto\s+public\b/)
      }
    }
  })

  it('keeps expire_donations and audit ungranted to clients', () => {
    const grants: string[] = schema.split('\n').filter((l: string) => l.trim().startsWith('grant execute'))
    expect(grants.some((l: string) => l.includes('expire_donations'))).toBe(false)
    expect(grants.some((l: string) => /(^|[^_])audit\(/.test(l))).toBe(false)
  })

  it('excludes demo data from impact statistics by default', () => {
    expect(schema).toMatch(/get_impact_stats\(p_include_demo boolean default false\)/)
    expect(schema).toMatch(/p_include_demo or not d\.is_demo/)
  })

  it('scopes storage uploads to the owner folder with an image-extension allowlist', () => {
    expect(schema).toMatch(/food_images_upload[\s\S]*?auth\.uid\(\)::text[\s\S]*?jpg\|jpeg\|png\|webp/)
  })

  it('never grants anything to the service_role from client SQL', () => {
    expect(schema).not.toMatch(/service_role/)
  })

  it('make_admin.sql records an audit event (accountable provisioning)', () => {
    expect(makeAdmin).toContain('admin.provisioned')
    expect(makeAdmin).toMatch(/No user found with that email/)
  })
})
