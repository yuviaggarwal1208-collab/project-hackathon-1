# Database tests (RLS, workflow, concurrency)

These suites prove the security properties the app relies on. They need a **real Postgres
with the RescuePlate schema installed** and are designed for a **local Supabase stack or a
dedicated development project**. They create and delete test users and donations, so never
point them at production.

## 1. One-time setup

```bash
# from the repository root
supabase start                       # needs Docker; prints the local API + DB URLs
supabase db reset                    # applies supabase/migrations/*.sql to the local DB
```

Or, without the CLI: create a throwaway development Supabase project and run
`supabase/schema.sql` in its SQL editor once.

## 2. Run the suites

```bash
# RLS, authorization, claim atomicity, pickup tokens, state machine, impact aggregation
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:db

# two independent connections race to claim the same donation
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:race
```

Both scripts refuse to run if `DATABASE_URL` looks like production.

## What `workflow_and_rls.test.sql` proves

| # | Property |
|---|---|
| 1 | Sign-up metadata `role=admin` falls back to `donor`; requested donor/NGO/volunteer roles are honoured |
| 2 | Anonymous visitors cannot read addresses, pickups, tokens, notifications, reports, or the audit trail, and cannot claim |
| 3 | Public browsing sees only `available` + unexpired listings; a stale `available` row past its deadline is hidden |
| 4 | Donor A cannot read or update donor B's listing or private address |
| 5 | Users cannot change their own role or suspension state, and cannot write donation status directly |
| 6 | Unverified and suspended NGOs are rejected; a verified NGO claims once; a second claim conflicts; exactly one live pickup exists |
| 7 | Expired listings are rejected at claim time even though the expiry job has not run |
| 8 | Unassigned volunteers cannot read addresses or complete deliveries; accepting assigns and reveals the address |
| 9 | Pickup tokens are stored only as SHA-256 hashes, expire in ~15 minutes, work once, and only for the assigned collector |
| 10 | Repeated bad token guesses lock the caller out |
| 11 | Notification and report isolation; non-admins cannot resolve reports; direct report edits are blocked; audited function works |
| 12 | Impact metrics count real rows once and exclude demo data unless explicitly included |

## What `claim-race-test.mjs` proves

Two verified NGOs claim the same donation from **two concurrent database connections**. The
test asserts exactly one claim succeeds, the other receives a conflict, one live pickup row
exists, and the donation is `reserved` once. This exercises the real row-lock behaviour of
`claim_donation`, not a mocked simulation.

## Notes

- The suites rely on Supabase's `auth` schema, roles (`anon`, `authenticated`), and
  `auth.uid()` reading `request.jwt.claims` — plain PostgreSQL without Supabase Auth will not
  work.
- `supabase/tests/workflow_and_rls.test.sql` is self-cleaning and rolls back as a whole if an
  assertion fails.
- Storage policies (bucket/object access) are not covered by SQL tests; verify them manually
  in the Supabase dashboard or with a storage-specific test project.
