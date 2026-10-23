-- RescuePlate migration 0002 — security hardening & governance
-- Apply on top of 0001_init.sql. The same changes are rolled up into
-- supabase/schema.sql for paste-based installs (keep the two in sync).
--
-- Adds:
--   * audit_events append-only trail (admin decisions, claims, token consumption, ...)
--   * rate limiting for pickup-code guesses
--   * suspension re-checks inside every privileged workflow function
--   * expiry notifications + audited expiry job
--   * reports.category and an audited admin report-resolution function
--   * storage upload allowlist hardening

-- ---------- 1. audit trail ----------
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor uuid references profiles(id),          -- null for system actions (e.g. cron expiry)
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb, -- safe metadata only; never tokens or addresses
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on audit_events(created_at desc);
create index if not exists audit_events_target_idx on audit_events(target_type, target_id);
alter table audit_events enable row level security;
drop policy if exists audit_admin_read on audit_events;
-- read-only for admins; no insert/update/delete policies exist, so clients cannot write or tamper
create policy audit_admin_read on audit_events for select using (current_role_is('admin'));

-- Helper used only from inside SECURITY DEFINER workflow functions.
-- Belt-and-braces: refuse metadata keys that could smuggle a token.
create or replace function audit(p_action text, p_target_type text default null,
                                 p_target_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events(actor, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id,
          case when p_metadata ? 'token' or p_metadata ? 'token_hash'
               then jsonb_build_object('redacted', true) else coalesce(p_metadata, '{}'::jsonb) end);
end $$;
-- only the definer workflow functions (owned by the migration role) may call this
revoke execute on function audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------- 2. pickup-code guess throttling ----------
create table if not exists pickup_token_attempts (
  key text primary key,                          -- auth.uid() of the guessing caller
  failures int not null default 0,
  first_failure_at timestamptz,
  locked_until timestamptz
);
-- no RLS policies at all: invisible and untouchable by clients
alter table pickup_token_attempts enable row level security;

-- ---------- 3. report categories ----------
alter table reports add column if not exists category text not null default 'other';
alter table reports drop constraint if exists reports_category_check;
alter table reports add constraint reports_category_check
  check (category in ('unsafe_food','misleading_listing','pickup_issue','other'));

-- clients may no longer flip report status directly (bypassed the audit trail);
-- the audited admin_set_report_status() function below is the only path
drop policy if exists reports_admin_update on reports;

-- ---------- 4. hardened workflow functions ----------
create or replace function claim_donation(p_donation_id uuid, p_needs_volunteer boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare d donations; pk uuid;
begin
  if not (current_role_is('ngo') and my_org_verified()) then
    raise exception 'only verified NGO accounts can claim donations';
  end if;
  perform set_config('app.internal','1',true);
  -- conditional UPDATE takes the row lock: two simultaneous claims cannot both succeed
  update donations set status = 'reserved'
   where id = p_donation_id and status = 'available' and pickup_deadline > now() and available_from <= now()
   returning * into d;
  if not found then raise exception 'donation is no longer available'; end if;
  -- a suspended donor's stale listings must not stay claimable
  if exists (select 1 from profiles where id = d.donor_id and suspended) then
    raise exception 'donation is no longer available';
  end if;
  insert into pickups(donation_id, ngo_org_id, claimed_by, needs_volunteer)
  values (d.id, my_org_id(), auth.uid(), p_needs_volunteer) returning id into pk;
  perform notify(d.donor_id, 'claim', 'Your donation was claimed', d.title, '/dashboard/donor');
  perform audit('donation.claimed', 'donation', d.id::text, jsonb_build_object('pickup', pk, 'ngo_org', my_org_id()));
  return pk;
end $$;

create or replace function create_pickup_token(p_pickup_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare raw text; pk pickups;
begin
  if exists (select 1 from profiles where id = auth.uid() and suspended) then
    raise exception 'account is not active';
  end if;
  select * into pk from pickups where id = p_pickup_id and status = 'reserved' for update;
  if not found then raise exception 'pickup not ready for verification'; end if;
  if not exists (select 1 from donations d where d.id = pk.donation_id and d.donor_id = auth.uid()) then
    raise exception 'only the donor can generate the pickup code';
  end if;
  raw := encode(gen_random_bytes(18), 'hex');
  update pickup_tokens set used_at = now() where pickup_id = p_pickup_id and used_at is null;  -- retire older codes
  insert into pickup_tokens(pickup_id, token_hash, created_by, expires_at)
  values (p_pickup_id, encode(digest(raw,'sha256'),'hex'), auth.uid(), now() + interval '15 minutes');
  perform audit('pickup_token.created', 'pickup', p_pickup_id::text);  -- never the raw token or its hash
  return raw;
end $$;

create or replace function confirm_pickup(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare t pickup_tokens; pk pickups; d donations; att pickup_token_attempts;
begin
  if exists (select 1 from profiles where id = auth.uid() and suspended) then
    raise exception 'account is not active';
  end if;
  -- throttle repeated guesses: more than 10 failures in 15 minutes locks the caller out for 15 minutes
  select * into att from pickup_token_attempts where key = auth.uid()::text for update;
  if found and att.locked_until > now() then
    raise exception 'too many failed attempts. Please wait a few minutes and try again.';
  end if;
  select * into t from pickup_tokens where token_hash = encode(digest(p_token,'sha256'),'hex') for update;
  if not found or t.used_at is not null or t.expires_at < now() then
    insert into pickup_token_attempts(key, failures, first_failure_at, locked_until)
    values (auth.uid()::text, 1, now(), null)
    on conflict (key) do update set
      failures = case when pickup_token_attempts.first_failure_at < now() - interval '15 minutes'
                      then 1 else pickup_token_attempts.failures + 1 end,
      first_failure_at = case when pickup_token_attempts.first_failure_at < now() - interval '15 minutes'
                              then now() else pickup_token_attempts.first_failure_at end,
      locked_until = case when (case when pickup_token_attempts.first_failure_at < now() - interval '15 minutes'
                                     then 1 else pickup_token_attempts.failures + 1 end) >= 10
                          then now() + interval '15 minutes' else pickup_token_attempts.locked_until end
    returning * into att;
    perform audit('pickup_token.rejected', 'pickup', t.pickup_id::text, jsonb_build_object('failures', att.failures));
    -- Do not RAISE: an exception rolls back this bookkeeping. NULL signals a generic failure.
    return null;
  end if;
  select * into pk from pickups where id = t.pickup_id for update;
  if pk.status <> 'reserved' then raise exception 'pickup already processed'; end if;
  if not (pk.volunteer_id = auth.uid() or (pk.volunteer_id is null and pk.claimed_by = auth.uid())) then
    raise exception 'you are not the assigned collector';
  end if;
  select * into d from donations where id = pk.donation_id for update;
  if d.pickup_deadline < now() then raise exception 'pickup window has closed'; end if;
  perform set_config('app.internal','1',true);
  update pickup_tokens set used_at = now(), used_by = auth.uid() where id = t.id;
  update pickups set status = 'picked_up', picked_up_at = now(), picked_up_by = auth.uid() where id = pk.id;
  update donations set status = 'picked_up' where id = d.id;
  delete from pickup_token_attempts where key = auth.uid()::text;  -- successful use clears the slate
  perform notify(d.donor_id, 'pickup', 'Pickup confirmed', d.title, '/dashboard/donor');
  perform audit('pickup.confirmed', 'pickup', pk.id::text, jsonb_build_object('donation', d.id));
  return pk.id;
end $$;

create or replace function complete_delivery(p_pickup_id uuid, p_meals int, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pk pickups; d donations;
begin
  if exists (select 1 from profiles where id = auth.uid() and suspended) then
    raise exception 'account is not active';
  end if;
  select * into pk from pickups where id = p_pickup_id and status = 'picked_up' for update;
  if not found then raise exception 'pickup is not awaiting delivery'; end if;
  if not (pk.picked_up_by = auth.uid() or pk.volunteer_id = auth.uid() or pk.claimed_by = auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_meals is null or p_meals < 0 then raise exception 'enter the number of meals distributed'; end if;
  perform set_config('app.internal','1',true);
  update pickups set status='delivered', delivered_at=now(), delivered_by=auth.uid(),
         meals_distributed=p_meals, delivery_notes=p_notes where id = pk.id;
  update donations set status='delivered' where id = pk.donation_id returning * into d;
  perform notify(d.donor_id, 'delivered', 'Your food reached people in need', d.title, '/dashboard/donor');
  perform audit('pickup.delivered', 'pickup', pk.id::text, jsonb_build_object('meals', p_meals));
end $$;

create or replace function expire_donations() returns int
language plpgsql security definer set search_path = public as $$
declare n int; expired jsonb; r jsonb;
begin
  perform set_config('app.internal','1',true);
  with e as (
    update donations set status='expired'
     where status in ('available','reserved') and pickup_deadline < now()
     returning id, donor_id, title
  ) select count(*), coalesce(jsonb_agg(e), '[]'::jsonb) into n, expired from e;
  -- release reserved pickups for the expired donations, and notify their NGOs
  for r in
    with c as (
      update pickups set status='cancelled'
       where status='reserved'
         and donation_id in (select (item->>'id')::uuid from jsonb_array_elements(expired) item)
       returning id, claimed_by, donation_id
    ) select to_jsonb(c) from c
  loop
    perform notify((r->>'claimed_by')::uuid, 'expired', 'A reserved donation expired before pickup',
                   null, '/dashboard/ngo');
  end loop;
  -- notify donors once per expired listing
  for r in select * from jsonb_array_elements(expired)
  loop
    perform notify((r->>'donor_id')::uuid, 'expired', 'Your listing expired unclaimed', r->>'title', '/dashboard/donor');
  end loop;
  if n > 0 then perform audit('donations.expired', 'donation', null, jsonb_build_object('count', n)); end if;
  return n;
end $$;

-- ---------- 4b. tidy the generated display name (parity with schema.sql) ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  r := case new.raw_user_meta_data->>'role'
         when 'ngo' then 'ngo'::user_role
         when 'volunteer' then 'volunteer'::user_role
         else 'donor'::user_role end;       -- 'admin' and anything unknown fall back to donor
  insert into profiles(id, full_name, role, phone, language)
  values (new.id,
          case when char_length(trim(coalesce(new.raw_user_meta_data->>'full_name',''))) >= 2
               then trim(new.raw_user_meta_data->>'full_name')
               else coalesce(nullif(split_part(new.email,'@',1),''), 'User') end,
          r, new.raw_user_meta_data->>'phone',
          case when new.raw_user_meta_data->>'language' = 'hi' then 'hi' else 'en' end);
  return new;
end $$;

-- ---------- 5. audited admin operations ----------
create or replace function admin_set_org_verification(p_org uuid, p_status verification_status) returns void
language plpgsql security definer set search_path = public as $$
declare o organizations;
begin
  if not current_role_is('admin') then raise exception 'administrators only'; end if;
  perform set_config('app.internal','1',true);
  update organizations set verification_status = p_status, verified_by = auth.uid(), verified_at = now()
   where id = p_org returning * into o;
  if not found then raise exception 'organization not found'; end if;
  perform notify(o.owner_id, 'verification', 'Verification decision: ' || p_status::text, o.name, null);
  perform audit('organization.verification', 'organization', p_org::text,
                jsonb_build_object('status', p_status::text));
end $$;

create or replace function admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not current_role_is('admin') then raise exception 'administrators only'; end if;
  if p_user = auth.uid() then raise exception 'administrators cannot suspend their own account'; end if;
  perform set_config('app.internal','1',true);
  update profiles set suspended = p_suspended where id = p_user and role <> 'admin';
  if not found then raise exception 'account not found or not suspendable'; end if;
  perform audit(case when p_suspended then 'account.suspended' else 'account.restored' end,
                'profile', p_user::text);
end $$;

create or replace function admin_set_report_status(p_report uuid, p_status text, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not current_role_is('admin') then raise exception 'administrators only'; end if;
  if p_status not in ('open','investigating','resolved','dismissed') then raise exception 'invalid status'; end if;
  update reports set status = p_status, admin_notes = p_notes where id = p_report;
  if not found then raise exception 'report not found'; end if;
  perform audit('report.resolution', 'report', p_report::text, jsonb_build_object('status', p_status));
end $$;

create or replace function admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not current_role_is('admin') then raise exception 'administrators only'; end if;
  return json_build_object(
    'users',(select count(*) from profiles),
    'pending_orgs',(select count(*) from organizations where verification_status='pending'),
    'verified_orgs',(select count(*) from organizations where verification_status='verified'),
    'donations',(select count(*) from donations),
    'available',(select count(*) from donations where status='available' and pickup_deadline>now()),
    'pickups',(select count(*) from donations where status in ('picked_up','delivered')),
    'expired',(select count(*) from donations where status='expired'),
    'open_reports',(select count(*) from reports where status in ('open','investigating')));
end $$;

-- ---------- 6. grants ----------
revoke execute on function claim_donation(uuid, boolean), create_pickup_token(uuid), confirm_pickup(text),
  complete_delivery(uuid, int, text), expire_donations(), admin_set_org_verification(uuid, verification_status),
  admin_set_suspended(uuid, boolean), admin_set_report_status(uuid, text, text), admin_overview()
  from public, anon, authenticated;
grant execute on function claim_donation(uuid, boolean), create_pickup_token(uuid), confirm_pickup(text),
  complete_delivery(uuid, int, text), admin_set_org_verification(uuid, verification_status),
  admin_set_suspended(uuid, boolean), admin_set_report_status(uuid, text, text), admin_overview()
  to authenticated;
-- expire_donations() stays ungranted: it is run by pg_cron/an operator, never by a client

-- ---------- 7. storage upload allowlist ----------
drop policy if exists food_images_upload on storage.objects;
create policy food_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'food-images'
              and (storage.foldername(name))[1] = auth.uid()::text
              and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$');
