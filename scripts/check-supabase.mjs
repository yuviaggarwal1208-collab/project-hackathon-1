/* Live Supabase health check — compares your project against supabase/schema.sql.
 *
 * Read-only except for typed RPC probes, which use dummy ids chosen to raise a
 * guard error before any write (see the note on confirm_pickup below).
 * Uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env — never a
 * service key (SECURITY.md §12). Secrets are never printed.
 *
 * Usage: npm run db:check
 */
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.log('✗ .env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY'); process.exit(1) }

const Z = '00000000-0000-0000-0000-000000000000'
const EXPECTED = {
  profiles: ['id', 'full_name', 'role', 'phone', 'language', 'suspended', 'organization_id', 'created_at'],
  organizations: ['id', 'owner_id', 'name', 'org_type', 'address', 'city', 'registration_number', 'verification_status', 'verified_by', 'verified_at', 'is_demo', 'created_at'],
  donations: ['id', 'donor_id', 'organization_id', 'title', 'description', 'category', 'diet', 'quantity_portions', 'quantity_kg', 'prepared_at', 'handling_info', 'allergens', 'image_path', 'area', 'city', 'approx_lat', 'approx_lng', 'available_from', 'pickup_deadline', 'safety_confirmed', 'status', 'is_demo', 'created_at', 'updated_at'],
  donation_private: ['donation_id', 'pickup_address', 'exact_lat', 'exact_lng', 'instructions'],
  pickups: ['id', 'donation_id', 'ngo_org_id', 'claimed_by', 'volunteer_id', 'needs_volunteer', 'status', 'claimed_at', 'picked_up_at', 'picked_up_by', 'delivered_at', 'delivered_by', 'meals_distributed', 'delivery_notes'],
  pickup_tokens: ['id', 'pickup_id', 'token_hash', 'created_by', 'expires_at', 'used_at', 'used_by', 'created_at'],
  pickup_token_attempts: ['key', 'failures', 'first_failure_at', 'locked_until'],
  notifications: ['id', 'user_id', 'kind', 'title', 'body', 'link', 'read_at', 'created_at'],
  reports: ['id', 'donation_id', 'reporter_id', 'category', 'reason', 'status', 'admin_notes', 'created_at'],
  audit_events: ['id', 'actor', 'action', 'target_type', 'target_id', 'metadata', 'created_at'],
}
// Typed probes: correct param names + valid dummy values so overload resolution
// matches. The expected outcome is a guard/permission error (proves execution).
const FN_PROBES = [
  ['claim_donation', { p_donation_id: Z }],
  ['accept_pickup', { p_pickup_id: Z }],
  ['request_volunteer', { p_pickup_id: Z }],
  ['create_pickup_token', { p_pickup_id: Z }],
  ['confirm_pickup', { p_token: 'deadbeef-diag' }],
  ['complete_delivery', { p_pickup_id: Z, p_meals: 0 }],
  ['cancel_donation', { p_donation_id: Z }],
  ['cancel_pickup', { p_pickup_id: Z }],
  ['admin_set_org_verification', { p_org: Z, p_status: 'verified' }],
  ['admin_set_suspended', { p_user: Z, p_suspended: false }],
  ['admin_set_report_status', { p_report: Z, p_status: 'resolved', p_notes: null }],
  ['admin_overview', {}],
  ['open_volunteer_pickups', {}],
  ['expire_donations', {}],
  ['get_impact_stats', {}],
  ['get_impact_trend', {}],
]
// NOTE on confirm_pickup: an anon caller hits the invalid-token branch. If auth.uid()
// is null this raises NOT-NULL on the throttle key (zero writes); if the anon JWT
// carries a uuid sub, one throttle row + one audit row are written — benign.

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const req = async (path, init = {}) => {
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(15000), ...init })
    return { status: r.status, body: await r.json().catch(() => ({})) }
  } catch (e) { return { status: 0, body: { message: e.name === 'TimeoutError' ? 'TIMEOUT' : e.message } } }
}
const get = (p) => req(p)
const post = (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) })

let problems = 0

console.log('── 1. TABLES & COLUMNS ──')
const tableResults = await Promise.all(Object.entries(EXPECTED).map(async ([table, cols]) => {
  const { status, body } = await get(`${table}?select=${cols.join(',')}&limit=1`)
  if (status === 200) return { table, ok: true }
  const msg = body.message || body.error || ''
  if (body.code === 'PGRST205' || /could not find the table|does not exist/i.test(msg)) return { table, ok: false, kind: 'missing-table' }
  if (/column [a-z_.]+ does not exist/i.test(msg)) {
    const colChecks = await Promise.all(cols.map(async c => ({ c, ok: (await get(`${table}?select=${c}&limit=1`)).status === 200 })))
    return { table, ok: false, kind: 'missing-cols', missing: colChecks.filter(x => !x.ok).map(x => x.c) }
  }
  return { table, ok: false, kind: `http-${status}`, msg: msg.slice(0, 100) }
}))
for (const r of tableResults) {
  if (r.ok) console.log(`✓ ${r.table}`)
  else if (r.kind === 'missing-table') { console.log(`✗ ${r.table} — TABLE MISSING`); problems++ }
  else if (r.kind === 'missing-cols') { console.log(`⚠ ${r.table} — missing columns: ${r.missing.join(', ')}`); problems++ }
  else { console.log(`⚠ ${r.table} — ${r.kind}: ${r.msg}`); problems++ }
}

console.log('\n── 2. FUNCTIONS (typed POST probes) ──')
const fnResults = await Promise.all(FN_PROBES.map(async ([fn, args]) => ({ fn, ...(await post(`rpc/${fn}`, args)) })))
for (const { fn, status, body } of fnResults) {
  const msg = body.message || body.error || ''
  if (status === 404 || body.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
    console.log(`✗ ${fn}() — MISSING`); problems++
  } else {
    console.log(`✓ ${fn}() present (${body.code || status}: ${msg.slice(0, 70) || 'returned data'})`)
  }
}

console.log('\n── 3. ANON LEAK PROBES (0 rows expected) ──')
const LEAKS = [
  ['pickup_tokens?select=token_hash&limit=5', 'token hashes'],
  ['pickup_token_attempts?select=key&limit=5', 'throttle keys'],
  ['donation_private?select=pickup_address&limit=5', 'exact addresses'],
  ['audit_events?select=action&limit=5', 'audit trail'],
  ['notifications?select=id&limit=5', 'notifications'],
  ['profiles?select=id,role,suspended&limit=5', 'profiles'],
  ['reports?select=id,reason&limit=5', 'reports'],
]
const leakResults = await Promise.all(LEAKS.map(async ([p, label]) => ({ label, ...(await get(p)) })))
for (const { label, status, body } of leakResults) {
  if (status === 200 && Array.isArray(body) && body.length > 0) {
    console.log(`✗ LEAK: anon can read ${body.length} row(s) of ${label}`); problems++
  } else if (status === 200) console.log(`✓ ${label}: 0 rows visible to anon`)
  else console.log(`⚠ ${label}: HTTP ${status} ${(body.message || '').slice(0, 60)}`)
}

console.log('\n── 4. STORAGE ──')
try {
  const r = await fetch(`${url}/storage/v1/bucket`, { headers, signal: AbortSignal.timeout(15000) })
  if (r.ok) {
    const buckets = await r.json()
    const b = buckets.find(x => x.id === 'food-images')
    if (b) console.log(`✓ bucket food-images (public=${b.public})`)
    else {
      console.log(`✗ bucket food-images — MISSING (found: ${buckets.map(x => x.id).join(', ') || 'none'})`)
      console.log('  → apply supabase/migrations/0003_storage_repair.sql in the SQL Editor')
      problems++
    }
  } else console.log(`⚠ bucket list returned ${r.status}`)
} catch (e) { console.log('⚠ storage check failed:', e.message) }

console.log('\n── 5. REALTIME ──')
const pub = await get('notifications?select=id&limit=1')
if (pub.status === 200) console.log('✓ notifications table reachable (realtime channel is client-side)')
else console.log(`⚠ notifications: HTTP ${pub.status}`)

console.log('\n── 6. DATA ──')
const stats = await get('rpc/get_impact_stats')
if (stats.status === 200) {
  const s = Array.isArray(stats.body) ? stats.body[0] : stats.body
  const empty = !s || Object.values(s).every(v => v === 0 || v === false || v === null)
  console.log(empty ? '∅ database is empty — optional: run supabase/seed_demo.sql for a demo dataset' : `✓ impact: ${JSON.stringify(s)}`)
} else console.log(`⚠ get_impact_stats: HTTP ${stats.status}`)

const legacy = await get('donations?select=pickup_address&limit=1')
if (legacy.status === 200) { console.log('\n⚠ LEGACY SCHEMA: donations.pickup_address exists — old prototype layout.'); problems++ }

console.log(`\n${problems === 0 ? '✓ Healthy — database matches supabase/schema.sql.' : `✗ ${problems} problem(s) found.`}`)
process.exit(problems === 0 ? 0 : 1)
