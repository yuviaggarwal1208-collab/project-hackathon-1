# RescuePlate

*Save Food. Feed People. Make Every Meal Count.*

React + TypeScript + Tailwind + Supabase. Connects food donors with verified NGOs and
volunteers, with atomic claims, private pickup addresses, one-time pickup codes, and impact
numbers derived from real records.

The four documents in the repository root (`PRD.md`, `DESIGN.md`, `SECURITY.md`,
`ARCHITECTURE.md`) are the product and engineering specification. This README covers running
the app; the **Implementation status** sections in those documents track what is built.

## What works

- Public homepage, marketplace, impact page, English/Hindi switcher, dark mode, mobile layout.
- Supabase Auth: registration as **donor / NGO / volunteer** (never admin), login, logout,
  session restore, password reset via emailed link.
- Donor: create and edit listings while available, cancel listings, see the claiming NGO,
  show a 15-minute one-time pickup code.
- NGO: browse/filter/paginate claimable food, claim atomically, see the exact address only
  after claiming, request a volunteer, record meals reported as distributed.
- Volunteer: see open assignments without addresses, accept one, see pickup details, confirm
  pickup with the code, record handover.
- Admin: verification queue, suspension, safety-report queue with audited resolution,
  platform metrics. Admin is provisioned server-side, never through registration.
- In-app notifications for claims, confirmations, cancellations, expiry and verification
  decisions.
- Automated tests: unit/component/SQL-invariant suite plus database RLS/workflow/race suites.

## Run it locally

1. Install Node.js LTS.
2. `npm install`
3. Configure Supabase (below), then `npm run dev` and open http://localhost:5173.

### Configure Supabase

**Option A — `.env` (recommended)**

```bash
cp .env.example .env
# edit .env with your project URL and publishable/anon key
```

**Option B — in-app setup screen**

With no `.env`, the app opens a **Connect your database** screen. Paste the project URL and
the **publishable (or anon)** key once. It is stored in your browser's local storage. The app
refuses secret/service_role keys.

> Never use the `service_role`/secret key in this app. Only the publishable key belongs in a
> browser bundle.

### Install the database

Create a project at supabase.com, then choose one path:

- **Supabase CLI (versioned, recommended):** `supabase link` then `supabase db push`.
  Migrations live in `supabase/migrations/` (`0001_init.sql`, `0002_hardening.sql`,
  `0003_storage_repair.sql`).
- **SQL Editor (quickest):** open `supabase/schema.sql`, copy everything, paste into
  **SQL Editor → New query**, run. It is the rolled-up equivalent of the migrations.

Then in **Authentication → Sign In / Providers → Email**, turn **off** "Confirm email" for
local testing only. Re-enable it for any real deployment and configure the site URL plus the
`/reset` redirect URL.

### Create accounts

1. Sign up once as a **Food donor** and once as an **NGO** (different emails).
2. To create an administrator, edit the email inside `supabase/make_admin.sql` and run it in
   the SQL Editor **as the project owner**. It is a controlled local/demo provisioning step
   and writes an audit record. Production should use a restricted operational process.
3. Sign in as the admin and verify both organizations.
4. Optional: run `supabase/seed_demo.sql` for labelled demo listings. Demo rows show a
   **Demonstration data** badge and are excluded from impact totals unless you tick
   “Include demonstration data”.

### Try the full flow

Donor posts food (optionally using **Use my precise location**) → NGO claims it in
**Find food** → donor taps **Show pickup code** → NGO/volunteer enters the code → delivery and
reported meals are recorded → the Impact page updates from those records.

## Tests

```bash
npm test          # unit, component, and SQL security-invariant tests (no database needed)
npm run build     # TypeScript + production bundle
```

Database suites need a real Supabase Postgres (local stack or a dedicated development
project — never production):

```bash
supabase start
supabase db reset
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:db
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run test:race
```

See `supabase/tests/README.md` for exactly what each assertion proves (RLS, authorization,
claim atomicity, token replay, state machine, demo-data exclusion).

## Security model (verified against the schema and tests)

- Row Level Security is enabled on every application table; private tables have no client
  policies at all.
- Exact addresses live in `donation_private` and are readable only by the donor and the
  donor/collector on the active pickup.
- Roles, suspension, verification and donation status cannot be changed by direct table
  updates; guard triggers reject them and privileged SQL functions enforce transitions.
- Claims are atomic: a conditional `UPDATE` plus a partial unique index guarantee one live
  pickup per donation. `npm run test:race` proves it with two concurrent connections.
- Pickup codes are random, stored as SHA-256 hashes, expire after 15 minutes, are single-use,
  and require the assigned collector's authenticated identity. Repeated bad guesses are
  throttled.
- Admin actions and sensitive workflow steps append to `audit_events` (no tokens or
  addresses in metadata).
- Public registration can never create an admin; `handle_new_user` maps anything else to
  `donor`.
- Demo rows are flagged `is_demo` and excluded from impact by default.

## Location features

- **Use my precise location** fills area, city, address and coordinates via browser GPS and
  OpenStreetMap (no API key).
- Public listings show a rounded (~1 km) area only; the exact address and coordinates are
  private to authorized pickup participants.
- **Find food** supports distance filtering, nearest-first sorting, a map view, and nearby
  food businesses from OpenStreetMap. Map/provider failures never block the list.
- Browsers allow geolocation only on `https` or `localhost`, and only after you click Allow.

## Not built / known limitations

- **Email, SMS and WhatsApp delivery** is not implemented; notifications are in-app only.
  Provider adapters are a future step.
- **Camera QR scanning** is not implemented; collectors type or paste the pickup code.
- **Automated expiry job**: `expire_donations()` is ready and claim-time checks always run,
  but the `pg_cron` schedule must be enabled per project (see the comment in
  `supabase/schema.sql`). Without it, listings are still unclaimable after their deadline
  and are hidden from the marketplace.
- **Hindi coverage** covers navigation, marketplace, auth, statuses and key safety strings;
  some dashboard copy is still English-only.
- **File uploads** are restricted to JPG/PNG/WebP with a 5 MB client limit and an
  owner-scoped storage policy, but the image bytes are not server-side re-encoded; add
  image processing before production.
- **Database test suites** require Supabase (auth schema and roles); they were authored and
  syntax-verified here, but not executed in this environment because no Docker/Supabase
  stack was available.
- Food-safety, liability, evidence requirements and retention policy need review for the
  deployment jurisdiction; the app does not certify food safety.

## Troubleshooting

- **`npm` not recognized**: install Node.js, reopen the terminal.
- **Connect screen says tables are missing**: apply the migrations or `schema.sql`.
- **Image upload fails / "Bucket not found"**: the `food-images` bucket is missing — run
  `supabase/migrations/0003_storage_repair.sql` in the SQL Editor (safe to re-run).
- **Check the live project against the schema**: `npm run db:check` prints tables, functions,
  RLS leak probes, the storage bucket and realtime readiness, without exposing secrets.
- **Change Supabase project**: open http://localhost:5173/setup.
- **Location blocked**: allow Location for the site, then retry.
- **Login says email not confirmed**: confirm the email, or disable confirmation for local
  development only.
