-- 0003: repair the storage/realtime/expiry tail that a partial schema.sql install missed,
-- and schedule the expiry job. Idempotent: safe to run repeatedly on any project with 0001.
--
-- Why this exists (docs):
--   * PRD §8.3 P1    — listing image uploads must use a controlled storage bucket.
--   * SECURITY §6/§11 — storage policies: owner-scoped paths + image-extension allowlist.
--   * PRD §8.10 P0   — expiry must work even when nobody is online (pg_cron), on top of
--                      the claim-time deadline check that always runs regardless.
-- Live diagnosis (23 Oct 2026): every table, column, RLS policy and workflow function
-- matched schema.sql except the storage bucket, which did not exist — the bucket insert
-- and policies are the final section of schema.sql and were never applied.

-- ---------- 1. the food-images bucket ----------
insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do nothing;

-- ---------- 2. storage policies (0001 definitions + 0002 hardening, made re-runnable) ----------
drop policy if exists food_images_read on storage.objects;
create policy food_images_read on storage.objects for select
  using (bucket_id = 'food-images');

drop policy if exists food_images_upload on storage.objects;
create policy food_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'food-images'
              and (storage.foldername(name))[1] = auth.uid()::text
              and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$');

drop policy if exists food_images_delete on storage.objects;
create policy food_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'food-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 3. realtime publication (only if missing) ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- ---------- 4. expiry job (best effort; claim-time checks work without it) ----------
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron is not enabled. Enable it (Dashboard -> Extensions), then run: select cron.schedule(''expire-donations'', ''*/5 * * * *'', ''select public.expire_donations()'')';
  elsif not exists (select 1 from cron.job where jobname = 'expire-donations') then
    perform cron.schedule('expire-donations', '*/5 * * * *', 'select public.expire_donations()');
    raise notice 'scheduled expire_donations() every 5 minutes';
  end if;
exception when others then
  raise notice 'could not schedule expire_donations(): %', sqlerrm;
end $$;
