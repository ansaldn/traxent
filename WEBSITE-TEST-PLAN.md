# Traxent — End-to-End Website Test Plan

A structured pass through the whole site. Work top to bottom, tick each box, and
write what you notice in the **Notes** line under each section. The goal is to
catch anything broken, confusing, slow, or off-brand before public launch.

---

## How to use this

- **Tick** `- [x]` when a check passes. Leave it unticked and add a note if it fails.
- **Severity** when logging an issue: `P0` (blocks launch / data loss / payment broken), `P1` (major, but has a workaround), `P2` (minor / polish), `P3` (nice-to-have).
- Run the **whole flow twice**: once on **desktop** (Chrome) and once on **mobile** (real iPhone/Android Safari + Chrome). Note which platform each issue is on.
- Keep **DevTools → Console** open the entire time. Any red error = log it.
- Test as **three different users**: a brand-new signed-out visitor, a free **Observer**, and a paid **Challenger/Funded** account.

**Routes** are clean URLs (no `.html`) e.g. `traxent.io/waitlist`. File names in `src/` are noted where useful.

---

## 0. Pre-flight / environment

- [ ] Decide environment: production (`traxent.io`) or a staging/preview URL — note which: ____________
- [ ] Confirm the **user-data API** is deployed and `src/userdata.js` `USERDATA_API` matches the live `ApiBaseUrl` (currently `gqway1e53f…`).
- [ ] Confirm which **payments API** the frontend points at (currently `da579ew81m…/prod`) — relevant after the payments cutover.
- [ ] Have a **Stripe test card** ready (or use live mode carefully) and a throwaway email for new-account testing.
- [ ] Note browser + OS + screen size for each run.

**Notes:**

---

## 1. Global / every page

- [ ] **Nav** logo + links work on every page; active state correct; sticky header behaves on scroll.
- [ ] **Footer** links all resolve (no 404s): How it works, Readiness tracker, Pricing, FAQ, Privacy, Terms, `hello@traxent.io` mailto.
- [ ] **No console errors / warnings** on load or interaction.
- [ ] **No mixed-content / CSP violations** in console (the pages ship a strict Content-Security-Policy — watch for blocked scripts/fonts/frames).
- [ ] **404 behaviour** — visit a bad URL, confirm a sensible response.
- [ ] **Performance** — pages feel fast; no layout shift; fonts load (Instrument Serif / Geist / Geist Mono).
- [ ] **Responsive** — 320px, 375px, 768px, 1024px, 1440px: no overflow, no overlap, tap targets ≥ ~44px.
- [ ] **Accessibility** — tab through each page with keyboard only; visible focus rings; images have alt text; headings in order; colour is never the *only* signal; check contrast on the light theme.
- [ ] **Screen reader spot-check** (VoiceOver / NVDA) on home, tracker, account.
- [ ] **SEO/meta** — title + description sensible per page; `sitemap.xml`, `robots.txt`, `llms.txt`, `manifest.json` reachable; OG image renders when a link is shared.

**Notes:**

---

## 2. Auth & account

- [ ] **Sign up** (new email) via Auth0 (`auth.traxent.io`) — completes and redirects to `/dashboard`.
- [ ] **Log in** existing user — redirect callback strips `?code=` from the URL.
- [ ] **Log out** — session cleared; protected pages bounce to login.
- [ ] **Refresh while logged in** — stays logged in (token cached in localStorage).
- [ ] **Direct-load a gated page** while signed out (`/account`, `/dashboard`, `/news`) — handled gracefully.
- [ ] **Account page** (`/account`) — shows correct plan, email, billing state.
- [ ] **Delete account** (`/account` → delete) — confirm step, then cancels billing + purges data + deletes Auth0 user (App Review 5.1.1). Verify you're signed out and the data is gone.

**Notes:**

---

## 3. Cross-device sync ⭐ (recently fixed — test carefully)

> A trailing-slash bug was making the **web** client call `//user` / `//news`, which 404'd and
> silently fell back to localStorage — so web data was **not** reaching the cloud. Now fixed.
> This section is the most important to re-verify after the fix deploys.

- [ ] **Web → cloud:** on desktop, complete a lesson, select firms, log a sim trade. In DevTools → Network confirm `PUT /user/progress`, `PUT /user/firms`, `POST /user/trades` return **2xx** (not 404, no double `//`).
- [ ] **Cloud → web (other browser):** open the site in a different browser/incognito, log in as the same user — progress, firms, and trades appear.
- [ ] **Web ↔ iPhone (TestFlight):** complete a lesson on web → appears in the iOS app after sync; complete one on iOS → appears on web.
- [ ] **Firm selection sync** both directions (max 12 firms; iOS debounces rapid toggles).
- [ ] **News feed** loads on web for a Funded user (`/news` → `…/news`, single slash, 2xx).
- [ ] **Known gap to confirm:** the iOS app currently syncs **progress + firm selections only — not paper trades**. Trades logged on iPhone are *not* expected to appear on web yet. Confirm that's the actual behaviour and note if it's a problem for launch.
- [ ] **Offline / API down:** kill the network, use the app — it should keep working from localStorage and reconcile on next sync (no crash, no data loss).

**Notes:**

---

## 4. Plans, paywall & payments 💳

- [ ] **Pricing** on home + `/account` shows three tiers (Observer / Challenger / Funded Trader) with correct prices.
- [ ] **Paywall gating** — Observer is blocked from Challenger/Funded features with a clear upsell (test tracker, news, Challenge Lab, etc.).
- [ ] **Checkout** — upgrade flow opens Stripe (`/checkout`), completes, and the webhook assigns the new plan role (re-check `/account` shows the upgrade).
- [ ] **Cancel / downgrade** (`/account` → cancel via `/cancel`) returns success and reflects on the account.
- [ ] **CORS** — checkout/cancel calls succeed from `traxent.io` (no CORS errors in console).
- [ ] **Throttling** — payment API is rate-limited at the gateway; not something to stress in prod, just don't hammer it.
- [ ] **After payments cutover:** confirm the frontend (`account.html`, `dashboard.html`, `tracker.html`) points at the new API URL and the Stripe webhook hits the new `/webhook` with a valid signing secret.

**Notes:**

---

## 5. Core features

### Dashboard (`/dashboard`)
- [ ] Loads post-login; widgets reflect real progress; gated links show correct plan requirement (e.g. News → Funded).

### Readiness Tracker (`/tracker`)
- [ ] Select firms; the readiness score reflects your sim stats against each firm's published rules.
- [ ] Numbers match expectation for a known set of trades; no `NaN`/blank.

### Position Calculator (`/calculator`)
- [ ] Inputs validate; output respects each firm's drawdown limits; sane results at edge inputs (0, huge, negative).

### Sim Journal (`/journal`)
- [ ] Add a trade (all fields); it appears, persists on reload, and rule violations are flagged.
- [ ] Delete a trade; it's removed locally and server-side.
- [ ] Win-rate / R:R metrics recompute correctly.

### Challenge Lab (`/challenge-lab`)
- [ ] 4-week programme loads; psychology/discipline drills work; progress tracked.

### Chart (`/chart`)
- [ ] TradingView embed loads (15-min delayed); no CSP frame errors; responsive.

### Calendar (`/calendar`)
- [ ] Events/economic calendar render; timezone correct; no overflow on mobile.

### News (`/news`)
- [ ] Funded-tier gating correct; feed loads from `…/news`; cached/refreshes sensibly; non-Funded sees upsell.

### Integrations (`/integrations`)
- [ ] Content renders; any sync-dependent UI behaves; links valid.

**Notes:**

---

## 6. Learn (`/learn` + modules 1–7)

- [ ] `/learn` index lists modules with correct lock/complete state.
- [ ] Open each module `learn-module-1…7`: lessons render, images/diagrams load, navigation (next/prev) works.
- [ ] **Quizzes** — submit right/wrong answers; scoring correct; completion marks the lesson done (key like `l1-1 … l6-quiz`).
- [ ] Completing a lesson updates progress **and** syncs (see §3).
- [ ] Plan gating on advanced modules behaves.

**Notes:**

---

## 7. Firms, Firms index & Compare

- [ ] `/firms` lists all 16; each card links to its page.
- [ ] Spot-check several **firm pages** (`firm-ftmo`, `firm-apex-trader-funding`, `firm-topstep`, `firm-myfundedfutures`, `firm-the5ers`, `firm-fxify` …): rules/numbers look current and match the tracker's scoring.
- [ ] `/compare` — select firms; comparison table is accurate and readable on mobile.
- [ ] Confirm the "16 prop firms" claim is consistent everywhere (home, waitlist, firms).

**Notes:**

---

## 8. Marketing & legal

### Home (`/`)
- [ ] Hero, how-it-works, readiness, pricing sections render; all CTAs go to the right place.

### Waitlist (`/waitlist`) — recently updated
- [ ] New onboarding copy + "How early access works" steps render and read well.
- [ ] **iOS / TestFlight section** displays; screenshot placeholders show (swap in real screenshots when ready — see the `TODO` comment in `waitlist.html`).
- [ ] Roadmap reflects iOS beta + cross-device sync.
- [ ] **Form submit** — valid email → success state + toast; invalid email → error toast; posts to Formspree; UTM params captured from query string.

### FAQ / Privacy / Terms
- [ ] Render fully; up to date; "Akpan Holdings Limited" + 2026 footer correct; contact links work.

**Notes:**

---

## 9. PWA / offline / service worker

- [ ] **Install** prompt works (Add to Home Screen) on iOS Safari + Android Chrome; icon + name correct.
- [ ] Launches standalone (no browser chrome); status bar style ok.
- [ ] **Offline** — load once online, go offline, reload: app shell still loads (service worker `sw.js`).
- [ ] After a deploy, the **service worker updates** (no stale cached pages stuck forever).

**Notes:**

---

## 10. Issues already found in code (verify / fix)

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| 1 | P0 | Sync | Web `userdata.js` had a trailing slash → `//user` / `//news` 404 → web data never reached the cloud (silent localStorage fallback). **Fixed in this pass** — re-verify end-to-end after deploy (§3). | Fixed, verify |
| 2 | P1 | Sync parity | iOS `UserDataService` syncs **progress + firms only, not paper trades** — web logs trades to cloud, iOS does not. Trades won't round-trip from iPhone. Decide if that's acceptable for the iOS beta. | Decide |
| 3 | P0 | Payments | `deploy-payments` workflow failing on `AWS::EarlyValidation::ResourceExistenceCheck` (name collision with hand-made Lambdas). Resolving via **CloudFormation import (adopt in place)** — template made import-ready; console import pending (see `PAYMENTS-IMPORT-RUNBOOK.md`). URLs + names unchanged, so no frontend/Stripe edits. | In progress |

**Notes / new issues found while testing:**

| # | Severity | Page/Flow | What happened | Steps to reproduce |
|---|----------|-----------|---------------|--------------------|
|   |          |           |               |                    |
|   |          |           |               |                    |
|   |          |           |               |                    |

---

## 11. Sign-off

- [ ] Desktop pass complete — tester / date: ____________
- [ ] Mobile pass complete — tester / date: ____________
- [ ] All P0/P1 issues logged and triaged.
- [ ] Go / no-go for the next milestone: ____________
