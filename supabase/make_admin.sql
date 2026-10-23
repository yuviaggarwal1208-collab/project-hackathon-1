-- Controlled LOCAL/DEMO admin provisioning ONLY.
-- Production admin provisioning must be a restricted operational process run by a
-- trusted operator (see SECURITY.md §5) — never registration, metadata, or client updates.
--
-- Usage: replace YOUR-EMAIL@example.com below, then run the whole block in the
-- Supabase SQL Editor. It must be run as postgres/service_role (the SQL Editor owner),
-- because the profiles guard trigger rejects role changes outside workflow functions.
do $$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'YOUR-EMAIL@example.com';
  if uid is null then
    raise exception 'No user found with that email. Sign up on the website first, then re-run this script.';
  end if;
  perform set_config('app.internal','1',true);
  update profiles set role = 'admin' where id = uid and role <> 'admin';
  -- record who was provisioned and when; actor is null because this runs outside a user session
  insert into audit_events(actor, action, target_type, target_id, metadata)
  values (null, 'admin.provisioned', 'profile', uid::text,
          jsonb_build_object('source', 'make_admin.sql (local/demo provisioning)'));
end $$;
