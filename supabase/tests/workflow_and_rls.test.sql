-- RescuePlate database test suite: RLS, authorization, claim atomicity, tokens, state machine.
--
-- Run with:  npm run test:db        (requires DATABASE_URL, see supabase/tests/README.md)
-- Never point this at production: it creates and deletes test accounts.
--
-- The script is self-asserting: every check raises an exception on failure, so a clean run
-- exits 0 and any failure aborts with "ASSERT FAILED: ...".
--
-- It runs as the database owner but simulates real clients by switching to the `anon` /
-- `authenticated` roles with `request.jwt.claims`, exactly like PostgREST does.

-- ---------- helpers ----------
create schema if not exists rp_test;
grant usage on schema rp_test to public;

create or replace function rp_test.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

create or replace function rp_test.expect_error(stmt text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'ASSERT FAILED (expected an error, none raised): %', msg;
end $$;

create or replace function rp_test.expect_error_matching(stmt text, pattern text, msg text) returns void
language plpgsql as $$
declare err text;
begin
  begin
    execute stmt;
  exception when others then
    err := sqlerrm;
    if err ~* pattern then return; end if;
    raise exception 'ASSERT FAILED: % (error "%" does not match /%/i)', msg, err, pattern;
  end;
  raise exception 'ASSERT FAILED (expected an error, none raised): %', msg;
end $$;

create or replace function rp_test.expect_count(stmt text, expected bigint, msg text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || stmt || ') q' into n;
  if n <> expected then
    raise exception 'ASSERT FAILED: % (expected %, got %)', msg, expected, n;
  end if;
end $$;

create or replace function rp_test.expect_value(stmt text, expected text, msg text) returns void
language plpgsql as $$
declare v text;
begin
  execute stmt into v;
  if v is distinct from expected then
    raise exception 'ASSERT FAILED: % (expected %, got %)', msg, expected, v;
  end if;
end $$;

-- Simulate a PostgREST request identity.
create or replace function rp_test.login(uid uuid, role_name text default 'authenticated') returns void
language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', role_name)::text, false)
$$;

grant execute on all functions in schema rp_test to public;

-- ---------- stable test identities ----------
-- donor_a  1111  donor org verified
-- donor_b  2222  donor org verified
-- ngo_ok   3333  NGO org verified
-- ngo_pend 4444  NGO org pending
-- ngo_two  5555  NGO org verified
-- vol_ok   6666  volunteer
-- vol_other 7777 volunteer
-- admin    8888  admin (provisioned server-side, never via registration)
-- rogue    9999  signs up with metadata role=admin

-- ---------- clean previous runs ----------
do $$
declare ids uuid[] := array['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
  '99999999-9999-9999-9999-999999999999'];
begin
  perform set_config('app.internal','1',true);
  delete from audit_events where actor = any(ids) or target_id = any(ids::text[]);
  delete from notifications where user_id = any(ids);
  delete from pickup_tokens where pickup_id in (select id from pickups where claimed_by = any(ids));
  delete from pickups where claimed_by = any(ids) or ngo_org_id in (select id from organizations where owner_id = any(ids));
  delete from reports where reporter_id = any(ids) or donation_id in (select id from donations where donor_id = any(ids));
  delete from donations where donor_id = any(ids);
  update profiles set organization_id = null where id = any(ids);
  delete from organizations where owner_id = any(ids);
  delete from auth.users where id = any(ids);
  delete from pickup_token_attempts;
end $$;

-- ---------- fixtures ----------
-- Real auth users trigger handle_new_user(), which creates profiles.
-- Note the last row attempts to self-assign admin through sign-up metadata.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-donor-a@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"donor","full_name":"Test Donor A"}'),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-donor-b@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"donor","full_name":"Test Donor B"}'),
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-ngo-ok@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"ngo","full_name":"Test Verified NGO"}'),
 ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-ngo-pending@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"ngo","full_name":"Test Pending NGO"}'),
 ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-ngo-two@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"ngo","full_name":"Test Second NGO"}'),
 ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-vol-ok@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"volunteer","full_name":"Test Volunteer"}'),
 ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-vol-other@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"volunteer","full_name":"Test Other Volunteer"}'),
 ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-admin@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin","full_name":"Test Admin"}'),
 ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rp-test-rogue@example.invalid', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin","full_name":"Rogue Signup"}');

-- Test 1: public registration can never create an admin.
select rp_test.expect_value(
  $$select role::text from profiles where id = '99999999-9999-9999-9999-999999999999'$$,
  'donor', 'sign-up metadata role=admin must fall back to donor');

select rp_test.expect_value(
  $$select role::text from profiles where id = '33333333-3333-3333-3333-333333333333'$$,
  'ngo', 'requested NGO role is honoured');

-- Admin authority is provisioned by a trusted operator only (mirrors make_admin.sql).
do $$
begin
  perform set_config('app.internal','1',true);
  update profiles set role = 'admin' where id = '88888888-8888-8888-8888-888888888888';
end $$;

insert into organizations (id, owner_id, name, org_type, city, verification_status) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Test Verified Kitchen','restaurant','Ghaziabad','verified'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Test Verified Bakery','bakery','Ghaziabad','verified'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','Test Verified NGO','ngo','Ghaziabad','verified'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','44444444-4444-4444-4444-444444444444','Test Pending NGO','ngo','Ghaziabad','pending'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','55555555-5555-5555-5555-555555555555','Test Second NGO','ngo','Ghaziabad','verified');

insert into donations (id, donor_id, organization_id, title, category, diet, quantity_portions,
  prepared_at, handling_info, area, city, available_from, pickup_deadline, safety_confirmed, status, is_demo)
values
 -- live listing for claim tests
 ('d0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Test surplus meal','cooked_meal','veg',20, now() - interval '1 hour','Kept above 60C','Vaishali','Ghaziabad',
  now() - interval '10 minutes', now() + interval '3 hours', true, 'available', false),
 -- status says available but the deadline has passed: must NOT be claimable
 ('d0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Expired window listing','cooked_meal','veg',10, now() - interval '5 hours','Refrigerated','Vaishali','Ghaziabad',
  now() - interval '4 hours', now() - interval '1 hour', true, 'available', false),
 -- donor B's private listing, used for cross-donor access checks
 ('d0000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Donor B bread boxes','bakery','veg',15, now() - interval '2 hours','Dry storage','Indirapuram','Ghaziabad',
  now() - interval '10 minutes', now() + interval '2 hours', true, 'available', false),
 -- demo delivered donation for impact aggregation tests
 ('d0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Demo delivered meal','cooked_meal','veg',100, now() - interval '6 hours','Hot-held','Vaishali','Ghaziabad',
  now() - interval '5 hours', now() + interval '2 hours', true, 'delivered', true);

insert into donation_private (donation_id, pickup_address, exact_lat, exact_lng, instructions) values
 ('d0000000-0000-0000-0000-000000000001','Block 12, Shop 3, Vaishali Sector 4, Ghaziabad', 28.6412, 77.3421, 'Ring the service bell twice'),
 ('d0000000-0000-0000-0000-000000000003','House 44, Indirapuram, Ghaziabad', 28.6321, 77.3711, null),
 ('d0000000-0000-0000-0000-000000000004','Demo address', 28.64, 77.34, null);

insert into pickups (id, donation_id, ngo_org_id, claimed_by, status, picked_up_at, delivered_at, delivered_by, meals_distributed)
values ('p0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004',
        'cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','delivered',
        now() - interval '5 hours', now() - interval '4 hours','33333333-3333-3333-3333-333333333333', 50);

-- ============================================================
-- 2. Anonymous access
-- ============================================================
set role anon;
select rp_test.login(null, 'anon');

select rp_test.expect_count($$select * from donation_private$$, 0, 'anon must not read private addresses');
select rp_test.expect_count($$select * from pickups$$, 0, 'anon must not read pickups');
select rp_test.expect_count($$select * from pickup_tokens$$, 0, 'anon must not read pickup tokens');
select rp_test.expect_count($$select * from notifications$$, 0, 'anon must not read notifications');
select rp_test.expect_count($$select * from reports$$, 0, 'anon must not read reports');
select rp_test.expect_count($$select * from audit_events$$, 0, 'anon must not read the audit trail');
select rp_test.expect_error($$select claim_donation('d0000000-0000-0000-0000-000000000001', false)$$,
  'anon must not claim donations');

-- public browse: only available AND unexpired rows
select rp_test.expect_count(
  $$select * from donations where id in ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003')$$,
  2, 'anon sees live available listings');
select rp_test.expect_count(
  $$select * from donations where id = 'd0000000-0000-0000-0000-000000000002'$$,
  0, 'anon must not see an expired-window listing even if status is available');
select rp_test.expect_count(
  $$select * from donations where id = 'd0000000-0000-0000-0000-000000000004'$$,
  0, 'anon must not see delivered/demo rows');

-- ============================================================
-- 3. Donor isolation and protected fields
-- ============================================================
reset role;
set role authenticated;
select rp_test.login('11111111-1111-1111-1111-111111111111');

select rp_test.expect_count(
  $$select * from donations where id = 'd0000000-0000-0000-0000-000000000003'$$,
  0, 'donor A must not read donor B listing');
select rp_test.expect_count(
  $$select * from donation_private where donation_id = 'd0000000-0000-0000-0000-000000000003'$$,
  0, 'donor A must not read donor B private address');

-- UPDATE on another donor's row affects 0 rows (RLS), never throws
update donations set title = 'hijacked' where id = 'd0000000-0000-0000-0000-000000000003';
select rp_test.expect_value(
  $$select title from donations where id = 'd0000000-0000-0000-0000-000000000003'$$,
  null, 'donor A update on donor B row must not be visible/effective');

-- cannot grant itself admin, unsuspend itself, or move to another organization
select rp_test.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$,
  'user must not change own role');
select rp_test.expect_error($$update profiles set suspended = true where id = auth.uid()$$,
  'user must not change own suspension state');

-- cannot bypass the state machine by writing status directly
select rp_test.expect_error(
  $$update donations set status = 'delivered' where id = 'd0000000-0000-0000-0000-000000000001'$$,
  'client must not set donation status directly');

-- ============================================================
-- 4. Claim authorization and atomic single-claim invariant
-- ============================================================
reset role;
set role authenticated;

-- unverified NGO
select rp_test.login('44444444-4444-4444-4444-444444444444');
select rp_test.expect_error_matching(
  $$select claim_donation('d0000000-0000-0000-0000-000000000001', false)$$,
  'verified NGO', 'unverified NGO must not claim');

-- verified NGO cannot claim a listing whose deadline passed
select rp_test.login('33333333-3333-3333-3333-333333333333');
select rp_test.expect_error_matching(
  $$select claim_donation('d0000000-0000-0000-0000-000000000002', false)$$,
  'no longer available', 'expired listing must not be claimable at claim time');

-- verified NGO claims successfully
select claim_donation('d0000000-0000-0000-0000-000000000001', false);

-- a second, also-verified NGO cannot claim the same donation
select rp_test.login('55555555-5555-5555-5555-555555555555');
select rp_test.expect_error_matching(
  $$select claim_donation('d0000000-0000-0000-0000-000000000001', false)$$,
  'no longer available', 'second claim must fail');

reset role;
select rp_test.expect_count(
  $$select * from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001' and status <> 'cancelled'$$,
  1, 'exactly one live pickup may exist per donation');
select rp_test.expect_value(
  $$select status::text from donations where id = 'd0000000-0000-0000-0000-000000000001'$$,
  'reserved', 'donation moves to reserved on claim');
select rp_test.expect_count(
  $$select * from notifications where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'claim'$$,
  1, 'donor is notified of the claim');
select rp_test.ok(
  exists (select 1 from audit_events where action = 'donation.claimed' and target_id = 'd0000000-0000-0000-0000-000000000001'),
  'claim is audited');

-- suspension stops an otherwise-valid NGO
do $$ begin perform set_config('app.internal','1',true);
  update profiles set suspended = true where id = '55555555-5555-5555-5555-555555555555'; end $$;
set role authenticated;
select rp_test.login('55555555-5555-5555-5555-555555555555');
select rp_test.expect_error($$select claim_donation('d0000000-0000-0000-0000-000000000003', false)$$,
  'suspended NGO must not claim');
reset role;
do $$ begin perform set_config('app.internal','1',true);
  update profiles set suspended = false where id = '55555555-5555-5555-5555-555555555555'; end $$;

-- ============================================================
-- 5. Private address access and volunteer assignment
-- ============================================================
set role authenticated;
select rp_test.login('77777777-7777-7777-7777-777777777777'); -- not assigned
select rp_test.expect_count(
  $$select * from donation_private where donation_id = 'd0000000-0000-0000-0000-000000000001'$$,
  0, 'unassigned volunteer must not read the pickup address');

select rp_test.login('33333333-3333-3333-3333-333333333333'); -- NGO asks for a volunteer
do $$
declare pid uuid;
begin
  select id into pid from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001' and status = 'reserved';
  perform request_volunteer(pid);
end $$;

select rp_test.login('77777777-7777-7777-7777-777777777777');
select rp_test.expect_count($$select * from open_volunteer_pickups()$$, 1,
  'open assignment is visible without private data');

select rp_test.login('66666666-6666-6666-6666-666666666666'); -- accept
do $$
declare pid uuid;
begin
  select id into pid from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001' and status = 'reserved';
  perform accept_pickup(pid);
end $$;
select rp_test.expect_count(
  $$select * from donation_private where donation_id = 'd0000000-0000-0000-0000-000000000001'$$,
  1, 'assigned volunteer may read the pickup address');
select rp_test.expect_count(
  $$select * from donation_private where donation_id = 'd0000000-0000-0000-0000-000000000003'$$,
  0, 'assigned volunteer must not read unrelated addresses');

-- unassigned volunteer still cannot confirm someone else's pickup
select rp_test.login('77777777-7777-7777-7777-777777777777');
select rp_test.expect_error_matching(
  $$select complete_delivery((select id from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001'), 5)$$,
  'not authorized|not awaiting', 'unassigned volunteer must not complete delivery');

-- ============================================================
-- 6. Pickup token: hashed, single-use, verified server-side
-- ============================================================
reset role;
set role authenticated;
select rp_test.login('11111111-1111-1111-1111-111111111111'); -- donor generates the code
do $$
declare pid uuid; raw text;
begin
  select id into pid from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001' and status = 'reserved';
  raw := create_pickup_token(pid);
  perform set_config('test.token', raw, false);
end $$;

reset role;
select rp_test.ok(
  not exists (select 1 from pickup_tokens where token_hash = current_setting('test.token')),
  'raw pickup token must never be stored');
select rp_test.expect_value(
  $$select length(token_hash)::text from pickup_tokens order by created_at desc limit 1$$,
  '64', 'token is stored as a sha256 hash');
select rp_test.ok(
  exists (select 1 from pickup_tokens where expires_at between now() + interval '14 minutes' and now() + interval '16 minutes'),
  'token expires after ~15 minutes');

-- a bad code returns a generic null and is recorded (no exception, so the counter persists)
set role authenticated;
select rp_test.login('66666666-6666-6666-6666-666666666666');
select rp_test.expect_value(
  $$select confirm_pickup('definitely-the-wrong-code')::text$$, null,
  'invalid code returns a generic failure');
reset role;
select rp_test.expect_count($$select * from pickup_token_attempts$$, 1,
  'failed attempt is persisted for throttling');
set role authenticated;

-- only the assigned collector may consume it
select rp_test.login('33333333-3333-3333-3333-333333333333'); -- claiming NGO, not assigned collector
select rp_test.expect_error_matching(
  $$select confirm_pickup(current_setting('test.token'))$$,
  'assigned collector', 'claiming NGO is not the assigned collector');

-- the assigned volunteer consumes it once
select rp_test.login('66666666-6666-6666-6666-666666666666');
select confirm_pickup(current_setting('test.token'));
select rp_test.expect_value(
  $$select confirm_pickup(current_setting('test.token'))::text$$, null,
  'a consumed token must not be reusable');
reset role;
select rp_test.expect_value(
  $$select status::text from donations where id = 'd0000000-0000-0000-0000-000000000001'$$,
  'picked_up', 'pickup confirmation advances the donation');
select rp_test.ok(
  exists (select 1 from audit_events where action = 'pickup.confirmed'),
  'pickup confirmation is audited');

-- delivery is recorded by the collector, and meals are reported separately
set role authenticated;
select rp_test.login('66666666-6666-6666-6666-666666666666');
select complete_delivery(
  (select id from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001'), 18,
  'Handed to the shelter kitchen');
reset role;
select rp_test.expect_value(
  $$select status::text from donations where id = 'd0000000-0000-0000-0000-000000000001'$$,
  'delivered', 'delivery completes the donation');
select rp_test.expect_value(
  $$select meals_distributed::text from pickups where donation_id = 'd0000000-0000-0000-0000-000000000001'$$,
  '18', 'reported meals are stored on the pickup');

-- ============================================================
-- 7. Token guess throttling
-- ============================================================
set role authenticated;
select rp_test.login('55555555-5555-5555-5555-555555555555');
do $$
declare i int;
begin
  for i in 1..10 loop
    begin
      perform confirm_pickup('definitely-not-a-real-token-' || i);
    exception when others then null;
    end;
  end loop;
end $$;
select rp_test.expect_error_matching(
  $$select confirm_pickup('anything')$$, 'too many failed attempts',
  'repeated bad guesses lock the caller out');
reset role;
delete from pickup_token_attempts;

-- ============================================================
-- 8. Notifications and reports isolation
-- ============================================================
set role authenticated;
select rp_test.login('22222222-2222-2222-2222-222222222222'); -- donor B
select rp_test.expect_count($$select * from notifications where user_id = '11111111-1111-1111-1111-111111111111'$$,
  0, 'users must not read other users notifications');
update notifications set read_at = now() where user_id = '11111111-1111-1111-1111-111111111111';
select rp_test.expect_count(
  $$select * from notifications where user_id = '11111111-1111-1111-1111-111111111111' and read_at is not null$$,
  0, 'users must not mark other users notifications read');

insert into reports (donation_id, reporter_id, category, reason)
values ('d0000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','unsafe_food',
        'Food felt warm at collection, please check the cold chain.');
select rp_test.expect_count($$select * from reports$$, 1, 'reporter can read own report');

select rp_test.login('11111111-1111-1111-1111-111111111111');
select rp_test.expect_count($$select * from reports$$, 0, 'unrelated user must not read reports');
select rp_test.expect_error($$select admin_set_report_status((select id from reports limit 1), 'resolved')$$,
  'non-admin must not resolve reports');

-- direct status edits are blocked even for admins (must use the audited function)
select rp_test.login('88888888-8888-8888-8888-888888888888');
select rp_test.expect_count($$select * from reports$$, 1, 'admin can read reports');
do $$
declare rid uuid; before_status text;
begin
  select id, status into rid, before_status from reports limit 1;
  update reports set status = 'resolved' where id = rid;
  if exists (select 1 from reports where id = rid and status = 'resolved') then
    raise exception 'ASSERT FAILED: direct report status update must be denied by RLS';
  end if;
  perform admin_set_report_status(rid, 'resolved', 'Checked cold-chain log with donor.');
end $$;
reset role;
select rp_test.expect_value(
  $$select status from reports limit 1$$, 'resolved', 'audited admin function resolves the report');
select rp_test.ok(
  exists (select 1 from audit_events where action = 'report.resolution'),
  'report resolution is audited');

-- ============================================================
-- 9. Impact aggregation: collected vs distributed, demo excluded
-- ============================================================
select rp_test.expect_value(
  $$select (get_impact_stats(false)->>'meals_distributed')::text$$, '18',
  'real reported meals exclude the demo pickup');
select rp_test.expect_value(
  $$select (get_impact_stats(true)->>'meals_distributed')::text$$, '68',
  'demo-inclusive metrics add the labelled demo pickup');
select rp_test.expect_value(
  $$select (get_impact_stats(false)->>'portions_collected')::text$$, '20',
  'portions counted once from the real delivered donation');

-- ============================================================
-- 10. Cleanup
-- ============================================================
do $$
declare ids uuid[] := array['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
  '99999999-9999-9999-9999-999999999999'];
begin
  perform set_config('app.internal','1',true);
  delete from audit_events where actor = any(ids) or target_id = any(ids::text[]);
  delete from notifications where user_id = any(ids);
  delete from pickup_tokens where pickup_id in (select id from pickups where claimed_by = any(ids));
  delete from pickups where claimed_by = any(ids) or ngo_org_id in (select id from organizations where owner_id = any(ids));
  delete from reports where reporter_id = any(ids) or donation_id in (select id from donations where donor_id = any(ids));
  delete from donations where donor_id = any(ids);
  update profiles set organization_id = null where id = any(ids);
  delete from organizations where owner_id = any(ids);
  delete from auth.users where id = any(ids);
  delete from pickup_token_attempts;
end $$;

drop schema rp_test cascade;
