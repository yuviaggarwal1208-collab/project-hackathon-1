-- RescuePlate: schema, Row Level Security and workflow functions
-- This is the complete rolled-up schema (migrations 0001_init + 0002_hardening).
-- Prefer supabase/migrations/ when using the Supabase CLI; paste this file for a quick install.
create extension if not exists pgcrypto with schema extensions;

create type user_role as enum ('donor','ngo','volunteer','admin');
create type verification_status as enum ('pending','verified','rejected');
create type donation_status as enum ('available','reserved','picked_up','delivered','expired','cancelled');
create type pickup_status as enum ('reserved','picked_up','delivered','cancelled');

-- ---------- tables ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role user_role not null default 'donor',
  phone text,
  language text not null default 'en' check (language in ('en','hi')),
  suspended boolean not null default false,
  organization_id uuid,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  org_type text not null check (org_type in ('restaurant','hotel','venue','hostel','canteen','ngo')),
  address text,
  city text,
  registration_number text,
  verification_status verification_status not null default 'pending',
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index organizations_owner_idx on organizations(owner_id);
alter table profiles add constraint profiles_org_fk foreign key (organization_id) references organizations(id);

create table donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references profiles(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 120),
  description text,
  category text not null,
  diet text not null check (diet in ('veg','non_veg','mixed','not_applicable')),
  quantity_portions int check (quantity_portions > 0),
  quantity_kg numeric(8,2) check (quantity_kg > 0),
  prepared_at timestamptz not null,
  handling_info text not null,
  allergens text,
  image_path text,
  area text not null,                   -- public, approximate location label
  city text not null,
  approx_lat numeric(8,5),
  approx_lng numeric(8,5),
  available_from timestamptz not null default now(),
  pickup_deadline timestamptz not null,
  safety_confirmed boolean not null check (safety_confirmed),
  status donation_status not null default 'available',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_portions is not null or quantity_kg is not null),
  check (pickup_deadline > available_from)
);
create index donations_status_deadline_idx on donations(status, pickup_deadline);
create index donations_donor_idx on donations(donor_id);

-- exact address lives apart so RLS can release it only to authorized parties
create table donation_private (
  donation_id uuid primary key references donations(id) on delete cascade,
  pickup_address text not null,
  exact_lat numeric(8,5),
  exact_lng numeric(8,5),
  instructions text
);

create table pickups (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id) on delete restrict,
  ngo_org_id uuid not null references organizations(id),
  claimed_by uuid not null references profiles(id),
  volunteer_id uuid references profiles(id),
  needs_volunteer boolean not null default false,
  status pickup_status not null default 'reserved',
  claimed_at timestamptz not null default now(),
  picked_up_at timestamptz,
  picked_up_by uuid references profiles(id),
  delivered_at timestamptz,
  delivered_by uuid references profiles(id),
  meals_distributed int check (meals_distributed >= 0),
  delivery_notes text
);
-- one live pickup per donation (cancelled history rows are kept)
create unique index pickups_one_live_idx on pickups(donation_id) where status <> 'cancelled';
create index pickups_ngo_idx on pickups(ngo_org_id);
create index pickups_volunteer_idx on pickups(volunteer_id);

create table pickup_tokens (
  id uuid primary key default gen_random_uuid(),
  pickup_id uuid not null references pickups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table reports (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id) on delete cascade,
  reporter_id uuid not null references profiles(id),
  category text not null default 'other' check (category in ('unsafe_food','misleading_listing','pickup_issue','other')),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  admin_notes text,
  created_at timestamptz not null default now()
);

-- append-only audit trail; written only by SECURITY DEFINER workflow functions
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor uuid references profiles(id),          -- null for system actions (e.g. cron expiry)
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb, -- safe metadata only; never tokens or addresses
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on audit_events(created_at desc);
create index audit_events_target_idx on audit_events(target_type, target_id);

-- pickup-code guess throttling: no RLS policies, invisible to clients
create table pickup_token_attempts (
  key text primary key,                          -- auth.uid() of the guessing caller
  failures int not null default 0,
  first_failure_at timestamptz,
  locked_until timestamptz
);

-- ---------- helpers ----------
create or replace function current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = r and not suspended) $$;

create or replace function my_org_id() returns uuid
language sql stable security definer set search_path = public as
$$ select organization_id from profiles where id = auth.uid() $$;

create or replace function my_org_verified() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from organizations o join profiles p on p.organization_id = o.id
                  where p.id = auth.uid() and o.verification_status = 'verified' and not p.suspended) $$;

create or replace function notify(p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as
$$ insert into notifications(user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link) $$;

-- audit helper: only callable from inside SECURITY DEFINER workflow functions;
-- refuses metadata keys that could smuggle a token
create or replace function audit(p_action text, p_target_type text default null,
                                 p_target_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events(actor, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id,
          case when p_metadata ? 'token' or p_metadata ? 'token_hash'
               then jsonb_build_object('redacted', true) else coalesce(p_metadata, '{}'::jsonb) end);
end $$;


-- helpers used inside policies (SECURITY DEFINER avoids infinite recursion between donations and pickups)
create or replace function is_donor_of(p_donation uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from donations where id = p_donation and donor_id = auth.uid()) $$;
create or replace function ngo_has_pickup(p_donation uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from pickups where donation_id = p_donation and ngo_org_id = my_org_id()) $$;
create or replace function volunteer_has_pickup(p_donation uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from pickups where donation_id = p_donation and volunteer_id = auth.uid()) $$;

-- ---------- new-user trigger: admin can never be self-selected ----------
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
          case when char_length(trim(coalesce(new.raw_user_meta_data->>'full_name',''))) >= 2 then trim(new.raw_user_meta_data->>'full_name') else coalesce(nullif(split_part(new.email,'@',1),''),'User') end,
          r, new.raw_user_meta_data->>'phone',
          case when new.raw_user_meta_data->>'language' = 'hi' then 'hi' else 'en' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- guard triggers: protected columns change only inside workflow functions ----------
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.internal', true),'') <> '1' then
    if new.role is distinct from old.role or new.suspended is distinct from old.suspended
       or new.organization_id is distinct from old.organization_id then
      raise exception 'protected profile fields cannot be changed directly';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

create or replace function guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.internal', true),'') <> '1' then
    if new.verification_status is distinct from old.verification_status or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at or new.owner_id is distinct from old.owner_id
       or new.is_demo is distinct from old.is_demo then
      raise exception 'verification fields can only be changed by an administrator';
    end if;
  end if;
  return new;
end $$;
create trigger orgs_guard before update on organizations for each row execute function guard_org_update();

create or replace function guard_donation_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('app.internal', true),'') <> '1' then
    if new.status is distinct from old.status or new.donor_id is distinct from old.donor_id
       or new.organization_id is distinct from old.organization_id or new.is_demo is distinct from old.is_demo then
      raise exception 'donation status and ownership change only through workflow functions';
    end if;
    if old.status <> 'available' then raise exception 'only available listings can be edited'; end if;
  end if;
  return new;
end $$;
create trigger donations_guard before update on donations for each row execute function guard_donation_update();

-- link a new org to its owner's profile at creation time
create or replace function link_org_to_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.internal','1',true);
  update profiles set organization_id = new.id where id = new.owner_id;
  return new;
end $$;
create trigger org_created after insert on organizations for each row execute function link_org_to_owner();


-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table donations enable row level security;
alter table donation_private enable row level security;
alter table pickups enable row level security;
alter table pickup_tokens enable row level security;   -- no policies: clients never read tokens
alter table pickup_token_attempts enable row level security; -- no policies: clients never touch attempt state
alter table notifications enable row level security;
alter table reports enable row level security;
alter table audit_events enable row level security;

-- profiles
create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_admin_read on profiles for select using (current_role_is('admin'));
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: owner and admin read all; verified orgs are public (trust section)
create policy orgs_owner_read on organizations for select using (owner_id = auth.uid());
create policy orgs_admin_read on organizations for select using (current_role_is('admin'));
create policy orgs_public_verified on organizations for select using (verification_status = 'verified');
create policy orgs_owner_insert on organizations for insert
  with check (owner_id = auth.uid() and verification_status = 'pending' and is_demo = false
              and (current_role_is('donor') or current_role_is('ngo')));
create policy orgs_owner_update on organizations for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- donations: public browses only claimable listings; each party sees what it is part of
create policy donations_public_browse on donations for select
  using (status = 'available' and pickup_deadline > now());
create policy donations_donor_read on donations for select using (donor_id = auth.uid());
create policy donations_ngo_read on donations for select using (ngo_has_pickup(id));
create policy donations_volunteer_read on donations for select using (volunteer_has_pickup(id));
create policy donations_admin_read on donations for select using (current_role_is('admin'));
create policy donations_donor_insert on donations for insert
  with check (donor_id = auth.uid() and current_role_is('donor') and my_org_verified()
              and organization_id = my_org_id() and status = 'available');
create policy donations_donor_update on donations for update
  using (donor_id = auth.uid() and status = 'available') with check (donor_id = auth.uid());

-- private pickup details
create policy dpriv_donor_read on donation_private for select using (is_donor_of(donation_id));
create policy dpriv_donor_insert on donation_private for insert with check (is_donor_of(donation_id));
create policy dpriv_donor_update on donation_private for update using (is_donor_of(donation_id));
create policy dpriv_collector_read on donation_private for select using (
  exists (select 1 from pickups p where p.donation_id = donation_private.donation_id
          and p.status in ('reserved','picked_up')
          and ((p.ngo_org_id = my_org_id() and current_role_is('ngo')) or p.volunteer_id = auth.uid())));
create policy dpriv_admin_read on donation_private for select using (current_role_is('admin'));

-- pickups: read-only for clients, every transition goes through a function
create policy pickups_donor_read on pickups for select using (is_donor_of(donation_id));
create policy pickups_ngo_read on pickups for select using (ngo_org_id = my_org_id());
create policy pickups_volunteer_read on pickups for select using (volunteer_id = auth.uid());
create policy pickups_admin_read on pickups for select using (current_role_is('admin'));

-- notifications
create policy notif_own_read on notifications for select using (user_id = auth.uid());
create policy notif_own_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: resolution changes go through the audited admin_set_report_status() function only
create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_own_read on reports for select using (reporter_id = auth.uid());
create policy reports_admin_read on reports for select using (current_role_is('admin'));

-- audit trail: read-only for admins; no write policies, so only definer functions can insert
create policy audit_admin_read on audit_events for select using (current_role_is('admin'));

-- ---------- workflow functions (SECURITY DEFINER, atomic) ----------
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

create or replace function accept_pickup(p_pickup_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pk pickups;
begin
  if not current_role_is('volunteer') then raise exception 'volunteers only'; end if;
  update pickups set volunteer_id = auth.uid(), needs_volunteer = false
   where id = p_pickup_id and needs_volunteer and volunteer_id is null and status = 'reserved'
   returning * into pk;
  if not found then raise exception 'pickup is not open for volunteers'; end if;
  perform notify(pk.claimed_by, 'volunteer', 'A volunteer accepted your pickup', null, '/dashboard/ngo');
end $$;

create or replace function request_volunteer(p_pickup_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pickups set needs_volunteer = true
   where id = p_pickup_id and claimed_by = auth.uid() and status = 'reserved' and volunteer_id is null;
  if not found then raise exception 'cannot request a volunteer for this pickup'; end if;
end $$;

-- open assignments expose only non-private information
create or replace function open_volunteer_pickups()
returns table (pickup_id uuid, title text, area text, city text, pickup_deadline timestamptz, quantity_portions int)
language sql stable security definer set search_path = public as $$
  select p.id, d.title, d.area, d.city, d.pickup_deadline, d.quantity_portions
  from pickups p join donations d on d.id = p.donation_id
  where current_role_is('volunteer') and p.needs_volunteer and p.volunteer_id is null and p.status = 'reserved'
$$;

-- donor generates a short-lived one-time code (shown as a QR); only its hash is stored
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

-- the assigned collector submits the code; identity comes from auth.uid(), never from the QR itself
create or replace function confirm_pickup(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare t pickup_tokens; pk pickups; d donations; att pickup_token_attempts;
begin
  if exists (select 1 from profiles where id = auth.uid() and suspended) then
    raise exception 'account is not active';
  end if;
  -- throttle repeated guesses: 10 failures in 15 minutes locks the caller out for 15 minutes
  select * into att from pickup_token_attempts where key = auth.uid()::text for update;
  if found and att.locked_until > now() then
    raise exception 'too many failed attempts. Please wait a few minutes and try again.';
  end if;
  select * into t from pickup_tokens where token_hash = encode(digest(p_token,'sha256'),'hex') for update;
  if not found or t.used_at is not null or t.expires_at < now() then
    -- IMPORTANT: do not RAISE here. An exception would roll back the attempt bookkeeping
    -- along with the statement, making the throttle useless. Return NULL instead; the
    -- caller reports a generic invalid/expired outcome.
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
    perform audit('pickup_token.rejected', 'pickup', coalesce(t.pickup_id, '00000000-0000-0000-0000-000000000000'::uuid)::text,
                 jsonb_build_object('failures', att.failures));
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

create or replace function cancel_donation(p_donation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d donations; r record;
begin
  perform set_config('app.internal','1',true);
  update donations set status='cancelled'
   where id = p_donation_id and donor_id = auth.uid() and status in ('available','reserved') returning * into d;
  if not found then raise exception 'listing cannot be cancelled'; end if;
  for r in select claimed_by from pickups where donation_id = d.id and status = 'reserved' loop
    perform notify(r.claimed_by, 'cancel', 'A donation was cancelled', d.title, '/dashboard/ngo');
  end loop;
  update pickups set status='cancelled' where donation_id = d.id and status='reserved';
end $$;

create or replace function cancel_pickup(p_pickup_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pk pickups; d donations;
begin
  select * into pk from pickups where id = p_pickup_id and status='reserved' for update;
  if not found or pk.claimed_by <> auth.uid() then raise exception 'cannot cancel this pickup'; end if;
  perform set_config('app.internal','1',true);
  update pickups set status='cancelled' where id = pk.id;
  update donations set status = (case when pickup_deadline > now() then 'available' else 'expired' end)::donation_status
   where id = pk.donation_id returning * into d;
  perform notify(d.donor_id, 'cancel', 'An NGO released your donation', d.title, '/dashboard/donor');
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
-- schedule with pg_cron (enable the extension in the Supabase dashboard):
-- select cron.schedule('expire-donations','*/5 * * * *','select public.expire_donations()');

-- ---------- admin functions (all audited) ----------
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

-- ---------- impact statistics (real rows only; demo rows are opt-in) ----------
create or replace function get_impact_stats(p_include_demo boolean default false) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'kg_collected',       coalesce(sum(d.quantity_kg) filter (where d.status in ('picked_up','delivered')), 0),
    'portions_collected', coalesce(sum(d.quantity_portions) filter (where d.status in ('picked_up','delivered')), 0),
    'successful_pickups', count(*) filter (where d.status in ('picked_up','delivered')),
    'meals_distributed',  coalesce((select sum(p.meals_distributed) from pickups p join donations d2 on d2.id = p.donation_id
                                     where p.status = 'delivered' and (p_include_demo or not d2.is_demo)), 0),
    'active_donors',      (select count(*) from organizations o where o.org_type <> 'ngo' and o.verification_status = 'verified'
                            and (p_include_demo or not o.is_demo)),
    'verified_ngos',      (select count(*) from organizations o where o.org_type = 'ngo' and o.verification_status = 'verified'
                            and (p_include_demo or not o.is_demo)),
    'includes_demo',      p_include_demo)
  from donations d where p_include_demo or not d.is_demo
$$;

create or replace function get_impact_trend(p_bucket text default 'day', p_include_demo boolean default false)
returns table (period date, portions bigint, kg numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc(case when p_bucket in ('day','week','month') then p_bucket else 'day' end, d.created_at)::date,
         coalesce(sum(d.quantity_portions),0), coalesce(sum(d.quantity_kg),0)
  from donations d where d.status in ('picked_up','delivered') and (p_include_demo or not d.is_demo)
  group by 1 order by 1
$$;

-- ---------- grants ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_impact_stats(boolean), get_impact_trend(text, boolean) to anon, authenticated;
grant execute on function claim_donation(uuid, boolean), accept_pickup(uuid), request_volunteer(uuid), open_volunteer_pickups(),
  create_pickup_token(uuid), confirm_pickup(text), complete_delivery(uuid, int, text), cancel_donation(uuid),
  cancel_pickup(uuid), admin_set_org_verification(uuid, verification_status), admin_set_suspended(uuid, boolean),
  admin_set_report_status(uuid, text, text), admin_overview() to authenticated;
-- RLS policies call current_role_is / my_org_id / my_org_verified, so those stay executable:
grant execute on function current_role_is(user_role), my_org_id(), my_org_verified(),
  is_donor_of(uuid), ngo_has_pickup(uuid), volunteer_has_pickup(uuid) to anon, authenticated;
-- expire_donations() and audit() remain ungranted: run by pg_cron/an operator, or called only
-- from inside other SECURITY DEFINER functions

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('food-images','food-images', true) on conflict do nothing;
create policy food_images_read on storage.objects for select using (bucket_id = 'food-images');
create policy food_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'food-images'
              and (storage.foldername(name))[1] = auth.uid()::text
              and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$');
create policy food_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'food-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- realtime notifications
alter publication supabase_realtime add table notifications;
