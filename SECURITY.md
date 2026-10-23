# RescuePlate — Security Requirements and Threat Model

## 1. Purpose

This document defines minimum security requirements for the RescuePlate prototype and production MVP. Food logistics, personal contact information, exact pickup locations, organization verification, and one-time pickup credentials make authorization and data minimization essential.

**Important:** this is a security design specification, not a penetration-test report or a certification. Claims in the prototype README must be verified against the actual schema, grants, functions, and deployed configuration before production use.

## 2. Security objectives

1. Only authenticated, eligible actors can perform role-specific actions.
2. A user cannot elevate their role, bypass verification, or un-suspend their account.
3. Exact addresses and private instructions are available only to authorized participants.
4. One donation cannot be claimed twice; workflow transitions cannot be forged.
5. Pickup tokens remain confidential, short-lived, single-use, and server-validated.
6. Unsafe-food reports and administrative decisions remain private and auditable.
7. Secrets, personal information, and tokens are not leaked through frontend bundles, logs, analytics, or errors.
8. Data integrity and impact totals resist accidental or malicious double-counting.

## 3. Assets and trust boundaries

### Assets
- Auth sessions and identity records.
- Role, suspension, and organization verification state.
- Public donation listings and private pickup address/instructions.
- Pickup assignments, lifecycle records, and verification tokens.
- Food images and uploaded evidence.
- Reports, admin decisions, notification content, and audit trail.
- Impact metrics and the distinction between collected and reported-distributed quantities.
- Supabase project credentials, database credentials, provider secrets, and deployment configuration.

### Trust boundaries
- Unauthenticated public browser ↔ public APIs/data.
- Authenticated client ↔ database/RLS.
- Client-provided values ↔ trusted database functions/server operations.
- Public donation fields ↔ private address/instructions.
- Regular user ↔ admin-only operations.
- Application ↔ third-party mapping/geocoding/notification providers.
- Demo environment ↔ production environment.

Assume all client-side inputs and browser state can be modified by an attacker.

## 4. Threat model and mitigations

| Threat | Example | Required mitigation |
|---|---|---|
| Privilege escalation | User submits `role=admin` during registration | Server/database-controlled role assignment; reject admin role from public registration; restricted admin provisioning |
| IDOR / broken access control | NGO changes a donation ID to read another pickup address | RLS policies based on authenticated identity, organization, and assignment; negative authorization tests |
| Address disclosure | Exact address appears in public marketplace API response | Separate private table/view; public queries return only approximate area/coordinates; verify network payloads |
| Duplicate claim race | Two NGOs click claim simultaneously | Atomic DB function/transaction and unique invariant; concurrency tests |
| Workflow forgery | Client directly sets donation to delivered | Deny direct status updates; enforce allowed transitions in restricted server/database function |
| Token theft/replay | Pickup code reused after successful collection | Hash-at-rest, short expiry, atomic one-time consumption, rate limiting, no raw-token logs |
| Account abuse | Suspended user continues to claim donations | Every sensitive operation re-checks suspension state server-side |
| Unsafe listing | Incorrect handling/allergen details | Required fields, clear safety acknowledgement, report mechanism, no automatic safety guarantee, admin review process |
| Upload abuse | Oversized or disguised executable uploaded as image | Allowlist MIME/extensions, size limits, validate actual file where feasible, random object paths, storage policies |
| XSS/injection | Untrusted description renders as HTML | Render as text, avoid unsafe HTML injection, validate input, use framework escaping |
| Data leakage in logs | Address, token, or report text written to analytics | Structured redacted logging; no raw tokens; minimize sensitive metadata |
| Misleading impact | Demo records shown as real totals | Demo flags, explicit labels, exclude demo by default in production metrics |
| Abuse/DoS | Repeated token guesses or claim attempts | Rate limits, bounded queries, indexes, generic errors, monitoring |
| Third-party outage | Map service unavailable | Timeout/fallback; map is non-critical; do not retry aggressively |
| Secret exposure | Service-role key in `VITE_*` variable | Client bundle contains publishable key only; secret scanning; rotation procedure |
| Admin misuse | Verification/suspension without accountability | Explicit admin checks, audit events, confirmation UI, least privilege, periodic review |

## 5. Authentication and account lifecycle

- Use Supabase Auth; require secure session handling and approved redirect URLs.
- Configure email verification/password reset according to deployment policy. Any relaxed email-confirmation setting is for local demo only, not production default.
- Public registration can request donor/NGO/volunteer role only. Role eligibility and verification are separate states.
- Create profile records through a controlled trigger or server-side flow that does not trust arbitrary metadata for privileged fields.
- Admin role must be provisioned by a restricted operator workflow, not public registration, client updates, or editable user metadata.
- Sensitive operations must check that the user is authenticated, active/not suspended, and currently eligible.
- Provide account recovery and eventual account deletion/deactivation policy; do not silently orphan pickup/audit records.

## 6. Authorization and RLS requirements

Enable RLS on every application table containing user or operational data, including profiles, organizations, donations, donation-private data, pickups, pickup tokens, notifications, reports, and any audit table. Apply storage policies to image/evidence buckets.

Policy principles:
- **Default deny:** no policy means no access; do not add broad `USING (true)` policies to private tables.
- **Profiles:** user can read their own profile and update only explicitly allowed non-privileged fields. Role, suspension, and organization link must not be user-editable unless mediated by a safe, validated function.
- **Organizations:** owners can access their own organization; public can read only fields/status for verified organizations intended for public display; admin decisions are restricted and audited.
- **Donations:** public access only to fields safe for public discovery and only for appropriate statuses. Donor access is limited to own records. NGO/volunteer access depends on authorized pickup relationships. Admin access is explicit.
- **Donation private details:** donor and authorized active pickup participants only; unrelated NGO/volunteer and public users denied.
- **Pickups:** donor, claimant NGO, assigned volunteer, and admin as required; each relationship must be validated against canonical foreign keys.
- **Pickup tokens:** clients should not be able to list token hashes or freely insert/update token state. Expose narrow functions to create/verify/consume tokens.
- **Notifications:** users can read/update read state only for their own notifications; clients cannot forge another user’s notification.
- **Reports:** reporter can create/read their own reports; only authorized admin can review/change resolution fields.
- **Storage:** public read only if food-image visibility is intentional; uploads/deletes scoped to owner and expected bucket/path. Private evidence should use a private bucket and signed URLs only after authorization.

Review table grants and function `EXECUTE` permissions in addition to policies. RLS is not a substitute for safe grants, constraints, or function design.

## 7. Database function security

For claim, status transition, admin verification/suspension, token verification, and other privileged operations:
- Validate caller identity using trusted auth context; never accept a user ID as proof of identity.
- Validate role, suspension, organization verification, record ownership/assignment, current state, and deadlines.
- Use transactions and row locks/conditional updates for state changes.
- Make repeated requests idempotent where safe; otherwise return explicit conflict.
- If using `SECURITY DEFINER`, set a fixed safe `search_path`, fully qualify object names, minimize owner privileges, revoke default execution from `PUBLIC` as appropriate, and grant only to intended roles.
- Do not return private records or token hashes in function responses.
- Create audit events in the same transaction for sensitive decisions when possible.
- Add database constraints for valid quantities, enums/status values, foreign keys, uniqueness, and timestamp consistency.

## 8. Pickup-token requirements

- Generate a cryptographically strong, unpredictable token in a trusted context.
- Store only a cryptographic hash, never plaintext.
- Bind the token to a single pickup and expected action/context.
- Expire after a short interval (prototype target: 15 minutes); check expiry at consumption time.
- Consume atomically so parallel requests cannot reuse it.
- Rate-limit failed attempts and avoid revealing whether a token, pickup, or other user exists.
- Require authenticated and authorized donor/collector context independently of token possession.
- Do not put tokens in analytics, URLs that may be logged/shared, crash reports, or application logs.
- Provide invalid/expired/used states without exposing sensitive pickup details.

## 9. Location and personal data

- Ask for browser geolocation only after an explicit user action and handle denial gracefully.
- Store only the location precision needed for each purpose.
- Public listing must use approximate location (prototype README describes rounding to roughly 1 km); exact address belongs in private data.
- Do not send exact addresses to public map markers, analytics, error trackers, or public API responses.
- Display exact address only to the donor and authorized claim participants according to policy.
- Minimize phone/contact exposure and do not make private contact data publicly searchable.
- Document purpose, retention, correction/deletion, and consent for personal data in a privacy notice before production launch.

## 10. Food safety and incident reporting

- Record preparation time, storage/handling information, known allergens, pickup deadline, and donor acknowledgement.
- The acknowledgement must not be represented as independent inspection or certification.
- Claim operations reject expired listings regardless of background expiry-job health.
- Provide a report-unsafe-food path with access limited to the reporter and authorized administrators.
- Define severity, triage owner, response SLA, and escalation process before real-world launch.
- Preserve a reliable audit trail for pickup and incident investigations while minimizing unnecessary sensitive data.

## 11. File upload security

- Limit upload size and allow only intended image formats.
- Validate extension, declared MIME type, and actual file signature where feasible.
- Use generated object names rather than trusting user filenames.
- Do not allow executable content or arbitrary SVG/HTML unless safely sanitized and intentionally supported.
- Apply storage policies for upload, read, and delete. Check ownership in the database as well as object path.
- Consider image metadata stripping to remove embedded GPS/EXIF information.
- Set caching and access rules intentionally; private verification documents must not share public food-image policies.

## 12. Secrets and configuration

- Frontend may use only the Supabase project URL and publishable/anon key.
- Never ship service-role keys, database passwords, JWT signing secrets, webhook secrets, or provider API secrets to the browser.
- Never commit `.env`, real credentials, personal data fixtures, or production exports.
- Add `.env.example` containing placeholders only and ensure `.gitignore` excludes local secrets.
- Validate environment configuration at startup and display safe, actionable errors.
- Use separate Supabase projects/credentials for development, staging, and production.
- Rotate any key that has been committed, pasted into an untrusted location, or exposed in a client bundle; deleting the file alone is not sufficient.

## 13. Logging, monitoring, and response

- Log security-relevant actions: admin decisions, role/verification changes, claim conflicts, pickup completion, token failures, report resolution, and suspicious repeated requests.
- Use actor ID, target ID, action, timestamp, and minimal safe metadata; avoid exact addresses, token values, credentials, and full report text.
- Monitor repeated failed token checks, unusual claim behavior, unexpected admin actions, and elevated error rates.
- Define incident severity, contact, containment, credential rotation, evidence preservation, and user notification process.
- Keep logs access-controlled and retention-limited.

## 14. Security test plan

Before production, automated tests must prove at least:

1. Anonymous user cannot read private addresses, pickup records, reports, or tokens.
2. Donor A cannot read/update Donor B’s private or mutable records.
3. Public registration cannot create an admin profile.
4. User cannot change their own role, suspension state, or verification state.
5. Unverified NGO and suspended account cannot claim.
6. Two concurrent claim attempts yield exactly one successful active claim.
7. Client cannot directly bypass the valid donation/pickup state machine.
8. Unassigned volunteer cannot read pickup address or instructions.
9. Expired listing cannot be claimed even if status still says available.
10. Expired or consumed pickup token cannot be reused; parallel consumption succeeds at most once.
11. User cannot read/update another user’s notifications or reports.
12. Storage policy prevents unauthorized upload/delete and private evidence access.
13. Impact aggregation does not double-count pickups and clearly handles demo data.
14. Browser production bundle and source maps contain no service-role or provider secrets.
15. XSS-like donation descriptions are rendered as text and do not execute.

Run tests against an isolated non-production project. Test RLS with multiple real test identities, not only an admin client.

## 15. Production launch checklist

- [ ] RLS enabled and policies reviewed for every application table.
- [ ] Table grants and function execute permissions reviewed.
- [ ] All privileged functions reviewed, including `SECURITY DEFINER` and search path.
- [ ] Admin provisioning procedure is restricted and documented.
- [ ] Auth email confirmation, redirect URLs, and password recovery configured intentionally.
- [ ] No service-role/database/provider secret in frontend bundle or repository.
- [ ] Exact-address isolation verified through API/network tests.
- [ ] Claim concurrency and token replay tests pass.
- [ ] Expiry job configured, monitored, and idempotent; claim-time deadline check exists.
- [ ] File upload constraints and storage policies reviewed.
- [ ] Demo data excluded or explicitly labelled in all impact surfaces.
- [ ] Error logging redacts personal data and secrets.
- [ ] Backups, restore test, monitoring, incident response, and retention policy documented.
- [ ] Food safety and privacy language reviewed for the actual deployment jurisdiction.

## 16. Prototype-specific caution

The supplied README states that RLS limits tables, role/verification/status changes use server-side SQL functions, claims are atomic, and pickup codes are hashed and single-use. Treat these as intended design claims until confirmed through schema/function review and tests. In particular, inspect `supabase/schema.sql`, every function's grants, RLS policy behavior, storage policies, and the `make_admin.sql` workflow before using real users or real pickup addresses.

## 17. Implementation verification status (21 October 2026)

This section records what is implemented and how it is verified. It is not a penetration-test
report or certification.

### Implemented hardening in this change

- **Audit trail** (`audit_events`): append-only, admin-readable, no client write policies.
  Workflow functions write claims, pickup-token creation/rejection/consumption, deliveries,
  expiries, organization verification, account suspension/restoration, report resolution and
  admin provisioning. Metadata rejects token-like keys.
- **Token guess throttling**: `pickup_token_attempts` (no RLS policies) tracks failures per
  authenticated caller; 10 failures in 15 minutes locks verification for 15 minutes. A
  successful verification clears the counter.
- **Suspension re-checks** inside `confirm_pickup`, `complete_delivery` and
  `create_pickup_token`, in addition to role helpers that already exclude suspended users.
- **Suspended donors**: their listings can no longer be claimed.
- **Report governance**: `reports.category` added; clients can no longer update report status
  directly (policy removed); `admin_set_report_status` is the audited path.
- **Admin safeguards**: administrators cannot suspend themselves; admin provisioning writes
  an audit event; `make_admin.sql` validates the email and warns that it is local/demo-only.
- **Expiry job** notifies donors and claiming NGOs and is audited; claim-time deadline checks
  remain authoritative.
- **Storage upload allowlist**: owner-folder path plus generated-UUID `.jpg/.jpeg/.png/.webp`
  filenames; the client validates MIME type and a 5 MB limit.

### Automated evidence

| Requirement (§14) | Covered by |
|---|---|
| 1. Anonymous cannot read private addresses, pickups, reports, tokens | DB suite §2 |
| 2. Donor A cannot read/update Donor B records | DB suite §3 |
| 3. Public registration cannot create an admin | DB suite §1 + `Register.test.tsx` |
| 4. Users cannot change own role/suspension/verification | DB suite §3 + guard-trigger invariant tests |
| 5. Unverified/suspended NGO cannot claim | DB suite §4 |
| 6. Concurrent claims yield exactly one active claim | `npm run test:race` (two connections) + DB suite §4 |
| 7. Client cannot bypass the state machine | DB suite §3/§6 + guard-trigger invariant tests |
| 8. Unassigned volunteer cannot read address/instructions | DB suite §5 |
| 9. Expired listing cannot be claimed | DB suite §4 |
| 10. Expired/consumed token cannot be reused | DB suite §6–7 |
| 11. Notifications/reports isolation | DB suite §8 |
| 12. Storage policy restrictions | Reviewed; not covered by an automated storage test |
| 13. Impact aggregation does not double-count; demo handled | DB suite §9 |
| 14. Bundle contains no service-role secret | Setup screen rejects secret keys (`supabase.test.ts`); build output contains only the configured publishable key |
| 15. XSS-like descriptions render as text | React text rendering; no `dangerouslySetInnerHTML` in the codebase |

### Verification limits (honest status)

- `npm test` (77 tests) and `npm run build` pass in this environment.
- The database suites (`supabase/tests/workflow_and_rls.test.sql`, `scripts/claim-race-test.mjs`)
  were authored and syntax-verified with libpg_query, but **were not executed here** because no
  Docker/Supabase/Postgres runtime was available. Run them against a local stack before any
  production release and treat the DB-level claims as unproven until then.
- No penetration test, load test, or third-party security review has been performed.
- Storage policy behaviour must be verified in a real Supabase project.
- Production admin provisioning, key rotation, backups, monitoring and incident response
  remain operational tasks outside the application code.
