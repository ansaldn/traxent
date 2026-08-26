# Work Order — Web & Backend

**For:** web / backend team
**Issued:** 2026-08-25
**Status:** every item below is **confirmed against source** and must be fixed before launch testing begins
**Method:** static review of `traxent-web`, then a second pass that verified each claim against the code. Items that turned out not to be defects have been removed — see §5.

> **Scope rule for this document:** everything in §2, §3 and §4 is a required change. Nothing here is speculative. Where a fix depends on a decision or an environment fact I don't have, it's in §6 — those need an answer but no code yet.
>
> **iOS defects are in `traxentApp/docs/DEFECTS-IOS.md`.** Read §1 first — four items in this document block iOS work, and one of them blocks App Store submission entirely.

---

## 1. Cross-team dependencies — read before scheduling

The iOS team is blocked on four things only this team can deliver. **Two of them block App Store submission**, and iOS updates take days of review, so these should be sequenced first.

| # | Backend/web must deliver | iOS is blocked on it for | Blocking? |
|---|---|---|---|
| **D1** | **`WB-002`** — fix `DELETE /user/account` (add Auth0 `delete:users` scope) | `IOS-004`. Apple Guideline **5.1.1(v)** requires working in-app account deletion | **Blocks App Store submission** |
| **D2** | **`WB-NEW-01`** — build App Store Server Notifications V2 → Auth0 role assignment | `IOS-003`. Without it, every Apple-billed subscriber is `free` server-side and `/news` 403s for people who paid | **Blocks paid iOS launch** |
| **D3** | **`WB-011`** — publish `content/modules.json` to `traxent.io` | `IOS-010`. iOS's remote content updater fetches that exact URL and silently no-ops. Without it, no lesson text can be changed without a full App Store release | High |
| **D4** | **`WB-NEW-02`** — add a delete path for `DEVICE#<token>` rows | `IOS-007`. iOS clearing the local APNs token is not sufficient; the server row survives and will misroute pushes to the wrong user once push ships | High |

**Two more need a joint decision before either team writes code:**

| # | Decision | Owners |
|---|---|---|
| **D5** | Canonical curriculum — web has 11 modules / 62 lesson keys, iOS has 10 / 55. The delta is exactly web's `l8-*` "Trading Strategies". Decide whether `l8-*` ships on iOS or is removed from web (`WB-010` / `IOS-009`) | Both + product |
| **D6** | Canonical module numbering — "Going Live" is Module 7, 10 and 11 in three different places (`WB-021`) | Both + product |

**Do not start D5 or D6 implementation until both teams agree the answer.** Fixing them independently will produce a worse divergence than the one that exists now.

---

## 2. Critical — fix first

---

### WB-NEW-03 — cTrader OAuth has no server-side `state` validation, and the client check fails open

**Area:** Security · **Files:** `backend/user-data/functions/ctrader-connect/index.mjs:138-165`, `src/integrations.html:132-158`

**The flaw.** The authorisation URL the backend generates contains no `state` parameter at all:

```js
// ctrader-connect/index.mjs:138-140
const authUrl = `${AUTH_BASE}?client_id=${encodeURIComponent(clientId)}`
  + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  + `&scope=accounts&response_type=code&product=web`;
```

The exchange endpoint accepts a bare `code` with no state check:

```js
// ctrader-connect/index.mjs:150-165
if (method === 'POST' && path === '/exchange') {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return json(400, { error: 'code required' });
  ...
  await saveConnection(user.sub, tokens);
```

A `state` value exists **only in the browser** (`integrations.html:156-158`), and the comparison is written so that a **missing** state passes:

```js
// integrations.html:132-140
var returned = q.get('state');
if (returned && sent && returned !== sent) {
  alert('Connection cancelled: ...');
} else {
  await api('/user/ctrader/exchange', { method: 'POST', body: JSON.stringify({ code: q.get('code') }) });
```

**Why this is Critical.** If a signed-in user opens a link of the form `https://traxent.io/integrations?code=<attacker's code>` with no `state` parameter, `returned` is falsy, the mismatch branch is skipped, and the exchange runs under the victim's own bearer token — binding an attacker-controlled cTrader account to the victim's Traxent account. The same thing happens benignly whenever `sessionStorage` is empty: a new tab, cleared storage, or Safari ITP eviction all silently disable the only check that exists.

Once linked, `ctrader-sync` writes the attacker's deals into the victim's `RTRADE#` rows, corrupting the readiness score the user makes financial decisions on.

The state value is also generated with `Math.random()`, which is not a CSPRNG.

**Required fix.**
1. Generate `state` server-side with `crypto.randomUUID()` (or `crypto.randomBytes`), store it against the user's `sub` in DynamoDB with a short TTL (10 minutes), and include it in the returned `authUrl`.
2. Require `state` on `POST /exchange`. Reject when absent, unknown, expired, or bound to a different `sub` — **absent must fail, not pass**.
3. Delete the stored state on use so a code can't be replayed.
4. Keep the client-side check as defence in depth, but invert it to fail closed.

---

### WB-001 — Stripe webhook handles no payment-failure or trial-ending events

**Area:** Payments · **Files:** `backend/functions/stripe-webhook/index.mjs:135`, `:154`, `:178`; `backend/functions/create-checkout/index.mjs:137`

**The flaw.** Exactly three event types are handled: `checkout.session.completed` (`:135`), `customer.subscription.updated` (`:154`, and only when `status === 'active'`), `customer.subscription.deleted` (`:178`).

Absent: `invoice.payment_failed`, `customer.subscription.trial_will_end`, `invoice.paid`, `charge.dispute.created`, `customer.subscription.paused`.

Checkout sets `trial_period_days: 7` (`create-checkout/index.mjs:137`), so the normal lifecycle is: sign up → paid Auth0 role assigned immediately → first real charge attempted seven days later.

**Impact.** When that charge fails — expired card, insufficient funds, incomplete 3DS — nothing in the system reacts. Stripe enters dunning; Traxent never hears. The user keeps their paid role and full access indefinitely, having paid nothing. There is no alert, and the admin metrics dashboard counts subscriptions from Stripe, so a past-due subscriber can still register as MRR while a lapsed one silently retains access.

**Required fix.**
1. Handle `invoice.payment_failed` — grace period, then downgrade the Auth0 role to `free`.
2. Handle `customer.subscription.paused` and `unpaid`.
3. Handle `customer.subscription.trial_will_end` — send a heads-up email before the first charge.
4. Add a scheduled reconciliation comparing Auth0 plan roles against live Stripe subscription status, alerting on drift. `reconcile-marketing` is the existing pattern to copy.

---

### WB-002 — `DELETE /user/account` returns 500 in production

**Area:** Compliance · **Blocks:** `IOS-004`, App Store submission (**D1**)
**Files:** `backend/user-data/functions/delete-account/`, `traxentApp/docs/WEB_BACKEND_REQUIREMENTS.md`

**The flaw.** Account deletion fails in production. Recorded cause: the Auth0 Management API M2M application lacks the `delete:users` scope.

**Impact.** Two independent obligations:
1. **UK GDPR Article 17** — right to erasure. A delete button that 500s is not an erasure mechanism.
2. **App Store Guideline 5.1.1(v)** — apps offering account creation must offer in-app deletion. **This will fail review.**

**Required fix.**
1. Add `delete:users` to the M2M application's authorised scopes in Auth0.
2. Determine how far the function currently gets before failing. It cancels Stripe, purges DynamoDB, removes the Resend contact, then deletes the Auth0 user — a partial completion is worse than a clean failure. If it purges data before the Auth0 delete fails, users are left with data destroyed and billing live.
3. Make the sequence idempotent and safely resumable, so a mid-sequence failure can be retried.
4. Return an error naming the failed step rather than a generic 500.

---

### WB-003 — HTTP API `DefaultAuthorizer` will 401 all four public routes

**Area:** API availability · **Files:** `backend/user-data/template.yaml:674-681`

**The flaw.** The template sets `DefaultAuthorizer: Auth0JWT` (`:681`). In SAM this applies to **every** route unless a route declares `Authorizer: NONE`. Grepping the whole file for `Authorizer` returns only lines 675 and 681 — **no route opts out.**

Four routes are meant to be public and cannot supply an Auth0 JWT:

| Route | Caller | Consequence |
|---|---|---|
| `POST /subscribe` | `src/subscribe.js:58` — sends no `Authorization` header | Waitlist and email capture dead sitewide |
| `POST /webhooks/resend` | Resend's servers | Bounce/complaint/suppression handling dead; deliverability degrades silently |
| `POST /enterprise/enquiry` | `src/enterprise.html` | Enterprise leads lost |
| `ANY /scim/v2/{proxy+}` | Customer IdPs | SCIM provisioning dead |

**Whether this is live in production is unknown** — the last local SAM build predates the change. That does not affect the fix: if it is deployed, production is broken now; if it is not, the next deploy breaks it.

**Required fix.** Add `Auth: { Authorizer: NONE }` to each of the four public routes. Keep the default as-is — defaulting to authenticated and opting out explicitly is the correct arrangement.

---

### WB-004 — Uncaught JavaScript error wipes all local data and signs the user out

**Area:** Data integrity · **Files:** `src/dashboard.html:432-435`, `src/account.html:626-629`

**The flaw.** Both pages run `localStorage.clear()` followed by a redirect to `/` from a broad `catch`.

`localStorage.clear()` is indiscriminate. It destroys `traxent_progress`, `tx_course_progress`, `traxent_journal_cfg`, `traxent_journal_trades`, `traxent_lab_progress` — **and Auth0's cached credentials**, since `auth.js` uses `cacheLocation: 'localstorage'`.

**Impact.** Any unrelated JS error — a browser extension, a failed third-party load, a transient network fault mid-render — silently destroys the user's work and signs them out. From the user's side: the page flickered and everything was gone, with no message and no undo. Progress is partly recoverable from the server, but `WB-009` means `/learn` won't read it back, so the user experiences it as permanent. Journal config and trades are not recoverable if the API write hadn't completed.

**Required fix.** Remove the blanket handler. If corrupt-state recovery is genuinely needed, clear only the specific namespaced keys that could be corrupt, never Auth0's, and always surface a message explaining what happened.

---

## 3. High

---

### WB-012 — Auth0 role changes are never checked for success

**Area:** Entitlement · **Files:** `backend/functions/stripe-webhook/index.mjs:51-63`, `:138-139`, `:159-160`, `:181`

**The flaw.** Role removal *is* correctly ordered before assignment and *is* awaited in all three branches. But neither helper inspects the response:

```js
// index.mjs:56-63
async function removeAllPlanRoles(token, domain, userId, roleIds) {
  const ids = Object.values(roleIds).filter(Boolean);
  if (!ids.length) return;
  await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'DELETE', ... });
}
async function assignRole(token, domain, userId, roleId) {
  await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, { method: 'POST', ... });
}
```

`fetch` rejects only on network failure. A 429, 403 or 5xx from Auth0 resolves normally. Three failure modes, all silent:

1. **Removal fails, assignment succeeds** → user holds two plan roles (e.g. `observer` + `funded_ready`).
2. **Removal succeeds, assignment fails** → user is on `free` after paying. The handler still returns 200, so **Stripe never redelivers**.
3. `:139` passes `roleIds[s.metadata.plan]`, which is `undefined` for an unrecognised plan string — posting `{"roles":[null]}`, which Auth0 400s, **after the roles were already removed**.

`getRoleIds` (`:51-54`) also ignores `res.ok`.

**Required fix.** Check `res.ok` on every Management API call and throw on failure so Stripe retries. Validate the plan string against the known set before touching roles. Verify the post-state and alert if a user holds more than one plan role.

---

### WB-005 — `/tracker` has no plan gate

**Area:** Entitlement / revenue · **Files:** `src/tracker.html`

`tracker.html` loads `auth.js` (`:348`) and `userdata.js` (`:349`) but **never calls `requireMinPlan`**, while `/dashboard` advertises the readiness tracker as a Challenger feature. Any signed-in free user gets the full paid feature by typing the URL. Twelve other pages call the helper correctly. There is no server-side equivalent to fall back on.

`/news` is gated, but via its own inline `PLAN_HIERARCHY` check (`news.html:353`) rather than the shared helper — a second implementation is how the tracker ended up with none.

**Required fix.** Add `requireMinPlan('challenger')` to `tracker.html`. Convert `news.html` to the shared helper. Drive both the dashboard's advertised `minPlan` values and the page gates from one table so they cannot disagree.

---

### WB-006 — Upgrade buttons bypass the `paidPlansOpen` launch flag

**Area:** Launch control · **Files:** `src/dashboard.html:439-472`, `src/account.html:643`, `:655`, `:680-722`

**The flaw.** `flags.json:18-22` sets `paidPlansOpen.enabled = false`, and the homepage honours it (`index.html:1515-1520`). But **neither `/dashboard` nor `/account` loads `flags.js` or `launch-state.js` at all** — grep for `paidPlansOpen|TraxentLaunch|launch-state|flags.js` in both files returns zero matches. Their checkout and change-plan calls fire unconditionally.

**Impact.** The public position is that paid plans are not open. Anyone who signs up and reaches the dashboard can pay anyway — for a product whose headline paid feature (trade sync) is explicitly not shipped. Note that iOS fails *closed* on the same flag; web fails open.

**Required fix.** Load the flag on both pages and gate every purchase entry point on it. Also enforce it server-side in `create-checkout`, so the flag cannot be bypassed by calling the API directly.

---

### WB-007 — Free-course progress is written to an orphaned storage key

**Area:** Progress tracking · **Files:** `src/learn-101.html:479`, `:553`; `src/learn.html:433`

`learn-101/201/301` write to localStorage key **`tx_course_progress`** (`learn-101.html:479`). `/learn` reads only **`traxent_progress`** (`learn.html:433`). The two never meet.

Compounding it, `learn-101.html` loads neither `auth.js` nor `userdata.js`, so its `markLesson()` call at `:553` sits behind `if (window.TraxentData)` — always false — and is dead code. Nothing reaches the server.

**Impact.** A user completes the entire free Trading 101 course, the main funnel into the paid tiers, and the Learning Centre still shows it untouched. This is the first substantive interaction a new user has with the product.

**Required fix.** One storage key, one write path, `TraxentData.markLesson()` on all three pages. Migrate existing `tx_course_progress` data on next load rather than abandoning it.

---

### WB-008 — Nine of eleven modules record only the quiz, never individual lessons

**Area:** Progress tracking
**Broken:** `learn-101.html:553`, `learn-201.html:608`, `learn-301.html:597`, `learn-module-1.html:842`, `-2.html:482`, `-3.html:440`, `-4.html:890`, `-5.html:655`, `-6.html:696`
**Already correct:** `learn-module-7.html:178`, `learn-module-8.html:590` + `:754`

Two modules already do this properly — `learn-module-8.html:563-590` writes per-lesson keys from a `LESSON_KEYS` array, and `-7.html:151-178` does the same from `KEYS`. The other nine write a single quiz key per module.

**Impact.** `learn.html`'s `MODULES` array defines **62 lesson keys**; only nine are ever written by these files. Completion under-reports drastically — a user four lessons into a six-lesson module shows 0%. Those per-lesson keys are the documented cross-platform contract with iOS (`traxentApp/docs/CONTENT_CONTRACT.md`).

**Required fix.** Apply the `learn-module-8.html` pattern to the nine remaining files. It is a port, not a design problem.

---

### WB-009 — `/learn` never syncs progress from the server

**Area:** Progress tracking · **Files:** `src/learn.html:197`, `:433`

`learn.html` loads `auth.js` only (`:197`) — no `userdata.js`, no `TraxentData.sync()` call anywhere. Completion is computed purely from the local `traxent_progress` key.

**Impact.** Server-side progress is invisible on the module index. A different browser, a different machine, or cleared site data all read as zero despite the data being safely stored. Combined with `WB-004`, a user can appear to lose months of work. It also breaks the web↔iOS loop in one direction: iOS pushes progress correctly, web never reads it back.

**Required fix.** Load `userdata.js` on `/learn` and call `sync()` on load, merging cloud ∪ local so completion is never lost. iOS's `UserDataService.sync()` already implements this merge (`$0 || $1`) — match its semantics.

---

### WB-010 — Web and iOS ship different curricula

**Area:** Content · **Joint decision D5** · **Cross-ref:** `IOS-009`
**Files:** `src/learn.html:200`, `traxentApp/.../Resources/Modules.json`

Web's `MODULES` array describes **11 modules / 62 lesson keys**. iOS's bundled `Modules.json` contains **10 modules / 55 lessons**. The delta is exactly one module: web's `l8-*` — "Trading Strategies", 7 keys. 62 − 7 = 55.

**Impact.** A user who completes Trading Strategies on web will not find it on iOS, and their completion percentage differs between platforms for the same account.

**Required fix.** Agree the canonical curriculum with the iOS team **before** either side changes anything (**D5**), then implement via `WB-011`.

---

### WB-011 — The structured content file is dead on web and unpublished for iOS

**Area:** Content pipeline · **Blocks:** `IOS-010` (**D3**) · **Files:** `src/content/modules.json`

`src/content/modules.json` is a complete, well-structured curriculum (schemaVersion 2, typed blocks). **Nothing on the website fetches it** — grep across `src/` finds only comment references. The live web curriculum is the hardcoded inline array in `learn.html`.

iOS fetches `https://traxent.io/content/modules.json` on every launch to update its cached catalogue.

**Impact.** Two failures from one cause. Web maintains its curriculum in a hardcoded array duplicating a proper content file, which guarantees the drift in `WB-010`. And **iOS cannot update lesson content without an App Store release**, because the remote pipeline silently no-ops — which is precisely what `ContentUpdater` was built to prevent.

**Required fix.**
1. Publish `content/modules.json` to `traxent.io` as part of the deploy.
2. Make `learn.html` render from it instead of the inline array.

This resolves `WB-010`, `WB-011`, `WB-021` and `IOS-010` together and is the highest-leverage change in this document.

---

### WB-014 — No per-user rate limiting on authenticated write endpoints

**Area:** Abuse / cost · **Files:** `backend/user-data/template.yaml`, `backend/user-data/functions/user-data/index.mjs`

Public endpoints have per-IP DynamoDB counters (`/subscribe` 10/hour, `/enterprise/enquiry` 5/hour). Authenticated endpoints have nothing beyond the API-wide 100 rps / 200 burst.

A single valid token can issue unbounded `POST /user/trades`, `PUT /user/progress` and `POST /user/device` calls. Combined with `WB-015`, one free-tier account can write arbitrary volumes of arbitrary data to a PAY_PER_REQUEST table. The `traxent-monthly` budget alarm sits at **$50**. WAFv2 cannot attach to an HTTP API, so this must be handled in-application.

**Required fix.** Per-`sub` counters in DynamoDB with a TTL, matching the existing `/subscribe` pattern. Cap trades per user per day.

---

### WB-015 — `progress` payload is stored with no shape or size validation

**Area:** Input validation · **Files:** `backend/user-data/functions/user-data/index.mjs:160-161`

Every other field is properly whitelisted and truncated — trade notes at 280 chars, strings at 60, firms capped at 12, device tokens length-checked, names at 100. `progress` is checked only for `typeof === 'object'` and non-null, then stored as-is. Arbitrary keys, arbitrary nesting, arbitrary size up to DynamoDB's 400KB item limit.

**Required fix.** Validate against the known lesson-key set from the content catalogue. Reject unknown keys, cap total size.

---

## 4. Medium

---

### WB-NEW-04 — Dark mode is applied to marketing pages but absent from the entire signed-in product

**Area:** Design consistency · **Files:** 23 of 57 pages in `src/`

Dark mode exists via a single-line `@media(prefers-color-scheme:dark)` block on all 16 `firm-*.html`, plus `firms.html`, `blog.html`, the 3 `blog-*.html`, `integrations.html` and `learn-module-7.html`.

It is **absent from every signed-in page**: verified zero occurrences in `index.html`, `dashboard.html`, `account.html`, `learn.html`, `journal.html`, `tracker.html`, `news.html`, `signup.html`, `home.html`, `calculator.html`, and `learn-module-1..6/8`. No `data-theme` anywhere.

**Impact.** A user on a dark-mode device flips between themes mid-journey — `/learn` is light, `learn-module-7` is dark, `learn-module-6` is light again. That's more jarring than having no dark mode at all, and it fails the project's stated rule of matching the device appearance. iOS implements this correctly, so the platforms also disagree.

**Required fix.** Either extend the token set across the signed-in product, or remove the partial implementation from the 23 pages that have it. **Consistency matters more than which direction you pick** — but given the design rule and iOS's behaviour, extending is the better answer.

---

### WB-017 — "Prelaunch is open" shown after launch

**Files:** `src/signup.html`, `src/index.html`

`flags.json:14-15` sets `fullLaunch.launchAt = 2026-08-24T07:00:00Z`, now past, so `TraxentLaunch.state` resolves to `launched`. But `signup.html` hardcodes the eyebrow "Prelaunch is open" and `index.html`'s note text still says "Join prelaunch".

**Fix:** Route both through `launch-state.js` / `config.js` `data-tx` injection like the rest of the launch-sensitive copy.

---

### WB-018 — USD headline price is unmarked and unconverted

**Files:** `src/index.html:1391+`, `:1396`, `:1417`, `:1438`

The `plans` array holds hardcoded pairs: `4.99/6.25`, `12.99/16.25`, `29.99/37.50`. No FX call anywhere.

Partly mitigated — the secondary `altGbp` strings carry `≈` (`'≈ $6.25/mo'`, `'≈ $16.25/mo'`, `'≈ $37.50/mo'`). But the `usd` field used for the **headline price** when the toggle is switched carries no marker, no rate and no date. A US visitor sees a clean "$37.50" presented as the price and is charged £29.99 plus whatever their card issuer's rate and fees produce.

**Fix:** Apply the `≈` treatment to the headline figure and add "billed in GBP at an indicative rate", or remove the toggle until multi-currency pricing exists in Stripe.

---

### WB-019 — Module 7 is sold at Funded Trader but gated at Challenger

**Files:** `src/index.html:1435-1445`, `src/learn-module-7.html:26`, `src/learn.html:390-398`, `src/content/modules.json`

The pricing array lists `'Go-Live onboarding (Module 7)'` under **Funded Trader (£29.99)**. Three other sources gate it at **`challenger` (£12.99)**: `learn-module-7.html:26` (`requireMinPlan('challenger')`), `learn.html:390-398` (`minPlan: 'challenger'`, `tagLabel: 'Challenger+'`), and the `modules.json` record.

A £12.99 subscriber gets a feature advertised as exclusive to the £29.99 tier.

**Fix:** Three sources say `challenger` and only the pricing page says Funded Trader, so the pricing copy is most likely the error — but this is a **product decision, not a code decision**. Confirm intent, then make all four agree.

---

### WB-020 — Two different quiz pass marks, and seven pages display the wrong one

**Files:** `learn-module-1.html:265` & `:827`, `-2:206`, `-3:196`, `-4:261`/`:611` & `:875`, `-5:222` & `:639`, `-6:232` & `:680`, `challenge-lab.html:1485`

Two separate problems:

1. **The product has two pass marks.** Every module enforces `pct >= 75`. **Challenge Lab enforces `pct >= 80`** (`challenge-lab.html:1485`). Nothing documents why the standard is higher there. It may be deliberate — Challenge Lab is the pre-evaluation gate — but it should be stated.
2. **Seven module pages advertise a mark they don't enforce.** These display "Pass 80%" while enforcing 75: `learn-module-1.html:265`, `-2:206`, `-3:196`, `-4:261` and `:611`, `-5:222`, `-6:232`. Only `learn-module-8.html:247` correctly says 75%. Challenge Lab is consistent — it says 80 and enforces 80.

The error is lenient, so it isn't harmful, but it undermines trust in the scoring the moment anyone notices.

**Fix:** Decide whether the mark is 75 or 80, apply it uniformly, and **generate the copy from the constant**. iOS already does this — `QuizView.swift:34` defines `passThreshold = 0.75` and `:214` renders `"You need \(Int(Self.passThreshold * 100))% to pass"`, so its copy cannot drift. Copy that pattern.

---

### WB-021 — One module carries three different numbers

**Joint decision D6** · **Files:** `src/learn.html:391`, `src/learn-module-7.html`, `traxentApp/.../Modules.json`

"Going Live" is numbered differently in three places:

| Where | Number |
|---|---|
| `learn.html:391` (module index) | Module 11 |
| `learn-module-7.html` (the page) | Module 7 |
| iOS `Modules.json` `numLabel` | Module 10 |

`learn-module-8.html` has the same problem — the index calls it Module 10, colliding with iOS's number for a different module.

Confusing for users, ambiguous in support, and a maintenance trap: someone told to fix "Module 11" will look for `learn-module-11.html`.

**Fix:** One canonical number per module, defined in `content/modules.json` (`WB-011`) and rendered everywhere from there. Filenames can stay as they are as long as nothing displays them. **Agree numbering with iOS first (D6).**

---

### WB-022 — "Member since" displays a fabricated date

**Files:** `src/account.html:593-595`

When `user.updated_at` is missing, the field falls back to the literal string `'March 2026'`.

Low technical severity, but it is a specific factual claim about the user's own account that is invented.

**Fix:** Show nothing rather than a plausible-looking fiction.

---

### WB-023 — Stripe webhook idempotency fails open without a signal

**Files:** `backend/functions/stripe-webhook/index.mjs:110-131`

Deduplication uses a conditional `PutCommand` against `TraxentWebhookDedup`. If that write throws — throttling, outage — the handler proceeds anyway. A DynamoDB incident during Stripe retries produces duplicate role assignments and duplicate welcome emails.

Failing open is arguably correct for a payment webhook (better to over-deliver access than deny a paying customer). The defect is that it happens **invisibly**.

**Fix:** Keep failing open. Emit a distinct log line and a CloudWatch metric so it is visible when it happens.

---

### WB-024 — Sim journal supports 4 of the 16 firms the site markets

**Files:** `src/journal.html:263-266`, `:581-620`

Journal setup offers FTMO, Apex Trader Funding, MyFundedFutures and FundedNext. The site has 16 firm pages and `/tracker` compares all 16.

A user who follows the tracker's recommendation to one of the other 12 then cannot run a sim challenge against that firm's rules — which is the pipeline the entire product is built around.

**Fix (product decision required):** either add the remaining 12 firms to the journal, or stop the tracker recommending firms the journal cannot simulate. The current state — recommend, then dead-end — is the one option that shouldn't ship.

---

### WB-025 — Firm rules duplicated in three places and two months stale

**Files:** `src/content/firms.json` (16 firms, `updated: "2026-06-10"`), `src/tracker.html` `FIRMS` array, 16 × `src/firm-*.html`

The same rules exist in three independently-maintained places.

Prop firm rules change. Users make **real financial decisions** on these numbers — choosing a firm, sizing positions, judging whether they'd have breached a limit. Stale or inconsistent rules matter more here than in most products.

**Fix:** Single source (`content/firms.json`), consumed by everything. Re-verify all 16 firms against their own published rules before launch. Add a freshness check that flags any firm not reviewed in 90 days.

---

### WB-026 — `integrations/README.md` data model contradicts shipped code

**Files:** `backend/integrations/README.md`, `backend/user-data/functions/ctrader-sync/index.mjs`

The README proposes `TRADE#<connId>#<tradeId>` and `EQUITY#...`. `ctrader-sync` writes `RTRADE#<dealId>`. Whoever builds the second connector against the documented spec will produce something incompatible with the first.

**Fix:** Correct the README to match the implementation.

---

### WB-028 — FAQ says a blog is "coming soon"; the blog exists

**Files:** `src/faq.html:423`

Three posts are live at `/blog`. One-line copy fix.

---

## 5. Investigated and dropped — do not re-raise

These appeared in an earlier draft and were removed after checking the code. Recorded so nobody spends time rediscovering them.

| Item | Why it's not a defect |
|---|---|
| `DELETE /user/ctrader` soft-deletes tokens | It hard-deletes. `ctrader-connect/index.mjs:169-171`, `DeleteCommand` on `CONNECTION#ctrader`. No inactive flag |
| News feed returns 200 with an empty body when the key is missing | Designed contract, documented at `news-feed/index.mjs:7-10`. Auth still runs first (`:144`). The page renders a "feed is being set up" state. See §6 Q3 for the real question |
| Marketing toggle only ever sends `true` | It sends the real boolean. `account.html:865-881` posts `{ subscribed: wanted }` with a revert on failure; `account-update/index.mjs:164-182` handles `false` and writes `unsubscribed` |
| `.aws-sam` build trees and `.DS_Store` committed to git | `git ls-files` returns zero matches for both. Present on disk only; `.gitignore` already covers them |
| `learn.html` clears localStorage on error | It does not. Only `dashboard.html` and `account.html` do — see `WB-004` |
| `POST /user/device` route missing | It resolves via the `/user/{proxy+}` catch-all (`template.yaml:394-418`) and is implemented at `user-data/index.mjs:175-189` |

---

## 6. Open questions — answer before or during the fix

No code needed yet. These change scope or priority.

**Q1 — Is `WB-003` live in production?**
Call `POST /subscribe` from an unauthenticated client and record the status. 200 means the template change was never deployed and this is a pre-emptive fix. 401 means the waitlist is currently down in production and `WB-003` jumps to first priority. *One curl. Do this today.*

**Q2 — How far does `WB-002` get before failing?**
Delete a throwaway account and read the CloudWatch trace. Determines whether the fix is "add a scope" or "add a scope and repair partially-deleted accounts".

**Q3 — Is `/traxent/news/alphavantage_key` set in SSM?**
The no-key path is by design, but Funded Trader is billed £29.99/month with a news feature. If the key is absent, that's a product/billing question, not a code fix: either set it or stop selling the feature until it's set.

**Q4 — Is the Challenge Lab 80% pass mark deliberate?** (`WB-020`) Product decision.

**Q5 — Is Module 7 a Challenger or a Funded Trader feature?** (`WB-019`) Product decision. Three code sources say Challenger; only the pricing page disagrees.

**Q6 — Journal firm coverage: add 12 or stop recommending them?** (`WB-024`) Product decision.

**Q7 — Dark mode: extend or remove?** (`WB-NEW-04`) Design decision. Extending matches the project's stated rule and iOS's behaviour.

**Q8 — D5 and D6** — canonical curriculum and module numbering. Needs both teams plus product in one conversation.

---

## 7. Recommended sequence

1. **Q1** (one curl), then `WB-003` if confirmed.
2. **`WB-002`** — unblocks iOS submission (**D1**). Longest lead time on the Auth0 side.
3. **`WB-NEW-01`** — App Store Server Notifications → Auth0 (**D2**). Blocks paid iOS launch; needs backend design time.
4. **`WB-NEW-03`** — cTrader OAuth state. Security.
5. **`WB-001`**, **`WB-012`** — payment lifecycle and role integrity. Same area, do together.
6. **`WB-011`** — publish `modules.json`, render `/learn` from it. Unblocks **D3** and resolves `WB-010`, `WB-021`, `IOS-010`.
7. **`WB-004`**, **`WB-007`**, **`WB-008`**, **`WB-009`** — progress and data integrity. One coherent piece of work.
8. **`WB-NEW-02`** — `DEVICE#` row deletion (**D4**), alongside iOS's `IOS-007`.
9. Everything else in §3 and §4.

---

## 8. Recommended tests to add alongside the fixes

There is currently no test runner and no test framework in `traxent-web`. Four `package.json` files carry a `"test"` script but all four are the npm-init placeholder that exits 1. CI runs `check-routes.py`, gitleaks and a report-only semgrep.

Every defect in this document was found by reading source. Six checks would have caught most of them and are worth writing as part of the fixes rather than after:

| Check | Catches |
|---|---|
| Every gated page calls `requireMinPlan` with the value the dashboard advertises | `WB-005`, `WB-019` |
| Web and iOS lesson-key sets are identical | `WB-010`, `IOS-009` |
| The webhook's handled-event list matches the events configured in Stripe | `WB-001` |
| The four public routes return non-401 without credentials | `WB-003` |
| Every quiz's displayed pass mark equals the one it enforces | `WB-020` |
| Progress written by any lesson page is readable by `/learn` | `WB-007`, `WB-008`, `WB-009` |
