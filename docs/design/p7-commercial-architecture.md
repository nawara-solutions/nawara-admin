# P7 — Licenses, entitlements and subscriptions (Commercial architecture)

- **Status:** P7-0 discovery reviewed; decisions D1–D9 approved 2026-10-24. **P7-S1 implemented** 2026-10-24 as a
  development-only, mock-first prototype (`/licenses`, read only). P7-S2 and P7-S3 not started; **P7-S4 blocked** on Core
  contract verification. No Core HTTP integration.
- **Baselines:** Admin `main` `6b30c7b` (P6-S4, PR #34). Core was not read: every Core fact here comes from
  [`../CORE-INTEGRATION.md`](../CORE-INTEGRATION.md) §5–§7.
- **Canvas:** https://claude.ai/artifact/Krg8QrAeHKKWgNCo6F8tsM (9 artboards; private, may expire). This text prevails.

## 1. Source inventory (before P7)

| Area | Where | What exists |
|---|---|---|
| Records | `demo/world/records.ts` | `OrganizationSubscriptionRecord { organizationId, endsAt }` (at most one per Organization; none = no subscription); `PaymentIssueRecord { id, organizationId, kind }`; `PlatformCommercialRecord { platformId, personalPremium (declared count), assistedPayments }`; `OrganizationRecord.assistedPayments` |
| Seed | `demo/world/seed.ts` | 24 Organizations (School 16, Drive 8); 21 subscriptions: 20 active, 1 ended 6 h ago (grace), 3 none; 4 active ending within 14 days; 2 payment issues; Personal Premium 21 / 9 |
| Selectors | `demo/world/selectors.ts` | `subscriptionStateOf` (active / grace 24 h / none), `subscriptionsEndingWithin`, `paymentIssuesOf`, `platformCommercialOf`, `assistedPaymentsOf` |
| Views | Company Overview (`CommercialSummaryGateway`), Platform dashboard (`PlatformCommercialGateway`), Organizations (`OrganizationCommercialGateway`, directory subscription filter) | all owner only, mock in demo builds |
| Navigation | `layout/sidebar/navigation.ts` | Commercial: "Licenses & entitlements", "Billing & payments" (placeholders before P7-S1) |

## 2. Core readiness

| Capability | Core (per Admin docs) | Admin |
|---|---|---|
| Owner read of Organization subscriptions | 🟡 none before V2 A10 | mock (P7-S1); **CF-36 proposed** |
| Entitlement state (valid, expiresAt) | 🟡 Billing-owned, service-token read only | derived from the subscription record; **CF-37 proposed** |
| Grace period | 🟡 V2 architecture: 24 h, entitled during grace | kept (`SUBSCRIPTION_GRACE_HOURS`) |
| Plan catalog, prices | 🟡 Billing owns; no owner read | not shown; **CF-38 proposed** |
| License / seat allocation | 🔴 no `License` entity (ADR-0044) | not shown; **CF-42 proposed** (decision) |
| Personal Premium | 🟡 per person, no grace; no aggregate read | declared per-Platform count only; **CF-39 proposed** |
| Invoices, attempts, settlement, refunds, disputes | 🟡 payer-only routes / 🔴 | not in P7-S1; **CF-40 proposed** |
| Create / renew / extend / end a subscription | 🔴 staff commercial mutations excluded from V1 (ADR-0050 D12) | none offered; **CF-41 proposed** |

## 3. Domain boundaries

- **Membership** (Auth): belonging to an Organization. Never paid access.
- **Subscription state** (Billing): `active`, `grace` (ended < 24 h ago), `none`. A grace subscription is **not** active.
- **Entitlement** (Billing): entitled now = active, or grace (temporarily). Derived (`entitlementOf`), never stored.
- **Timeline:** when an active subscription ends; when a grace period ends.
- **Personal Premium:** a person's own subscription in a product; only a per-Platform count; never added to Organization
  subscriptions; unrelated to memberships.
- **Invoices** (Billing), **payment attempts** and **settlement** (Payment), **refunds**, **disputes**: separate facts.
  An attempt is never revenue. No figure in P7 counts people or customers.

## 4. Authorization

| | Owner | Operator (any assignments) | Non-demo build |
|---|---|---|---|
| `/licenses` | read (demo) | no nav entry; route guard → `/forbidden`; facade calls no gateway; mock `403` | "Not available in this build" |
| Any commercial change | none | none | none |

Capability `company.commercial.view` (owner only). Commercial authority is never derived from Platform assignments or
memberships.

## 5. Decisions (approved 2026-10-24)

- **D1** Keep the navigation name "Licenses & entitlements"; content says "subscription" and "entitlement"; the Company
  Overview card's "Active licenses" becomes "Active subscriptions" (field `activeSubscriptions`) and links to `/licenses`.
- **D2** Grace entitles temporarily; it is shown apart from active and never counted as active.
- **D3** Catalog, allocation, history, revenue: "not available", never mocked with invented plans, prices or seats.
- **D4** The Organization subscription (P7-S2) becomes a section of the Organization detail.
- **D5** Billing & payments (P7-S3): payment follow-ups only, no amounts.
- **D6** No commercial mutation; no disabled-button gallery (one short "Not available yet" section instead).
- **D7** Owner-only `company.commercial.view`.
- **D8** Personal Premium: per-Platform count only.
- **D9** S1 → S2 → S3; S4 blocked on Core.

## 6. P7-S1 as built

- **Selectors** (`demo/world/selectors.ts`): `entitlementOf(world, org, now)` → `entitled | entitledInGrace |
  notEntitled`; `subscriptionDistribution(world, organizations, now, days)` → `{ organizations, active, grace, none,
  endingSoon, entitled }`. The Company Overview's commercial summary now derives from the same distribution.
- **Feature** `features/licenses/`: `LicensesOverview` model; abstract `LicensesGateway.overview(company)`;
  `MockLicensesGateway` (owner only: `401` without a session, `403` for anyone else, `404` for another Company;
  scenarios `normal`, `empty`, `error`); `UnavailableLicensesGateway` in every other build; `LicensesFacade` (owner
  only, no gateway call otherwise; reloads on `ScopeContext.revision`); `LicensesPage`.
- **Page:** header with the Demo data badge; provisional note; five figures (Organizations 24, Active 20, In grace 1, No
  subscription 3, Ending soon 4); "Entitled now: 21 of 24 (20 active, 1 in grace)"; by-Platform table (School 16 / 13 /
  1 / 2 / 3 / 14 / Personal Premium 21; Drive 8 / 7 / 0 / 1 / 1 / 7 / 9) with Platform links; "Needs attention" (grace
  first, then ending within 14 days) linked to each Organization; what the states mean; one "Not available yet" section
  (plans, allocation, changes, revenue) with no control. Loading, empty, error (retry), forbidden and not-in-build
  states.
- **Route** `/licenses` (shell, `capabilityGuard('company.commercial.view')`); demo domain `licenses`; sidebar entry
  live; production marker `LICENSES_DEMO_SCENARIO`.

## 7. Later slices

- **P7-S2** one Platform's subscriptions (`/licenses/platforms/:platformId`: state, ending-soon and search filters,
  sort) and the Subscription section of the Organization detail.
- **P7-S3** `/billing`: payment follow-ups (no amounts) and unavailable invoices, settlement, refunds, disputes.
- **P7-S4 — BLOCKED BY CORE:** catalog, renewals, extensions, plan changes, Personal Premium detail, revenue; only after
  Core V2 A10/A11 publishes owner contracts (CF-36 to CF-42) and they are verified.

## 8. Acceptance (P7-S1)

- Automated: exact seeded counts; `active + grace + none = organizations` per Platform and Company; entitled = active +
  grace; grace ends at exactly 24 h; attention order; Personal Premium unchanged by memberships and independent of the
  subscriptions; owner only (guard, facade, mock `403`/`401`/`404`); production binds the unavailable adapter; the
  gateway has no change method; the page has no control beyond links (and retry in the error state); agreement with
  the Company Overview, the Platform dashboards and the Organization directory (`consistency.spec.ts`).
- Browser: EN/FR/AR, RTL, light/dark/system, 1440/834/390/320, keyboard; operator direct URL forbidden; links reach
  the Platform dashboard and Organization detail. Results in the PR.

## 9. Risks and proposed Core follow-ups

CF-36 to CF-42 in [`../CORE-INTEGRATION.md`](../CORE-INTEGRATION.md) §9, all **proposed**, none an existing endpoint.
Risks: "license" wording suggests seats Core lacks (mitigated by D1 and the explanation); demo figures read as real
(Demo data badge, provisional note); grace semantics come from the V2 architecture, not a published contract; no
pagination exists for any future owner list.
