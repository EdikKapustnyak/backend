# ADR-0001: Payments & Subscriptions

**Status:** Accepted (Decision Area 1 confirmed: Stripe; Areas 2 and 3
implemented using this ADR's proposed numbers/behavior - see Action Items
for what's still open)
**Date:** 2026-07-13
**Deciders:** kapusta (project owner)

## Context

`Company.subscriptionPlan` (`basic` / `business` / `enterprise`) and
`Company.status` (`active` / `suspended`) already exist in the schema, but
neither is wired to anything technical today — every tier behaves
identically, and nothing currently transitions `status` away from
`active` except a manual DB edit. `authService.login()` already checks
`company.status !== ACTIVE` and blocks the login with a 403, so the
*mechanism* for "this company can't use the product right now" already
exists — payments would extend it, not invent it from scratch.

Already agreed (not open for this ADR): subscription periods of 1, 3, 6,
and 12 months.

Three things are genuinely undecided and are what this ADR is for:

1. Which payment provider.
2. What a tier technically restricts.
3. What happens when a payment fails or a subscription lapses.

Constraints shaping all three: this is a solo/small-team project (no
in-house finance or legal function), the target customers are small
businesses (coffee shops, restaurants, retail, small manufacturers — see
`PROJECT_DESCRIPTION.md`), the stack is Node/Express/TS/MongoDB, and
there's no frontend yet, so whatever is decided here needs a clean API
surface for a frontend that doesn't exist yet to build against.

---

## Decision Area 1: Payment provider

### Option A: Stripe Billing

| Dimension | Assessment |
|---|---|
| Complexity | Medium — mature Node SDK, well-documented webhooks, but you own tax/VAT logic (or pay extra for Stripe Tax) |
| Cost | ~2.9% + 30¢ per transaction (lower than MoR options) |
| Compliance burden | You are the seller of record — you register for VAT/sales tax in every jurisdiction you cross a threshold in |
| Team familiarity | Highest — most tutorials, most Stack Overflow answers, most AI-assistant training data |
| Scalability | Excellent, industry standard for SaaS billing |

**Pros:** cheapest per-transaction fee, most flexible checkout/billing UX, best docs, easiest to find help.
**Cons:** you (not Stripe) are legally the seller — cross-border VAT/sales-tax registration and remittance becomes your problem as revenue grows across countries.

### Option B: Paddle / Lemon Squeezy (Merchant of Record)

| Dimension | Assessment |
|---|---|
| Complexity | Medium — similar SDK shape to Stripe, fewer knobs |
| Cost | ~5% + fees (roughly double Stripe's) |
| Compliance burden | Near zero — they are the legal seller, they handle VAT/sales tax globally |
| Team familiarity | Lower, but the integration surface is small |
| Scalability | Good, but you're trading margin for simplicity |

**Pros:** removes the single biggest hidden cost of selling SaaS across borders as a small team — you never touch VAT registration.
**Cons:** materially higher fee; less flexible checkout customization; smaller ecosystem than Stripe's.

### Option C: A regional-only processor (e.g. Vipps)

Only makes sense if the real go-to-market is a single country, not the
general "small businesses" market the project description implies.
Not analyzed in depth here — flagging it because it's the one option
that depends on information this ADR doesn't have (is there a specific
country you're launching in first?). If yes, this is worth a follow-up.

### Recommendation

**Stripe Billing**, with Paddle as the explicit fallback if, once you're
actually invoicing customers in 2–3 countries, VAT paperwork becomes a
real time sink. Stripe is the safer default for a small team specifically
*because* of how well-trodden it is — the debugging cost of an obscure
Paddle webhook edge case with less community precedent is a real cost
too. This isn't a irreversible choice: both are behind the same internal
billing-service interface (see Consequences), so switching later is a
contained change, not a rewrite.

---

## Decision Area 2: What a tier technically limits

### Option A: Feature-gating only

Basic/Business/Enterprise unlock features (e.g. AI assistant, PDF
reports), not resource counts. Simplest possible enforcement — one
`requireFeature('ai')`-style middleware checking a static
plan→feature-set map.

**Pros:** trivial to implement and reason about; no counting queries.
**Cons:** a single-location shop and a 40-location chain pay the same if
both pick the plan that unlocks what they need — pricing doesn't track
value delivered or infrastructure cost.

### Option B: Resource-count limits only

Basic/Business/Enterprise cap warehouses, products, and/or users.
Nothing is feature-gated; every company gets every feature.

**Pros:** pricing scales with actual usage (and your MongoDB storage/
compute cost, which scales with the same numbers).
**Cons:** doesn't let you reserve the AI features (your highest marginal
cost, since they call a paid-by-usage Anthropic API key) for higher tiers
— everyone gets unlimited AI calls regardless of plan.

### Option C: Hybrid — resource limits + feature gates

Soft caps on warehouses/products/users **and** hard gates on the AI
assistant + local-events features specifically (your only per-call
external cost). This is the shape almost every real SaaS pricing page
uses (a free/cheap tier with small numeric limits, a paid tier that both
raises the limits and unlocks the expensive features).

**Illustrative starting numbers** (a product decision, not an engineering
one — treat these as a first draft to argue with, not a conclusion):

| | Basic | Business | Enterprise |
|---|---|---|---|
| Warehouses | 1 | 5 | Unlimited |
| Users | 3 | 15 | Unlimited |
| AI assistant (waste analytics, local events) | ❌ | ✅ | ✅ |
| PDF reports | ✅ | ✅ | ✅ |

### Recommendation

**Option C (hybrid).** It's the pattern customers already expect from
SaaS pricing, and it specifically protects the one cost center that
scales with usage in a way you don't control per-company
(`ANTHROPIC_API_KEY` spend) by keeping it out of the cheapest tier.
Mechanically, this is cheap to build on what already exists: every
resource-count check is a `countDocuments({ companyId })` your
repositories already have a pattern for (and which the new
`tenantScopePlugin` now requires to be tenant-scoped anyway), and feature
gates are a small middleware next to the existing `requireRole`.

---

## Decision Area 3: Failed payment / subscription lapse behavior

### Option A: Immediate hard lock

The moment a charge fails or the period ends, block all API access
except billing endpoints.

**Pros:** simplest to build — `status !== ACTIVE` already does this at
login (see Context); extending it to every request is a small middleware
addition.
**Cons:** harsh for the actual failure mode that's most common — an
expired/reissued card, not a customer trying to avoid paying. Locking a
coffee shop out of its inventory system mid-shift over a card that
expired last week is the kind of thing that generates a support ticket
and a cancellation, not a payment.

### Option B: Grace period with degraded (read-only) access

On payment failure: mark the company `past_due`, keep data readable, but
block all writes (purchases, write-offs, inventarizations, etc.) and
surface a persistent warning. After N days (e.g. 7) unresolved, escalate
to a full lock (same mechanism as Option A). Retry emails/dunning are
typically handled by the provider itself (Stripe Smart Retries, Paddle's
own dunning) rather than custom code.

**Pros:** matches industry-standard dunning practice; customers keep
visibility into their own data while fixing a payment method; the
"you're about to lose write access" pressure is still there.
**Cons:** needs a new state (`past_due`, not just `active`/`suspended`)
and a timestamp to track how long it's been past due.

### Option C: Grace period, full access preserved

Same as B but nothing is blocked during the grace period, only a
warning banner.

**Cons dominate here:** removes the actual pressure to fix payment, and
gets you the implementation cost of B without most of its benefit.

### Recommendation

**Option B.** Extend `CompanyStatus` with a third value —
`CompanyStatus.PAST_DUE` — alongside a `pastDueSince: Date | null` field
on `Company`. A new lightweight middleware (structurally similar to
`requireRole`, run right after `authenticate`) checks status on
write-methods (`POST`/`PATCH`/`PUT`/`DELETE`) and lets `GET` through
regardless of `past_due`. `suspended` (today's existing value) becomes
the terminal state after the grace period elapses, reached either by a
scheduled job or lazily checked on request (lazy check is simpler and
avoids needing a job scheduler this project doesn't have yet).

---

## Consequences

- A new `billing` (or `payments`) module joins the 16 existing ones,
  following the same `types → model → repository → service → controller
  → routes + schema` shape as every other module here.
- The actual provider SDK call (Stripe or Paddle) should sit behind a
  small internal interface (`billingProvider.createSubscription(...)`,
  `.cancelSubscription(...)`, etc.) inside that module, the same way
  `mailer.ts` wraps Resend — so swapping providers later, or adding a
  second one, is a contained change, not a rewrite of call sites.
- The provider's webhook endpoint is the one place in this codebase that
  is **intentionally unauthenticated** (no JWT — the caller is Stripe/
  Paddle, not a logged-in user) but must independently verify the
  request's signature. It also needs the **raw request body**, not the
  JSON-parsed one `express.json()` already gives every other route — this
  route needs to be mounted before (or excluded from) the global JSON
  body-parser middleware in `app.ts`, a common integration gotcha worth
  flagging now.
- `Company.subscriptionPlan`/`status` stay on the `Company` model itself,
  which the `tenantScopePlugin` deliberately does **not** apply to
  (Company is the tenant, not tenant-scoped data) — no conflict with the
  work just finished, but worth confirming explicitly since it's the
  model most adjacent to that plugin.
- Resource-limit checks (warehouses/users count) add one query to each
  creation endpoint they apply to (warehouse/user invite) — negligible
  cost, but it's a behavior change existing tests for those endpoints
  will need a "at the limit" case added to.

## Action Items

1. [x] Confirm provider — **Stripe**, confirmed.
2. [ ] Confirm tier limits and actual numbers — implemented using this
       ADR's proposed numbers (`billing/plan.config.ts`), still a
       starting proposal, not a final business decision. Change the
       numbers there whenever you decide; every enforcement point reads
       from that one file.
3. [ ] Confirm grace-period length — implemented as "no fixed length yet":
       a company enters `PAST_DUE` on payment failure and stays there
       (writes blocked, reads fine) until either payment succeeds or you
       manually suspend it. The "auto-escalate to `suspended` after N
       days" half of this decision isn't built - see the README's "Not
       yet implemented" section.
4. [x] Scaffold the `billing` module - done (`types/schema/service/
       controller/routes`; no `model.ts` - subscription state lives on
       `Company` itself, not a separate collection, since a company has
       at most one subscription).
5. [x] Extend `CompanyStatus` with `PAST_DUE`, add `pastDueSince` (plus
       `stripeCustomerId`/`stripeSubscriptionId`/`currentPeriodEnd`) to
       `Company` - done.
6. [x] Add `requireActiveSubscription` middleware + resource-limit checks
       at warehouse creation and user invite - done.
7. [x] Wire the webhook endpoint (raw body, signature verification,
       mounted before the JSON body-parser) - done, see `app.ts`.
8. [ ] Build the scheduled/lazy job that escalates `PAST_DUE` →
       `SUSPENDED` once a grace period actually elapses (depends on #3).
9. [ ] Decide whether Basic should ever require checkout at all, or stay
       a true no-payment-method-on-file free tier indefinitely, as
       implemented today.
