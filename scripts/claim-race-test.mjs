#!/usr/bin/env node
/**
 * Claim race test: two verified NGOs claim the same donation from two independent database
 * connections at the same time. Exactly one must win; the other must receive a conflict.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:race
 *
 * Requires a local Supabase stack (auth schema + roles) or a dedicated development project.
 * Never run against production.
 */
import { Client } from 'pg'

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!url) {
  console.error(
    'Missing DATABASE_URL.\n' +
    'Start the local stack with `supabase start`, then run:\n' +
    '  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:race'
  )
  process.exit(1)
}
if (/prod|production/i.test(url)) {
  console.error('Refusing to run destructive race fixtures against what looks like production.')
  process.exit(1)
}

const IDS = {
  donor: 'race0000-0000-0000-0000-000000000001',
  ngo1: 'race0000-0000-0000-0000-000000000002',
  ngo2: 'race0000-0000-0000-0000-000000000003',
  orgDonor: 'race0000-0000-0000-0000-000000000011',
  orgNgo1: 'race0000-0000-0000-0000-000000000012',
  orgNgo2: 'race0000-0000-0000-0000-000000000013',
  donation: 'race0000-0000-0000-0000-000000000021',
}

// Spawn exactly two claims at the same instant. Return the outcome of each.
const claimAs = async (user, role) => {
  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    await c.query('begin')
    await c.query('set local role authenticated')
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role })])
    const r = await c.query('select claim_donation($1, false) as pickup', [IDS.donation])
    await c.query('commit')
    return { user, ok: true, pickup: r.rows[0].pickup }
  } catch (err) {
    await c.query('rollback').catch(() => {})
    return { user, ok: false, error: err.message }
  } finally {
    await c.end().catch(() => {})
  }
}

const admin = new Client({ connectionString: url })
let failures = 0
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

try {
  await admin.connect()

  // --- fixtures (as the database owner) ---
  await admin.query(`
    do $$
    declare ids uuid[] := array[
      'race0000-0000-0000-0000-000000000001','race0000-0000-0000-0000-000000000002',
      'race0000-0000-0000-0000-000000000003','race0000-0000-0000-0000-000000000011',
      'race0000-0000-0000-0000-000000000012','race0000-0000-0000-0000-000000000013'];
    begin
      perform set_config('app.internal','1',true);
      delete from pickups where donation_id = 'race0000-0000-0000-0000-000000000021';
      delete from donations where id = 'race0000-0000-0000-0000-000000000021';
      update profiles set organization_id = null where id = any(ids);
      delete from organizations where id = any(ids);
      delete from auth.users where id = any(ids);
    end $$;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      ('race0000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-race-donor@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"donor","full_name":"Race Donor"}'),
      ('race0000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-race-ngo1@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"ngo","full_name":"Race NGO One"}'),
      ('race0000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-race-ngo2@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"ngo","full_name":"Race NGO Two"}');

    insert into organizations (id, owner_id, name, org_type, city, verification_status) values
      ('race0000-0000-0000-0000-000000000011','race0000-0000-0000-0000-000000000001','Race Kitchen','restaurant','Ghaziabad','verified'),
      ('race0000-0000-0000-0000-000000000012','race0000-0000-0000-0000-000000000002','Race NGO One','ngo','Ghaziabad','verified'),
      ('race0000-0000-0000-0000-000000000013','race0000-0000-0000-0000-000000000003','Race NGO Two','ngo','Ghaziabad','verified');

    insert into donations (id, donor_id, organization_id, title, category, diet, quantity_portions,
      prepared_at, handling_info, area, city, available_from, pickup_deadline, safety_confirmed, status)
    values ('race0000-0000-0000-0000-000000000021','race0000-0000-0000-0000-000000000001',
      'race0000-0000-0000-0000-000000000011','Race-condition meal','cooked_meal','veg',30,
      now() - interval '30 minutes','Kept hot above 60C','Vaishali','Ghaziabad',
      now() - interval '5 minutes', now() + interval '2 hours', true, 'available');
  `)

  console.log('Firing two simultaneous claims from independent connections…\n')
  const results = await Promise.all([
    claimAs(IDS.ngo1, 'authenticated'),
    claimAs(IDS.ngo2, 'authenticated'),
  ])
  for (const r of results) console.log(`  ${r.user === IDS.ngo1 ? 'NGO 1' : 'NGO 2'}: ${r.ok ? 'CLAIMED' : `rejected — ${r.error}`}`)

  const winners = results.filter(r => r.ok)
  check(winners.length === 1, 'exactly one of the two concurrent claims succeeds')
  check(results.filter(r => !r.ok).length === 1, 'the losing claim fails with a conflict')

  const { rows } = await admin.query(
    `select count(*)::int as live from pickups where donation_id = $1 and status <> 'cancelled'`,
    [IDS.donation]
  )
  check(rows[0].live === 1, 'exactly one live pickup row exists')

  const donation = await admin.query('select status::text as s from donations where id = $1', [IDS.donation])
  check(donation.rows[0].s === 'reserved', 'donation is reserved exactly once')

  // --- cleanup ---
  await admin.query(`
    do $$
    declare ids uuid[] := array[
      'race0000-0000-0000-0000-000000000001','race0000-0000-0000-0000-000000000002',
      'race0000-0000-0000-0000-000000000003'];
    begin
      perform set_config('app.internal','1',true);
      delete from pickups where donation_id = 'race0000-0000-0000-0000-000000000021';
      delete from notifications where user_id = any(ids);
      delete from donations where id = 'race0000-0000-0000-0000-000000000021';
      update profiles set organization_id = null where id = any(ids);
      delete from organizations where id = any(ids);
      delete from auth.users where id = any(ids);
    end $$;
  `)

  if (failures > 0) {
    console.error(`\n❌ ${failures} race-check(s) failed`)
    process.exitCode = 1
  } else {
    console.log('\n✅ Atomic claim verified: concurrent claims cannot double-book a donation.')
  }
} catch (err) {
  console.error('\n❌ Race test could not run:', err.message)
  process.exitCode = 1
} finally {
  await admin.end().catch(() => {})
}
