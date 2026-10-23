# RescuePlate — Product Requirements Document (PRD)

- **Product:** RescuePlate
- **Tagline:** Save Food. Feed People. Make Every Meal Count.
- **Document status:** Implementation baseline for coding agent
- **Audience:** Product, design, engineering, QA, security, demo reviewers
- **Source of truth:** This document plus `DESIGN.md`, `ARCHITECTURE.md`, and `SECURITY.md`. Where the prototype differs from an explicit requirement here, preserve the existing implementation where sensible but close the requirement gap.

## 1. Product vision

RescuePlate connects establishments with surplus edible food—restaurants, hotels, wedding venues, hostels, and college canteens—to verified NGOs and authorized volunteers who can collect and distribute that food to people experiencing hunger. It should be a credible, usable, safe-by-design full-stack product, not a static demo.

## 2. Problem and opportunity

Edible surplus is time-sensitive, fragmented across donors, and difficult for community organizations to discover and collect reliably. RescuePlate provides one workflow for publishing a donation, discovering eligible food, reserving it without duplicate claims, coordinating pickup, recording handover, and reporting impact with transparent provenance.

## 3. Goals

1. Make it easy for donors to publish accurate, time-bound surplus-food listings.
2. Let verified NGOs discover and atomically reserve eligible donations.
3. Support authorized volunteers through assignment, pickup, and handover.
4. Give administrators secure tools to verify organizations and investigate reports.
5. Make food handling, allergens, deadlines, and responsibility visible throughout the workflow.
6. Report impact from database records without fabricating or double-counting outcomes.
7. Provide accessible, responsive English/Hindi experiences.
8. Provide a setup path a developer can run locally and configure against their own Supabase project.

## 4. Non-goals for initial release

- Payment processing, donor billing, or financial transfers.
- Automated food-safety certification or a guarantee that listed food is safe.
- Dispatch optimization, fleet routing, or guaranteed delivery logistics.
- Native iOS/Android applications.
- Sending email, SMS, or WhatsApp until a provider is configured and tested.
- Public exposure of exact donor pickup addresses or personal contact details.
- AI-based food safety decisions.

## 5. Users and roles

### 5.1 Food donor
Restaurants, hotels, venues, hostels, canteens, and other approved food providers. Can create and manage their own eligible donations, see claims and pickup progress, and review donation history.

### 5.2 NGO
A registered organization that must pass verification before claiming donations. Can discover listings, reserve eligible donations, coordinate pickup, record reported distribution, and see its own history.

### 5.3 Volunteer
A registered individual whose account and any required affiliation are approved according to configured policy. Can see only assigned pickups and the minimum private details required to complete them.

### 5.4 Administrator
A trusted platform operator. Can review verification requests, suspend accounts, investigate safety reports, and audit platform activity. Admin authority is assigned only by a trusted server-side process—not by registration form input or client-side state.

### 5.5 Public visitor
Can view public information, public/approximate donation listing details, and aggregate impact metrics. Must not see private addresses, private contact details, internal reports, or pickup tokens.

## 6. Product principles

- **Safety before convenience:** deadlines, preparation time, storage instructions, and allergens are first-class data.
- **Least privilege:** users only access information needed for their role and active workflow.
- **Honest impact:** distinguish collected food from meals reported as distributed; label seeded/demo records.
- **No race-condition claims:** only one eligible claimant may reserve a donation.
- **Progressive disclosure:** show public approximate location first; reveal exact address only to authorized participants.
- **Useful failure states:** every important async action has loading, success, and actionable error states.

## 7. Core journeys

### 7.1 Donor publishes food
1. Register/login as donor.
2. Complete organization profile and verification requirements.
3. Open donor dashboard and create a listing.
4. Enter food identity, category/diet, quantity, preparation time, handling, allergens, image (optional), approximate location, available-from time, and pickup deadline.
5. Confirm applicable food-handling requirements.
6. Submit; server validates permissions and fields; listing is stored as `available` only if eligible.
7. Listing appears in marketplace with approximate location and deadline.
8. Donor receives in-app notification when claimed, picked up, cancelled, or expired.

### 7.2 NGO claims and completes a donation
1. Login as verified NGO.
2. Search/filter available, non-expired listings.
3. Open details; exact pickup address is not disclosed until authorized by successful claim.
4. Claim listing; server re-checks account status, verification, deadline, status, and claim eligibility inside an atomic transaction/function.
5. Create pickup record and notify donor/NGO.
6. Assign an eligible volunteer if required.
7. Authorized donor and collector complete pickup verification. QR code/token is not proof of identity by itself.
8. Record pickup, then handover/delivery and optional reported meal count.
9. Update impact data from canonical records; preserve timestamps and audit trail.

### 7.3 Volunteer completes assignment
1. Login and view assigned pickups only.
2. Accept assignment if policy allows and assignment is still eligible.
3. View pickup details and directions after authorization.
4. Confirm collection and delivery/handover through backend-approved transitions.
5. See completed history; cannot access unrelated pickup addresses.

### 7.4 Admin verifies an organization
1. Login with server-provisioned admin authority.
2. Review organization details and submitted evidence.
3. Approve, reject, or request further information using an audited server-side operation.
4. Notify affected users and record actor, timestamp, and decision.

## 8. Functional requirements

Priority definitions: **P0** required for safe MVP; **P1** important release capability; **P2** later enhancement.

### 8.1 Public site and onboarding
- **P0:** Homepage with logo/navigation, headline “Good Food Deserves a Second Chance”, explanation, “Donate Surplus Food” and “Find Available Food” CTAs, How It Works, donation previews, partner section, impact section, CTA, and footer.
- **P0:** Responsive desktop/tablet/mobile layout; mobile navigation; accessible labels and keyboard interaction.
- **P0:** Public statistics derive from persisted records when available. Clearly label demo data; do not claim invented statistics as verified impact.
- **P1:** Testimonials, with sample/demo content visibly identified as such.
- **P1:** English/Hindi switcher for navigation, forms, buttons, status labels, and important messages. Persist preference where appropriate.

### 8.2 Authentication and profiles
- **P0:** Supabase Auth registration, login, logout, session restore, and useful auth errors.
- **P0:** Roles: donor, NGO, volunteer, admin. Public registration must never self-assign `admin`.
- **P0:** `profiles` record linked to `auth.users`; organization data stored separately.
- **P0:** Role and account suspension/verification state enforced in database/server, not just hidden UI.
- **P0:** Protected routes are UX controls only; backend RLS and server/database functions are authoritative.
- **P1:** Password reset and verification/onboarding flows appropriate to Supabase configuration.

### 8.3 Donation management
- **P0:** Create/edit eligible own listings; validate required fields and future/past time consistency.
- **P0:** Fields: title/name, description, category, diet, portions and/or kg, prepared-at timestamp, handling/storage instructions, allergens, optional image, pickup address, approximate coordinates, available-from time, pickup deadline, and pickup instructions.
- **P0:** Explicit food-safety acknowledgement; it is an acknowledgement, not a platform safety certification.
- **P0:** Statuses: `available`, `reserved`, `picked_up`, `delivered`, `expired`, `cancelled`.
- **P0:** Donor cannot modify another donor’s record or alter protected status/claim fields directly.
- **P1:** Listing image uploads use a controlled storage bucket and safe file validation.

### 8.4 Marketplace
- **P0:** Search and cards showing food image, title, quantity, donor/organization display name, approximate area, deadline, handling summary, and status.
- **P0:** Filter by category, diet, quantity, distance where location is available, and deadline.
- **P1:** Sort by nearest and earliest deadline when the needed data is present.
- **P0:** Expired/cancelled/reserved listings are not claimable; public UX must make unavailable state clear or omit them from the claimable feed.
- **P0:** Exact pickup address and sensitive instructions are withheld from public listing responses.

### 8.5 NGO dashboard
- **P0:** Browse and claim available listings; view own active pickups and history.
- **P0:** Claim eligibility checked server-side; duplicate claims prevented atomically.
- **P0:** Reveal exact address only after an authorized claim.
- **P1:** Report meals distributed separately from food collected, with timestamps and provenance.
- **P1:** In-app notifications for relevant events.

### 8.6 Donor dashboard
- **P0:** Create listings; view own available/reserved/completed/history; see authorized claiming organization and progress.
- **P0:** Cannot edit another donor’s records or bypass status transitions.
- **P1:** Summary totals for food collected and meals reported as distributed, with demo data clearly identified.

### 8.7 Volunteer dashboard
- **P0:** View assignments and pickup/delivery instructions only for assigned pickups.
- **P0:** Assignment acceptance and status updates validated server-side.
- **P0:** Confirm pickup and record handover/delivery with responsible user and timestamps.
- **P1:** Directions link/map integration, subject to location permissions.

### 8.8 Admin and verification
- **P0:** Dashboard metrics for users, pending verification, verified organizations, donations, available donations, successful pickups, expired listings, and safety reports.
- **P0:** Verify/reject organizations, suspend accounts, review reports, investigate pickup issues, and inspect records using audited server-side operations.
- **P0:** Admin status is provisioned securely. The existing `make_admin.sql` path is for controlled local/demo setup only; production should use a restricted operational process.

### 8.9 Pickup workflow and verification
- **P0:** Valid main transition: `available → reserved → picked_up → delivered`.
- **P0:** Support cancellation and expiry with defined allowed transitions and actor permissions.
- **P0:** Claim transaction rechecks status and deadline, reserves once, records claimant/pickup, and creates notifications atomically where possible.
- **P0:** Pickup verification token is unique, unpredictable, short-lived (prototype target: 15 minutes), single-use, and stored hashed. Validate and consume on the server/database.
- **P0:** QR/token alone does not establish identity; both parties must be authenticated/authorized as required.
- **P1:** Camera-based QR scanning. Current prototype supports entering/pasting the code; do not imply camera scanning is implemented.

### 8.10 Food safety and reports
- **P0:** Capture preparation time, handling/storage details, deadline, allergens where known, and donor acknowledgement.
- **P0:** Automatically expire listings and prevent claiming after deadline. Expiry should be robust even if no user is online (scheduled job/cron or equivalent, plus query-time eligibility checks).
- **P0:** Users can report unsafe food or pickup concerns; reports are private to reporter and authorized admins.
- **P0:** UI must not assert food is safe merely because a donor checked a box.

### 8.11 Notifications
- **P0:** In-app notifications for claims, confirmations, upcoming deadlines, cancellations, expiries, and verification decisions.
- **P1:** Structure provider adapter interfaces for future email/SMS/WhatsApp. External channels remain disabled/unavailable until credentials, consent, templates, and delivery monitoring are configured.

### 8.12 Impact analytics
- **P0:** Show collected kg, collected portions, successful pickups, active donor organizations, verified NGO partners, and reported meals distributed.
- **P0:** Collected vs distributed are distinct measures; no implied equivalence.
- **P0:** Calculate from canonical database records; avoid double-counting and label demo/seed data.
- **P1:** Daily/weekly/monthly charts.

### 8.13 Location and map
- **P0:** Location is optional; user must explicitly grant browser permission.
- **P0:** Public view shows rounded/approximate location; exact address is private to authorized pickup participants.
- **P1:** Map and nearby food-related places via OpenStreetMap-compatible services. Handle provider timeouts, rate limits, and service failure gracefully; do not block core donation workflows on external geocoding.
- **P1:** Distance filtering/sorting only when coordinates are available and user location consented.

## 9. Data requirements (logical entities)

- **profiles:** auth user ID, full name, role, phone (optional), language preference, suspension state, organization link.
- **organizations:** owner, name, type, city, verification status, evidence metadata, demo flag, audit timestamps.
- **donations:** donor, public food fields, quantity, diet/category, preparation/availability/deadline timestamps, approximate coordinates, image path, status, demo flag.
- **donation_private:** exact address and sensitive pickup instructions, protected separately from public listing data.
- **pickups:** donation, NGO organization, optional volunteer, status, lifecycle timestamps, quantities/meals reported, verification metadata.
- **pickup_tokens:** pickup, hashed token, expiry, consumed timestamp, audit timestamps.
- **notifications:** recipient, type, payload, read state, created timestamp.
- **reports:** reporter, related donation/pickup, category, description, status, admin resolution and timestamps.
- **audit_events (recommended):** actor, action, target type/ID, timestamp, safe metadata; never store raw pickup tokens or secrets.

The supplied prototype schema is the starting point. Migrations must be versioned, repeatable in development, and reviewed before production.

## 10. Non-functional requirements

- **Security:** RLS enabled for all user/application tables; least privilege; no service-role secret in browser bundle.
- **Reliability:** Atomic claim and state transitions; errors do not leave half-completed pickup state.
- **Performance:** Paginate marketplace/history; index status, deadline, donor, organization, and pickup relations used in frequent queries.
- **Accessibility:** Target WCAG 2.2 AA; keyboard support, visible focus, semantic landmarks, useful errors, sufficient contrast, reduced-motion support.
- **Responsive:** Mobile-first; no critical workflow requires a desktop-only interaction.
- **Localization:** UI strings separated from components; English/Hindi labels consistent for statuses and validation.
- **Maintainability:** TypeScript strictness where feasible, shared types, reusable UI, documented environment variables, lint/build/test scripts.
- **Observability:** Structured server/database errors without logging secrets or unnecessary personal data.

## 11. Acceptance criteria for MVP

1. A new user can register/login and receives only the requested non-admin role.
2. An unverified NGO cannot claim food; a verified eligible NGO can.
3. A donor can create a valid donation and only manage their own listings.
4. Public marketplace does not expose exact pickup address or private instructions.
5. Two concurrent claim attempts cannot reserve the same donation.
6. Expired listings cannot be claimed even if the expiry job has not run yet.
7. Only the donor and authorized collector can access relevant pickup details and verification flow.
8. Pickup token is single-use, expires, is validated server-side, and is never stored in plaintext.
9. Every state transition validates current state, actor, and eligibility.
10. Impact metrics derive from records, distinguish collected from distributed, and flag demo data.
11. Admin operations cannot be invoked by ordinary users and create auditable outcomes.
12. Main flows work at mobile and desktop breakpoints with loading, empty, success, and error states.
13. `npm run build` succeeds; automated tests cover authorization and claim race conditions before production release.
14. Setup instructions explain Supabase project configuration without asking users to expose service-role credentials.

## 12. Analytics and success measures

Track product events with privacy minimization: registration completed, organization verification requested/decided, donation published, donation viewed, claim succeeded/failed, pickup confirmed, delivery recorded, report submitted/resolved. Do not include exact addresses, tokens, or sensitive free text in analytics.

Operational measures: successful pickups, median time from publication to claim, expired-unclaimed rate, cancellation rate, verification turnaround, reported meals distributed, and unresolved safety reports. Label all data as demo until real-world operation is established.

## 13. Release plan

- **Phase 0 — Foundation:** repo setup, configuration validation, schema/migrations, RLS review, test harness.
- **Phase 1 — Core experience:** homepage, auth, role onboarding, marketplace, donor CRUD, localization and responsive states.
- **Phase 2 — Operations:** atomic claims, pickup assignment, private address access, pickup verification, status transitions, in-app notifications.
- **Phase 3 — Governance and impact:** admin verification/reports, metrics, charts, expiry job, audit trail.
- **Phase 4 — Hardening:** accessibility, security testing, concurrency tests, backup/restore plan, deployment checklist, monitoring.

## 14. Risks and open decisions

- Food-safety policy, eligibility rules, permitted holding times, and liability language need review by relevant local experts; the app must not invent legal/health guarantees.
- Define whether volunteers can be independent or must belong to a verified NGO.
- Define minimum organization evidence and re-verification cadence.
- Define which user can mark `delivered` and whether donor acknowledgement is required.
- Define retention/deletion policy for personal data, reports, and pickup history.
- Define production admin provisioning and break-glass process.
- Map/geocoding services may rate-limit; marketplace must still function without them.
- Email confirmation settings used for local demo must not automatically carry into production.

## 15. Implementation status (21 October 2026)

Status legend: **Done** = implemented and exercised by the automated suite in this repository;
**Partial** = implemented but with the stated limitation; **Pending** = not implemented.

| MVP acceptance criterion (§11) | Status | Evidence / notes |
|---|---|---|
| 1. Register/login; only requested non-admin role | Done | `src/pages/Register.test.tsx`; DB suite verifies `role=admin` metadata falls back to `donor` |
| 2. Unverified NGO cannot claim; verified one can | Done | DB suite (`workflow_and_rls.test.sql` §4) |
| 3. Donor creates listings; manages only own | Done | RLS policies + DB suite §3; edit-while-available added to the donor dashboard |
| 4. Public marketplace hides exact address/instructions | Done | Separate `donation_private` table, no public policies, DB suite §2, `DonationCard.test.tsx` |
| 5. Concurrent claims cannot double-book | Done (code + race harness) | Conditional `UPDATE` + `pickup_one_live_idx`; `npm run test:race` (requires local Supabase) |
| 6. Expired listing cannot be claimed pre-job | Done | Claim-time `pickup_deadline > now()`; DB suite §4 |
| 7. Only donor/authorized collector see pickup details | Done | `donation_private` policies; DB suite §5 |
| 8. Token hashed, expiring, single-use, server-validated | Done | `pickup_tokens` hashes + throttle; DB suite §6–7; SQL invariant tests |
| 9. Every transition validates state, actor, eligibility | Done | Guard triggers + workflow functions; DB suite §3–6 |
| 10. Impact from records, collected vs distributed, demo flagged | Done | `get_impact_stats`; DB suite §9; demo badge on cards/partners |
| 11. Admin operations restricted and audited | Done | `audit_events`; `admin_set_*` functions; DB suite §8 |
| 12. Mobile/desktop with loading/empty/success/error states | Partial | Existing responsive shells and states retained; new reset/edit/pagination states added; no formal device QA in this change |
| 13. `npm run build` succeeds; tests cover auth and claims | Done | Build green; 77 automated tests; database suites authored and syntax-verified (not executed here — no Docker) |
| 14. Setup without exposing service-role credentials | Done | `README.md`, `.env.example`, setup screen rejects secret keys |

Still pending or partial relative to the full PRD: external email/SMS/WhatsApp delivery (P1),
camera QR scanning (P1, explicitly a future enhancement), complete Hindi coverage of every
dashboard string, configured `pg_cron` schedule (code ready), image re-encoding on upload,
and formal WCAG/device audits.

New in this implementation: audited admin report resolution, report categories, password
reset, donor listing editing, marketplace pagination, and audit events for claims, tokens,
deliveries, verifications, suspensions and expiries.
