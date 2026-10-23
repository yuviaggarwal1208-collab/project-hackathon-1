# RescuePlate — Product & UI Design Specification

- **Product:** RescuePlate
- **Tagline:** Save Food. Feed People. Make Every Meal Count.
- **Purpose:** A trusted surplus-food coordination product for donors, verified NGOs, and authorized volunteers.
- **Design intent:** Warm, optimistic, clear, trustworthy, and operationally efficient. Avoid guilt-driven imagery or unverified impact claims.

## 1. Design principles

1. **Trust through clarity:** show verification status, food details, deadlines, and workflow state plainly.
2. **Urgency without panic:** use orange for imminent deadlines, not as a general decorative color.
3. **One primary action per context:** create listing, claim donation, verify pickup, or resolve report.
4. **Privacy by presentation:** public listing uses approximate area; exact address appears only after authorization.
5. **Accessible by default:** readable type, semantic forms, keyboard access, focus states, reduced motion.
6. **Real data is distinguishable:** demo records, sample testimonials, and seed impact are visibly labelled.

## 2. Visual language

### 2.1 Color tokens

Use CSS variables/design tokens rather than hard-coded colors in individual components. Values below are recommended starting points and should be contrast-tested before finalization.

| Token | Suggested value | Use |
|---|---|---|
| `--color-forest-900` | `#173D2B` | Main text on light backgrounds, deep brand areas |
| `--color-forest-700` | `#23613F` | Primary buttons, active navigation |
| `--color-forest-500` | `#3D8758` | Secondary accents, icons |
| `--color-cream-50` | `#FBF8F0` | Warm section backgrounds |
| `--color-white` | `#FFFFFF` | Cards, forms, main surfaces |
| `--color-charcoal` | `#262B28` | Body text |
| `--color-muted` | `#68736C` | Supporting text; check contrast |
| `--color-urgent` | `#D97706` | Near-deadline indicator and urgent actions |
| `--color-danger` | `#B42318` | Errors and destructive actions |
| `--color-success` | `#237A45` | Confirmed success, not general decoration |
| `--color-border` | `#E3E8E2` | Dividers, input borders |

Never communicate state by color alone. Pair status colors with text and/or icons.

### 2.2 Typography

- Use a highly readable sans-serif system font or a licensed web font with sensible fallbacks.
- Suggested scale: hero 44–60 px desktop / 34–40 px mobile; page title 30–36 px; section title 24–32 px; card title 18–22 px; body 16 px; helper/caption 13–14 px.
- Body line-height should generally be 1.5–1.7. Avoid long, wide text blocks.
- Do not use tiny labels for important deadlines, allergens, or safety information.

### 2.3 Shape, spacing, elevation

- Cards: 12–18 px radius, subtle border, restrained shadow.
- Inputs and buttons: 8–12 px radius, touch target at least 44 × 44 CSS px where practical.
- Use a consistent 4/8 px spacing scale.
- Keep shadows subtle; use borders and whitespace to create hierarchy.
- Animation should be brief and restrained; respect `prefers-reduced-motion`.

### 2.4 Iconography and imagery

- Use a consistent outline icon family (prototype uses `lucide-react`).
- Food photography should be authentic, appetizing, and respectful; avoid implying that sample images are real donations.
- Provide image alt text or mark decorative images appropriately.
- Empty/error states should use simple illustrations/icons without blocking action.

## 3. Information architecture and routes

Current prototype routes discovered in the supplied source:

- `/` — Homepage
- `/find` — Food marketplace
- `/impact` — Impact page
- `/login` — Login
- `/register` — Registration
- `/dashboard` — Role-based redirect
- `/dashboard/donor` — Donor dashboard
- `/dashboard/ngo` — NGO dashboard
- `/dashboard/volunteer` — Volunteer dashboard
- `/dashboard/admin` — Admin dashboard
- `/setup` — Supabase connection/setup screen (implementation-specific)

Navigation should expose only relevant destinations, while backend authorization remains authoritative. Do not rely on route hiding for security.

## 4. Page specifications

### 4.1 Homepage

**Goal:** Explain the product quickly and route visitors to donate or find food.

Recommended order:
1. Header: RescuePlate logo, Find Food, How It Works, Impact, language switcher, login/profile action; mobile menu.
2. Hero: “Good Food Deserves a Second Chance”, concise supporting copy, primary “Donate Surplus Food” and secondary “Find Available Food” actions.
3. How it works: donor publishes → verified NGO claims → authorized collector picks up → distribution is reported.
4. Available food preview: cards use real active data when configured; otherwise show clearly labelled demo cards.
5. Verified partners: only show genuinely verified organizations as verified; sample entries must be labelled demo.
6. Impact: actual database aggregates with methodology/definitions; demo metrics marked visibly.
7. Testimonials: explicit “Sample testimonial” labels until real, approved testimonials exist.
8. CTA and footer: contact, privacy, terms, safety guidance, navigation.

**States:** loading skeleton; no available listings; backend unavailable; demo mode; normal populated state.

### 4.2 Marketplace (`/find`)

- Search input with clear button and accessible label.
- Filter controls for category, diet, quantity, distance (only when location available), and pickup deadline.
- Sort control for nearest and earliest deadline when data supports it.
- List/map toggle when map dependencies work; map failure must not hide list results.
- Donation card hierarchy: image, title, quantity, category/diet, approximate area, deadline, handling summary, status, details/claim action.
- Urgency: show a clear “Pickup by” date/time and use orange only when deadline is near according to configurable threshold.
- Public view never displays exact street address or private pickup instructions.
- No-results state explains how to remove filters; expired/unavailable records are not claimable.

### 4.3 Authentication and onboarding

- Login and registration use the same visual shell and clear page title.
- Role selection offers donor, NGO, volunteer; admin is not a public registration option.
- NGO/donor organization onboarding explains that verification may be required before claiming or publishing, according to policy.
- Forms have labels, inline validation, server error summaries, password visibility control where appropriate, and pending states.
- Do not reveal whether an arbitrary email belongs to an account through overly specific reset/login errors.

### 4.4 Donor dashboard

- Summary cards: active listings, reserved, completed, expired/cancelled.
- Primary CTA: “Post surplus food”.
- Listing table/cards with deadline, status, quantity, claimant (when authorized), and next action.
- Create/edit form grouped into Food details, Quantity, Safety and handling, Pickup details, Availability, Image, Confirmation.
- Exact address can be edited by owner but must not be sent in public listing responses.
- Disable edits to protected workflow fields; explain why a reserved/picked-up listing cannot be freely changed.

### 4.5 NGO dashboard

- Overview of available donations, active pickups, completed history, and reported distribution.
- Clear verification status. Unverified NGO sees a helpful pending/rejected state and cannot claim.
- Active pickup detail includes exact address only after server-authorized claim.
- Claim CTA has loading state and handles race loss gracefully (“This donation was just reserved by another organization”).
- Distribution record is separate from pickup completion and must not be inferred from food quantity.

### 4.6 Volunteer dashboard

- Show only assignments authorized for the current volunteer.
- Assignment cards show time, status, food summary, and safe next action.
- Exact address/instructions are revealed only for assigned pickups.
- Pickup code entry/scanning interface explains expiry and one-time use. Prototype currently supports typing/pasting; camera scanning is a future enhancement.
- Delivery/handover action asks for confirmation and records the acting user/time.

### 4.7 Admin dashboard

- Overview metrics with definitions and demo labels.
- Verification queue: organization, submitted date, status, evidence summary, approve/reject/request-more-info actions.
- Reports queue: severity/category, related donation/pickup, state, triage and resolution notes.
- Destructive actions (suspend/reject) require confirmation and clear consequence text.
- Admin pages must be protected by server-enforced role checks; client-only visibility is insufficient.

### 4.8 Impact page

- Distinguish: food collected (kg), portions collected, successful pickups, active donors, verified NGOs, meals reported distributed.
- Provide a short “How we calculate impact” explanation.
- Do not combine kilograms, portions, and meals into one number.
- Charts support daily/weekly/monthly views with accessible text alternatives or data summaries.
- Mark demo/seed records and show whether the current totals include them.

## 5. Shared component inventory

Prototype already includes components such as `Navbar`, `Footer`, `Logo`, `DonationCard`, `StatusBadge`, `PageHeader`, `AuthShell`, `ProtectedRoute`, `ConfirmDialog`, `Spinner`, `LocationButton`, `MapView`, `NearbyRestaurants`, `LanguageSwitcher`, `ThemeToggle`, `ConnectionGate`, and `SetupScreen`.

Preserve/reuse components where their responsibilities are clear. Refactor duplicated state, validation, or authorization assumptions into shared hooks/services rather than duplicating business logic in pages.

Recommended shared patterns:
- `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Dialog`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `PageContainer`.
- `DonationCard`, `DonationStatusBadge`, `DeadlineBadge`, `VerificationBadge`, `MetricCard`.
- `DonationForm`, `PickupTimeline`, `SafetyInformation`, `ReportIssueDialog`.

## 6. Interaction and state design

Every async action should support:
- Idle state.
- Pending/loading state with duplicate submission prevented.
- Success confirmation.
- Recoverable error with a useful next step.
- Empty state where lists have no data.
- Offline/backend unavailable state where appropriate.

Confirm before cancellation, suspension, rejection, and other destructive/irreversible actions. Use optimistic updates only when rollback and conflict handling are well-defined. For claims and workflow transitions, wait for server confirmation.

## 7. Accessibility and localization

- Target WCAG 2.2 AA.
- Use semantic headings, landmarks, labelled controls, visible keyboard focus, logical tab order, and accessible dialog focus management.
- Announce async success/errors through an appropriate live region.
- Ensure contrast for text, status badges, focus rings, and disabled controls.
- Provide meaningful alt text; avoid conveying important information only in imagery.
- Support keyboard alternatives for map-only interactions.
- Respect reduced-motion preferences.
- Centralize English/Hindi strings and avoid concatenating translated fragments. Localize date/time and quantity formatting consistently.

## 8. Responsive behavior

- Mobile-first layouts; one-column cards and forms on narrow screens.
- Filters collapse into a drawer/sheet on small screens, with active-filter count and “Clear all”.
- Tables become stacked cards or horizontally accessible structures on mobile.
- Keep primary actions reachable without horizontal scrolling.
- Map is an enhancement; list view remains usable on small screens and with location disabled.

## 9. Design QA checklist

- [ ] Desktop, tablet, and mobile layouts reviewed.
- [ ] Keyboard-only navigation works for all primary journeys.
- [ ] Focus is visible and dialogs restore focus on close.
- [ ] Form labels, validation, and server errors are understandable.
- [ ] Urgent deadlines are communicated with text, not color alone.
- [ ] Public cards do not leak exact addresses.
- [ ] Demo statistics and testimonials are labelled.
- [ ] Map/provider failure does not block marketplace.
- [ ] English/Hindi switching covers key workflows.
- [ ] Loading, empty, error, success, and disabled states are designed.

## 10. Implementation notes (21 October 2026)

UI additions and refinements made while closing the specification gaps:

- **Password reset** (`/reset`): the login page now exposes “Forgot password?”, which sends a
  Supabase recovery email with a `/reset` redirect. The reset page explains when the link is
  missing or expired and uses the same `AuthShell` visual language. Error copy avoids
  revealing whether an email belongs to an account.
- **Donor listing editing**: the “Post surplus food” form is reused for editing while a
  listing is `available`. Heading and primary button change (“Edit …”, “Save changes”), the
  existing image is preserved unless replaced, and reserved/completed listings explain why
  they cannot be edited.
- **Marketplace pagination**: results render 24 at a time with a “Show more (N remaining)”
  button; filters and location changes reset the page. Filter captions support the map view
  and list view equally.
- **Reports**: the report dialog now includes a concern-type select (unsafe food, misleading
  listing, pickup problem, other). The admin queue shows the category chip so triage has
  context without exposing private addresses.
- **Honest demo labeling**: verified partner names on the homepage carry the same
  “Demonstration data” badge as demo listings, so seeded organizations are never presented
  as real partners.
- **Admin report resolution** uses an audited server operation; the UI confirms success with
  a toast and refreshes the queue.
- **Accessibility cues preserved**: status is always text + badge, deadlines pair colour with
  remaining-time text, dialogs keep focus management via the native `<dialog>` element, and
  all new controls have visible labels.

Known design follow-ups: filter drawer on small screens (filters currently wrap into the
sticky toolbar), full Hindi coverage of dashboard-only copy, and chart table alternatives for
screen-reader users beyond the existing text summary and `role="img"` label.
