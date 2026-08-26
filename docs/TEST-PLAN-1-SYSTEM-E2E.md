# Test Plan 1 — System End-to-End

**Status:** Ready to execute
**Written:** 2026-08-25
**Executed by:** David (solo)
**Scope:** traxent.io (web) + AWS backend + iOS app (Debug build on device)
**Environment:** Live production. Live Auth0. Live Stripe with a real card.
**Destructive scope approved:** purchase, upgrade, downgrade, cancel, cTrader connect, account deletion.

---

## 0. Read this before you touch anything

### 0.1 What this plan is

This is a **defect-hunting** pass. You are not judging whether Traxent is good — you are trying to break it. Test Plan 2 (`TEST-PLAN-2-TRADER-ZERO.md`) is where you judge whether it works as a product. Keep the two separate in your head, because they need opposite mindsets. Here you are hostile. There you are honest.

### 0.2 The two-account rule — do not skip this

You need **two separate accounts**, and you must not mix them up.

| | Purpose | Fate |
|---|---|---|
| **Account A — "burner"** | Everything in this plan. Buying, cancelling, connecting, deleting. | Destroyed at the end (Suite M). |
| **Account B — "real"** | Test Plan 2 only. Your genuine account as Trader Zero. | Never deleted. Never touched by this plan. |

Account A needs an email address you control that is **not** `davidansa00@gmail.com`. Gmail plus-addressing works and costs nothing: `davidansa00+burner@gmail.com` delivers to your normal inbox but Auth0 and Stripe treat it as a distinct identity.

**Do not create Account B until Test Plan 1 is finished.** Suite M deletes Account A, and account deletion is the single most likely place to hit a bug that takes out more than it should. Keep your real account out of the blast radius.

### 0.3 Money — what this will actually cost you

Stripe checkout is configured with `trial_period_days: 7` (`backend/functions/create-checkout/index.mjs:137`). That means:

- Card is authorised, **£0 is charged** at signup.
- If you cancel inside 7 days, you should never be billed.
- Worst realistic case if something goes wrong and you forget to cancel: **£29.99**.

Set a phone reminder for **day 5** the moment you complete Suite D. Do not rely on remembering.

One caveat I want you to go in knowing: **proration during a trial is not the same as proration on a live subscription.** Stripe generally does not prorate mid-trial plan changes, because there is nothing to prorate — no money has moved. So Suite J's proration tests may produce £0 invoices that look like a bug but aren't. I've flagged the specific steps where this applies. If you want to test proration *properly* you have to let the trial convert and pay for real, which pushes the cost to roughly £13 + £30 = £43. **My recommendation: don't.** Test the mechanics inside the trial, record what Stripe reports, and treat true post-trial proration as a separate paid test later. It's the same code path either way; only the numbers differ.

### 0.4 Financial-decision note

Suite H connects a cTrader account and Test Plan 2 involves buying a real prop-firm evaluation. I'm not a financial adviser and nothing in these documents is financial advice. Where a step involves risking money, I've said so plainly and left the decision with you.

### 0.5 Evidence capture

For every test, capture:

1. **Screenshot** — macOS `Cmd + Shift + 4`, then Space, then click the window. Saves to Desktop.
2. **Console log** — in Chrome, `Cmd + Option + J`. Screenshot anything red.
3. **Network** — Chrome `Cmd + Option + I` → Network tab. Leave it open the whole session with "Preserve log" ticked.

Name screenshots after the test ID: `B-03-fail.png`. Put them all in one folder on your Desktop called `traxent-test-1`.

**Content protection will fight you.** Paid lesson pages load `content-guard.js`, which disables copy, right-click and print. Screenshots still work. Don't waste time wondering why Cmd+C is dead on `/learn-module-*` — that's intentional.

### 0.6 Recording results

Log every result in `DEFECTS-WEB-BACKEND.md` or `DEFECTS-IOS.md`. Record **passes too** — a passed test is evidence, and an untested step is not a passed step. Use:

- **PASS** — behaved as expected.
- **FAIL** — did not. File a defect.
- **BLOCKED** — couldn't run it (dependency failed). Say what blocked it.
- **N/A** — not applicable in this environment.

### 0.7 This is now a post-fix verification pass

The plan was originally written to *discover* defects. It's now the instrument that confirms the two work orders were actually fixed, since you're testing after the teams have shipped.

That changes how to read the **`PREDICTED FAIL`** markers. Each one names a defect in `DEFECTS-WEB-BACKEND.md` or `DEFECTS-IOS.md`. **After the fixes land, every one of them should PASS.** A predicted-fail that still fails means the fix didn't work or wasn't done — go straight back to the work order item, don't re-diagnose it.

Six items that appeared in earlier drafts turned out not to be defects and have been removed from both work orders. The tests for them are gone from this plan too. They're listed in §5 of each work order so nobody re-raises them.

Three tests in here still have **genuinely unknown** outcomes — they're marked **`UNKNOWN`** rather than predicted. Those are the ones worth your full attention.

---

## Suite 0 — Setup

| ID | Step | Expected |
|---|---|---|
| **0-01** | Open Chrome. Open a **new Incognito window** (`Cmd + Shift + N`). Use Incognito for the whole of Suites A–B so no existing session interferes. | Clean browser state. |
| **0-02** | Open DevTools (`Cmd + Option + I`), Network tab, tick **Preserve log**. | Network panel recording. |
| **0-03** | Create the Desktop folder `traxent-test-1`. | Folder exists. |
| **0-04** | Decide Account A's email. Write it down here: `______________________` | Recorded. |
| **0-05** | Have a real payment card to hand. | Ready. |
| **0-06** | Open the Stripe Dashboard in a separate tab (live mode) — you'll need it to verify what actually happened at the billing layer. | Logged in. |
| **0-07** | Open the AWS CloudWatch Logs console in a separate tab, region **eu-west-2**. When something fails server-side, the reason is in there and nowhere else. | Logged in, correct region. |

---

## Suite A — Public site, unauthenticated

Run these in Incognito, signed out.

| ID | Test | Steps | Expected | Notes |
|---|---|---|---|---|
| **A-01** | Homepage loads | Go to `https://traxent.io` | Page renders, no console errors | |
| **A-02** | Launch state resolved | On the homepage, open Console and type `TraxentLaunch.state` then Enter | Should report `launched` — `flags.json` has `fullLaunch.launchAt = 2026-08-24T07:00:00Z`, which is now in the past | If it says `prelaunch`, the watchdog fell back and something is wrong with flags loading |
| **A-03** | Prelaunch copy is stale | Go to `https://traxent.io/signup`. Read the eyebrow text above the heading | **`PREDICTED FAIL`** — signup.html hardcodes "Prelaunch is open" even though the site is in `launched` state | Severity: Medium. Public-facing wrong copy |
| **A-04** | Pricing renders with plans closed | On the homepage, scroll to pricing | `flags.json → paidPlansOpen.enabled = false`, so every paid CTA should read "Create free account" + "Opens when trade sync goes live" | This is the *intended* behaviour. Note it, then see D-01 |
| **A-05** | Currency toggle | Toggle GBP → USD on the pricing grid | **`PREDICTED FAIL`** — USD figures are static strings (£4.99/$6.25, £12.99/$16.25, £29.99/$37.50), not FX-converted | Severity: Medium. This is a price displayed to a consumer that is not the price they'll pay. Worth treating as more than cosmetic |
| **A-06** | Free course is genuinely free | Go to `/learn-101` without signing in | Full lesson content loads, no gate | |
| **A-07** | Free course has no auth wiring | On `/learn-101`, open Console and type `window.TraxentData` | **`PREDICTED FAIL`** — returns `undefined`. `learn-101.html` never loads `auth.js` or `userdata.js` | Root cause of the biggest progress bug in the product. See F-01 |
| **A-08** | Waitlist signup | Go to `/waitlist`, enter Account A's email, submit | Success message. Check inbox for the instant invite email | Also tests the `/subscribe` endpoint — see A-09 |
| **A-09** | Public endpoint not locked out | In the Network tab, find the `POST /subscribe` request from A-08. Check its status code | **200.** If it's **401**, this is CRITICAL — see B1 in the defect register | `user-data/template.yaml:672-681` sets a `DefaultAuthorizer` with no route opting out. If that deployed as written, `/subscribe`, `/webhooks/resend`, `/enterprise/enquiry` and all of SCIM are dead |
| **A-10** | Resend webhook path | In CloudWatch, open the `resend-webhook` log group. Look for invocations in the last hour | Should show activity from A-08's email send | If silent *and* A-09 returned 401, B1 is confirmed |
| **A-11** | Enterprise enquiry | Go to `/enterprise`, submit the lead form with test data | 200, and you receive the SNS alert email | Same authorizer risk as A-09 |
| **A-12** | Firm pages | Open 3 of the 16 `/firm-*` pages at random | Content renders, rules present, `updated` date shown | Firm rules are duplicated in `content/firms.json`, `tracker.html`'s `FIRMS` array, and these pages — check the numbers agree across all three for the same firm |
| **A-13** | Blog | Go to `/blog`, open each of the 3 posts | All render | |
| **A-14** | FAQ contradiction | Go to `/faq`, search the page for "Coming soon" | **`PREDICTED FAIL`** — FAQ says a blog is "coming soon" while `/blog` already exists with 3 posts | Severity: Low |
| **A-15** | Legal pages | Open `/privacy`, `/terms`, `/security`, `/founding-terms` | All render | |
| **A-16** | security.txt | Go to `https://traxent.io/.well-known/security.txt` | Renders, contact address correct, expiry date **in the future** | An expired security.txt is worse than none |
| **A-17** | Member routes are not indexed | Go to `https://traxent.io/robots.txt` | `/home`, `/dashboard`, `/account`, `/learn*`, `/journal`, `/tracker`, `/admin` all `Disallow`ed | |
| **A-18** | Member routes bounce when signed out | While signed out, go directly to `/dashboard` | Redirects to auth, does not flash content first | Watch carefully for a flash of the page before the redirect — that's a content leak |
| **A-19** | Same for a paid module | While signed out, go directly to `/learn-module-5` | Same as A-18 | |
| **A-20** | Cookie consent | Fresh Incognito → load homepage | Consent banner appears. Decline. Reload. No analytics fires (check Network for Plausible) | |
| **A-21** | Service worker | DevTools → Application → Service Workers | `sw.js` registered, no errors | Stale SW caching is a classic source of "I deployed but nothing changed" |
| **A-22** | Dark mode consistency | Set macOS to Dark. Walk: `/` → `/firms` → a `firm-*` page → `/blog` → sign in → `/dashboard` → `/learn` → `learn-module-6` → `learn-module-7` → `/integrations` | **`WB-NEW-04`.** Before the fix, 23 of 57 pages had dark mode and the entire signed-in product had none — so this walk flipped theme repeatedly, most visibly between `learn-module-6` (light) and `learn-module-7` (dark). **The whole journey must now be consistent in whichever direction was chosen.** Screenshot every transition |

---

## Suite B — Signup and authentication

Still Incognito. **This is where Account A is born.**

| ID | Test | Steps | Expected |
|---|---|---|---|
| **B-01** | Signup page | Go to `/signup` | Renders. Marketing consent checkbox is present and **unticked** by default |
| **B-02** | Consent is genuinely opt-in | Leave the checkbox **unticked**. Click "Create my free account" | Auth0 Universal Login appears |
| **B-03** | Create the account | Sign up with Account A's email and a password you record in your password manager | Redirected to `/home` |
| **B-04** | Consent was respected | Once on `/home`, go to `/account` → Email preferences | Marketing toggle should be **OFF**. `auth.js` only ever POSTs `{subscribed:true}` — it never sends `false`. Confirm that an unticked box results in no opt-in record |
| **B-05** | Unverified email banner | On `/home`, look for the verification warning | Banner shown (you haven't verified yet) |
| **B-06** | Verification email | On `/account`, click "Resend verification email" | 200. Email arrives. Click the link |
| **B-07** | Banner clears | Sign out, sign back in, go to `/home` | Banner gone, `/account` shows "Verified". **If the banner persists after verifying, that's a token-refresh bug** — the ID token still carries the old `email_verified` claim |
| **B-08** | Nothing is enforced | Before verifying (if you can still test this), try accessing `/dashboard` | Email verification is **not enforced anywhere**. Confirm this is a deliberate product decision, not an oversight. It affects your abuse surface |
| **B-09** | Password reset | `/account` → password row → reset button | 200. Auth0 reset email arrives. Complete the reset. Sign in with the new password |
| **B-10** | Token is an ID token | DevTools → Network → any request to `gqway1e53f...`. Copy the `Authorization` header value (after `Bearer `). Paste into `jwt.io` | `aud` = `ilvfACgF2sCmLWaugCn11qTB04aTvWxz`. Confirms the app sends an **ID token**, not an access token, because no API audience is configured |
| **B-11** | Plan claim present | In the same decoded token, find `https://traxent.io/plan` | `free` |
| **B-12** | Session hint cookie | DevTools → Application → Cookies | `tx_session=1` present |
| **B-13** | Sign out clears it | Sign out | `tx_session` gone. Redirected to `/` |
| **B-14** | Sign back in | Sign in again | Lands on `/home` |

---

## Suite C — Free tier and gating

Signed in as Account A, plan `free`.

| ID | Test | Steps | Expected |
|---|---|---|---|
| **C-01** | Home page | `/home` | Greeting, plan pill reads "Free", feature grid, upsell slot |
| **C-02** | Support modal | `/home` → support | **`PREDICTED FAIL`** (as a product gap, not a crash) — it's a labelled placeholder with a `mailto:hello@traxent.io` link, no ticketing. Severity: Medium for launch readiness |
| **C-03** | Dashboard | `/dashboard` | 9 feature tiles, correct lock states for `free` |
| **C-04** | Free module opens | `/learn-module-1` | Opens (gated at `free`) |
| **C-05** | Observer module blocks | `/learn-module-2` | Redirects to `/dashboard?needs=observer`, no content flash |
| **C-06** | Challenger module blocks | `/learn-module-5` | Redirects to `/dashboard?needs=challenger` |
| **C-07** | Journal blocks | `/journal` | Redirects — requires `challenger` |
| **C-08** | Challenge Lab blocks | `/challenge-lab` | Redirects — requires `challenger` |
| **C-09** | Integrations blocks | `/integrations` | Redirects — requires `challenger` |
| **C-10** | News blocks | `/news` | Redirects — requires `funded_ready` |
| **C-11** | **Tracker does NOT block** | `/tracker` — type the URL directly | **`PREDICTED FAIL`** — `tracker.html` loads `auth.js` (`:348`) but never calls `requireMinPlan`, despite the dashboard advertising it as Challenger+. A free user gets a paid feature by typing the URL. **Severity: High — revenue leaking** |
| **C-11b** | News uses a second gating implementation | `/news` on free | Blocks — but via its own inline `PLAN_HIERARCHY` check at `news.html:353`, not `requireMinPlan`. Works, but two gating implementations is how the tracker ended up with none. Severity: Medium |
| **C-12** | News API enforces server-side | While on `free`, open Console and run: `fetch('https://gqway1e53f.execute-api.eu-west-2.amazonaws.com/news',{headers:{Authorization:'Bearer '+localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth0')))}}).then(r=>console.log(r.status))` | **403.** The point of this test: even if the *page* gate fails (as in C-11), the *API* gate should hold. Confirm the server is the real boundary |
| **C-13** | Calculator | `/calculator` | Opens on free (by design) |
| **C-14** | The data-loss pattern | On `/dashboard`, open Console and force an error: `window.dispatchEvent(new ErrorEvent('error',{error:new Error('test'),message:'test'}))`. Repeat on `/account` | **`PREDICTED FAIL`** — `/dashboard:432-435` and `/account:626-629` both run `localStorage.clear()` + redirect to `/` from a broad `catch`. That wipes local progress, journal config **and Auth0's cached credentials**. **Severity: Critical — silent data loss and forced sign-out from any unrelated JS error.** Note `/learn` does **not** do this, despite an earlier draft saying so — verify all three so we know the true blast radius |

> After C-14, expect your local state to be gone. That's the bug. Sign back in and continue.

---

## Suite D — Purchase

**Real card. Real Stripe. £0 today because of the 7-day trial.**

| ID | Test | Steps | Expected |
|---|---|---|---|
| **D-01** | The flag bypass | You're on `free`. Go to `/dashboard` and click any upgrade button | **`PREDICTED FAIL`** — `paidPlansOpen` is `false`, so the pricing page says purchasing is closed, but the dashboard and account upgrade buttons **do not consult the flag** and go straight to live Stripe checkout. **Severity: High.** You are about to exploit this bug to run the rest of the suite |
| **D-02** | Checkout session | Continue to Stripe | Stripe Checkout loads. Plan and price match what the page advertised |
| **D-03** | Trial disclosed | Read the Stripe Checkout page carefully | It should clearly state the 7-day trial and the amount and date of the first real charge. **If the trial is not disclosed on the page the user actually pays on, that's a consumer-transparency problem** |
| **D-04** | Buy Observer | Complete checkout for **Observer (£4.99)** with your real card | Redirected to `/dashboard?upgraded=true` |
| **D-05** | Set the reminder | Right now, set a phone alarm for **5 days from today**: "Cancel Traxent test sub" | Done |
| **D-06** | Stripe side | Stripe Dashboard → Customers → find Account A | Customer exists. Metadata contains `auth0_user_id` **and** `auth0_sub`. Subscription status `trialing`, £0 invoice |
| **D-07** | Webhook fired | Stripe Dashboard → Developers → Webhooks → recent deliveries | `checkout.session.completed` delivered, 200 response |
| **D-08** | Role flipped | Auth0 Dashboard → User Management → find Account A → Roles | Exactly one plan role, `observer`. **No leftover roles** |
| **D-09** | Client picked it up | Back on `/dashboard` | Plan pill reads "Observer" within ~15 seconds. `refreshPlan` polls 6× at 2.5s intervals |
| **D-10** | Poll timeout path | Note how long D-09 took | If it exceeded ~15s and you saw "sign out and back in", record it. **Severity: Medium** — a user who pays and doesn't immediately get what they paid for will assume it's broken |
| **D-11** | Welcome email | Check Account A's inbox | Welcome/plan-confirmation email from `hello@traxent.io` arrives |
| **D-12** | Soft opt-in marketing | `/account` → Email preferences | Stripe customers are added under `BASIS.SOFT_OPT_IN` (PECR reg 22(3)). Confirm the toggle now reflects that, and that the state shown to the user matches what's actually recorded |
| **D-13** | Profile mirrored | CloudWatch → `stripe-webhook` log group → latest invocation | Confirm the `PROFILE` row write to `TraxentUserData` succeeded. Note: this is try/catch-swallowed, so a failure here is **silent** and only visible in logs |
| **D-14** | Dedup row | DynamoDB → `TraxentWebhookDedup` | One row for the event ID, with a TTL ~3 days out |

---

## Suite E — Entitlement after purchase

Account A is now `observer`.

| ID | Test | Expected |
|---|---|---|
| **E-01** | `/learn-module-2`, `-3`, `-4` | All open |
| **E-02** | `/learn-module-5` | Still blocked (needs `challenger`) |
| **E-03** | `/chart`, `/calendar` | Open (observer-gated) |
| **E-04** | `/journal`, `/challenge-lab`, `/integrations` | Still blocked |
| **E-05** | `/news` | Still blocked. API still 403 |
| **E-06** | Token refreshed | Decode the current bearer token. `https://traxent.io/plan` = `observer` |
| **E-07** | Mis-sold feature | Compare: the homepage pricing array sells "Go-Live onboarding (Module 7)" as a **Funded Trader** feature, but `learn-module-7.html` is gated at **`challenger`**. **`PREDICTED FAIL`** — a Challenger user gets a feature sold at the tier above. Severity: Medium (mis-sold either way round) |

---

## Suite F — Learning centre and progress sync

**This is the highest-value suite in the plan.** Progress is the cross-platform contract between web and iOS, and I believe it's broken in at least four places.

| ID | Test | Steps | Expected |
|---|---|---|---|
| **F-01** | Free course progress is orphaned | Go to `/learn-101`. Complete the lessons and pass the quiz. Then go to `/learn` | **`PREDICTED FAIL`** — `learn-101` writes to localStorage key `tx_course_progress`; `/learn` reads only `traxent_progress`. **Module 1 will never show as complete.** Severity: High |
| **F-02** | Confirm the split | Console: `localStorage.getItem('tx_course_progress')` then `localStorage.getItem('traxent_progress')` | Two different keys holding different data. Confirms F-01's root cause |
| **F-03** | Per-lesson progress lost in 9 of 11 modules | Complete several individual lessons in `/learn-module-1` **without** taking the quiz. Check `/learn` | **`PREDICTED FAIL`** — modules 1–6 and 101/201/301 call `markLesson()` only with the *quiz* key. Per-lesson keys (`l1-1`, `l1-2`…) never written. Severity: High |
| **F-03b** | The two modules that work | Do the same in `/learn-module-8` — complete lessons, skip the quiz. Check `/learn` | **PREDICTED PASS.** `learn-module-8.html:590` writes per-lesson keys from `LESSON_KEYS`, and `-7.html:178` does the same. **This is the reference implementation for fixing the other nine** — confirm it behaves correctly so we know the fix pattern is sound before porting it |
| **F-04** | Now take the quiz | Pass the Module 1 quiz | Progress jumps. Network shows `PUT /user/progress` |
| **F-05** | Two different pass marks | Note the pass mark **displayed** in `learn-module-1`, then deliberately score between 75% and 79% | **`PREDICTED FAIL`** — the page displays "Pass 80%" (`:265`) but enforces `pct >= 75` (`:827`). You should be told you passed. Seven module pages have this mismatch (`-1, -2, -3, -4, -5, -6`); only `-8` displays 75% correctly. Severity: Medium |
| **F-05b** | Challenge Lab is stricter | Take a Challenge Lab quiz and score 76–79% | **PREDICTED FAIL of the quiz** — `challenge-lab.html:1485` genuinely enforces `>= 80`. So the product has **two different pass marks**. Determine whether that's deliberate. Severity: Medium |
| **F-06** | Cross-device sync is invisible | Sign in to Account A in a **different browser** (Safari). Go to `/learn` | **`PREDICTED FAIL`** — `/learn` never calls `TraxentData.sync()` and doesn't even load `userdata.js`. Server-side progress exists but the module index won't show it. Severity: High — this is the bug that will make users think their progress vanished |
| **F-07** | Server actually has it | Console on any page that *does* load `userdata.js`: `TraxentData.sync().then(d=>console.log(d.progress))` | Progress is there server-side. Confirms F-06 is a client-read bug, not data loss |
| **F-08** | One module, three numbers | Open "Going Live" from `/learn` and note the number shown on the index. Then note the number on the page itself. Then note it in the iOS Learn tab (K-04) | **`PREDICTED FAIL`** — index (`learn.html:391`) says **Module 11**, the page (`learn-module-7.html`) says **Module 7**, iOS `numLabel` says **Module 10**. Severity: Medium — confusing for users, ambiguous in support, and a maintenance trap |
| **F-09** | **Cross-platform curriculum** | Count modules and lesson keys in `/learn`. Then count them in the iOS Learn tab (K-04) | Web: **11 modules / 62 lesson keys**. iOS: **10 modules / 55 lessons**. **`PREDICTED FAIL`** — and the delta should be exactly web's `l8-*` "Trading Strategies" (7 keys). **Confirm the delta is only that module** — if anything else differs, the divergence is worse than a single missing module. Severity: High |
| **F-10** | Dead content file | Console: `fetch('/content/modules.json').then(r=>console.log(r.status))` | `src/content/modules.json` exists (schemaVersion 2, full structured lesson bodies) but **nothing on the web fetches it** — the live curriculum is the inline array in `learn.html`. Meanwhile **iOS fetches this exact URL** for remote content updates. Check whether it's actually published at `https://traxent.io/content/modules.json`. Severity: High if unpublished — the iOS remote-content pipeline silently no-ops |
| **F-11** | Content guard | On `/learn-module-2`, try `Cmd+C`, right-click, `Cmd+P` | All blocked. Watermark present. Working as designed |
| **F-12** | Progress payload is unvalidated | Console: `fetch(API+'/user/progress',{method:'PUT',headers:{...},body:JSON.stringify({progress:{junk:'x'.repeat(10000)}})})` | **`PREDICTED FAIL`** — the backend only checks `typeof progress === 'object'`. No shape or size validation. Arbitrary payloads get stored. Combined with no per-user rate limit, this is a storage-cost and abuse vector. Severity: Medium |

---

## Suite G — Tools

Upgrade Account A to **Challenger** first — but do that as test **J-01**, then come back here. Suites G, H and J interleave; J-01 is the gate.

| ID | Test | Expected |
|---|---|---|
| **G-01** | `/journal` opens | Blocking "Set up your sim challenge" overlay appears |
| **G-02** | Setup options | Firm list offers only FTMO / Apex / MyFundedFutures / FundedNext — **4 of the 16 firms the site markets**. Note the gap. Severity: Medium |
| **G-03** | Complete setup | Choose a firm, account size, phase. Account bar appears with sim balance, today's P&L, daily-limit used, drawdown floor |
| **G-04** | Log a trade | Trade appears. Network shows `POST /user/trades`. Balance and drawdown update correctly |
| **G-05** | Arithmetic check | Log 3 trades with known values. Verify daily-limit-used and drawdown-floor maths by hand against the firm's published rules. **Do this properly — if the numbers are wrong, the entire readiness score is wrong** |
| **G-06** | Delete a trade | `DELETE /user/trades/{id}`. Removed. Balance recalculates |
| **G-07** | Trade field truncation | Enter a note longer than 280 characters | Truncated server-side, no error |
| **G-08** | `/tracker` with data | Readiness score now non-zero. Best-matched firm panel populates |
| **G-09** | Firm cap | Try to select more than 12 firms | Capped at 12 |
| **G-10** | Firm data drift | Pick one firm. Compare its rules across `/tracker`, its `/firm-*` page, and `content/firms.json` | All three must agree. `updated: "2026-06-10"` — over two months stale. Severity: Medium, rising over time |
| **G-11** | `/challenge-lab` | 4-week programme renders. Weeks 1–3 lessons + quizzes. Week 4 links to `/journal?lab=week4` |
| **G-12** | Lab progress persists | Complete a lab item, reload | `traxent_lab_progress` retained |
| **G-13** | `/calculator` | Position sizing maths correct — verify one calculation by hand |
| **G-14** | `/chart`, `/calendar` | Load and render |
| **G-15** | Weekly digest | Note today's date. The readiness digest runs **Mondays 07:00 UTC** for `challenger`/`funded_ready`. If a Monday falls inside your test window, confirm the email arrives and its numbers match `/tracker` |

---

## Suite H — Integrations / cTrader

**You approved this. Be aware:** `ctrader-sync/index.mjs:19-22` carries an explicit header comment saying the code was written against the documented protocol **before cTrader app approval** and cannot be integration-tested until a real token exists. This suite is likely to be the first time it has ever run against reality.

| ID | Test | Expected |
|---|---|---|
| **H-01** | `/integrations` opens on Challenger | Connection quota shows **1** for Challenger |
| **H-02** | Non-cTrader providers | MT4/MT5 and others show "Notify me". Clicking `alert()`s "we'll email you". Confirm this is honest about not being available |
| **H-03** | `GET /user/ctrader/status` | Returns `{connected:false, authUrl:...}` |
| **H-04** | Start OAuth | Click connect. Redirects to cTrader with a `state` parameter present |
| **H-05** | State validation, tampered | **Security test — `WB-NEW-03`.** Copy the callback URL, change the `state` value, load it | Must be rejected **server-side** |
| **H-05b** | State validation, absent | **The actual bug.** Load `/integrations?code=<a valid code>` with **no `state` parameter at all** | Must be rejected. Before the fix this passed — the client check was `if (returned && sent && returned !== sent)`, so a missing state skipped the check entirely, and there was no server-side check. **If this still succeeds, `WB-NEW-03` was not fixed** |
| **H-05c** | State is server-generated | Inspect the `authUrl` returned by `GET /user/ctrader/status` | It must now contain a `state` parameter. Before the fix, the backend generated none and the client used `Math.random()` |
| **H-06** | Complete OAuth | Authorise with a real cTrader account | `POST /user/ctrader/exchange` returns 200. Status flips to connected |
| **H-07** | Tokens not leaked | Console: `TraxentData.sync().then(d=>console.log(d))` | `CONNECTION#ctrader` (holding `accessToken`/`refreshToken`) must **not** appear in the `GET /user` response. Confirm it doesn't |
| **H-08** | Manual sync | `POST /user/ctrader/sync` | Real deals appear as `realTrades`. **This is the moment of truth for the protobuf implementation** |
| **H-09** | If H-08 fails | CloudWatch → `ctrader-sync` log group. Capture the full error. This is expected-to-be-fragile code; a detailed log is more valuable than a pass |
| **H-10** | Scheduled sync | `ctrader-sync` also runs on `rate(6 hours)`. If you can wait, confirm the scheduled run also works. Otherwise mark BLOCKED |
| **H-11** | Data model mismatch | `integrations/README.md` proposes keys `TRADE#<connId>#<tradeId>` and `EQUITY#...`, but `ctrader-sync` actually writes `RTRADE#<dealId>`. **`PREDICTED FAIL`** — spec and implementation disagree. Severity: Medium (documentation debt that will bite the next connector) |
| **H-12** | Disconnect | `DELETE /user/ctrader`. Status returns to disconnected. Confirm in DynamoDB that the `CONNECTION#ctrader` row is gone | **PREDICTED PASS** — verified in source, this hard-deletes with a `DeleteCommand`. Confirm it, then move on |

---

## Suite I — Account management

| ID | Test | Expected |
|---|---|---|
| **I-01** | `/account` renders | Avatar, name, email, verified badge, plan badge |
| **I-02** | Edit name | `POST /user/profile` 200. Name updates. Reload persists |
| **I-03** | Name length cap | Enter a 200-character name | Truncated to 100 server-side |
| **I-04** | Change email | Change to a second address you control | 200. **Verification email sent to the new address.** Confirm the old address can no longer sign in only *after* verification, not before |
| **I-05** | Email collision | Try changing to an email already registered | Expect **409**. Confirm the error message doesn't leak whether that account exists (enumeration) |
| **I-06** | Change it back | Restore Account A's original email | |
| **I-07** | "Member since" | Read the Member since value | **`PREDICTED FAIL`** — falls back to the literal string **`'March 2026'`** when `updated_at` is missing. Severity: Low, but it's a fake fact shown to a user |
| **I-08** | Marketing toggle on | Toggle on → `POST /user/marketing`. Reload persists |
| **I-09** | Marketing toggle off | Toggle **off**. Reload. Check the DynamoDB row | **PREDICTED PASS** — verified in source. `account.html:865-881` posts the real boolean with a revert on failure; the backend writes `unsubscribed`. Confirm the row actually flips, then move on |
| **I-10** | Nightly reconcile | `reconcile-marketing` runs `cron(15 3 * * ? *)`. Next morning, check CloudWatch for drift between Resend and DynamoDB | No drift. If drift is found you'll get a summary email |
| **I-11** | Activity stats | Lessons / trades / readiness figures match what you've actually done | Compare against Suite F and G results. Given F-01/F-03, expect the lesson count to **under-report** |
| **I-12** | Managed identity | (Cannot test on Account A if you signed up with email.) Note that for Apple/Google identities the password row is replaced with "Managed by Apple/Google" text | Mark N/A if not applicable |
| **I-13** | Rate limiting on authed writes | Console: loop `POST /user/trades` 200 times | **`PREDICTED FAIL`** — there is **no per-user rate limit** on authenticated routes. Only the API-wide 100rps applies. Unbounded writes per token. Severity: Medium (cost + abuse). Stop after ~200 and clean up |

---

## Suite J — Billing lifecycle

Run **J-01 before Suite G**. The rest after.

| ID | Test | Steps | Expected |
|---|---|---|---|
| **J-01** | Upgrade Observer → Challenger | `/account` → switch tier → Challenger | `POST /change-plan`. Read the response |
| **J-02** | Proration behaviour, upgrade | Stripe Dashboard → the subscription → invoices | Code uses `proration_behavior: 'always_invoice'` for upgrades (`change-plan/index.mjs:114`). **But you're in a trial, so expect £0 and no proration.** Record exactly what Stripe reports — that's the finding, not a failure |
| **J-03** | Copy vs reality | The UI says "Upgrades charged pro-rata immediately; downgrades credit the difference to your next invoice." Compare to J-02 | If the user is in a trial and the copy says they'll be charged immediately, **the copy is wrong for trialling users**. Severity: Medium |
| **J-04** | Role flipped | Auth0 → Account A roles | `challenger`, and **`observer` removed**. If both are present, the role-removal step failed. Severity: High |
| **J-05** | Entitlement follows | `/journal`, `/challenge-lab`, `/integrations` now open. `/news` still blocked | |
| **J-06** | Upgrade to Funded Trader | `/account` → switch to Funded Trader (£29.99) | Same checks as J-01–J-05. `/news` now opens |
| **J-07** | News feed live | `/news` | **`UNKNOWN`** — depends on whether `/traxent/news/alphavantage_key` is set in SSM, which I can't see. If articles load, fine. If you get the "feed is being set up" state, the key is absent — that's **not a code defect** (the no-key path is the designed contract) but it is a billing question, since Funded Trader is £29.99/month and sells a news feature. Answer §6 Q3 of the web work order |
| **J-08** | Downgrade | `/account` → switch back to Challenger | `proration_behavior: 'create_prorations'` for downgrades. Confirm what Stripe does mid-trial |
| **J-09** | Same-plan no-op | Try switching to the plan you're already on | Returns `{unchanged:true}`, no Stripe call |
| **J-10** | 409 fallthrough | (Only testable after J-12.) With no active subscription, click a switch-tier button | `change-plan` returns 409 `no-subscription`, and the client should fall through to checkout |
| **J-11** | **Dunning gap** | Stripe Dashboard → Developers → Webhooks → check which events Traxent is subscribed to | **`PREDICTED FAIL`** — only `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted` are handled. **No `invoice.payment_failed`, no `customer.subscription.trial_will_end`.** With a 7-day trial and no dunning handler, a user whose first real charge fails **keeps their paid role indefinitely**. Severity: **Critical — this is direct, silent revenue loss** |
| **J-12** | Cancel | `/account` → danger zone → Cancel plan | Modal confirms. `POST /cancel`. Badge becomes "(cancels soon)". `cancelAt` date shown and correct |
| **J-13** | Stripe agrees | Stripe Dashboard | `cancel_at_period_end: true`. Subscription still `trialing`/`active` until the date |
| **J-14** | Role retained until period end | Auth0 roles | Still `challenger`. Access should continue until the cancel date, not stop immediately |
| **J-15** | No charge landed | Stripe → Account A → Payments | **£0.00 total.** If anything was actually charged, work out why before continuing |

---

## Suite K — iOS, Debug build on device

### K-0. Things that are NOT bugs on a Debug build

`CODE_SIGN_ENTITLEMENTS` is set on the **Release configuration only** (`project.pbxproj:294`). Debug builds therefore ship without Sign in with Apple and without `aps-environment`. **Do not file these:**

- Sign in with Apple fails / does nothing.
- Push notification registration fails.

Both are documented interim state in `iOSguide.md` §2A. Everything else in this suite is fair game.

**Device requirement:** `IPHONEOS_DEPLOYMENT_TARGET = 26.5`. Your test device must be on iOS 26.5 or later. This is an unusually narrow floor — flag it as a product question (K-20).

| ID | Test | Expected |
|---|---|---|
| **K-01** | Build and install | Xcode → your device → Run. App launches to "Traxent is loading", then the login screen |
| **K-02** | Sign in by email | "Continue with email" → Auth0 Universal Login → Account A | Reaches the tab bar. Note: `useEphemeralSession()` is deliberate, so you'll re-enter credentials every fresh sign-in — that's by design, not a bug |
| **K-03** | Guest mode | Sign out. Tap "Try Trading 101 free" | Guest learn opens. `module-101` accessible, all others show the gate sheet |
| **K-04** | **Curriculum parity** | Count modules and lessons in the Learn tab | iOS bundles **10 modules / 55 lessons**. Web claims **11 / ~60**. Cross-reference with F-09. **`PREDICTED FAIL`** |
| **K-05** | Remote content updater | Airplane mode off. Launch, wait, force-quit, relaunch | `ContentUpdater` fetches `https://traxent.io/content/modules.json`. **`PREDICTED FAIL` if unpublished** — the updater silently no-ops and you can never ship a content fix without an App Store release. Severity: High |
| **K-06** | Offline | Airplane mode on. Launch the app | Bundled catalogue works. Lessons readable. Illustrations render |
| **K-07** | Offline news | Airplane mode on → News tab | No offline cache exists (URLCache only). Confirm the empty/error state is **graceful and explains itself**, not a blank screen |
| **K-08** | Progress sync web → iOS | Complete lessons on web as Account A. On iOS, pull-to-refresh the Dashboard | Progress appears. `sync()` merges cloud ∪ local with `$0 \|\| $1`, so completion is never lost |
| **K-09** | Progress sync iOS → web | Complete a lesson on iOS. Check `/learn` on web | **`PREDICTED FAIL`** — `/learn` never calls `sync()` (F-06). The lesson is on the server but the web index won't show it |
| **K-10** | **Lesson gating under VoiceOver — run this test first** | Settings → Accessibility → VoiceOver **on**. Open a lesson. Navigate **by rotor / swipe-through-elements only, never scrolling**. Try to reach the "Continue to…" button at the bottom | Forward swipe is gated on an `onAppear` sentinel (`Color.clear` at the end of a `LazyVStack`, `LessonPagerView.swift:274`). **But there is an escape hatch** — the Continue button at `:260-270` calls `advance()` and bypasses the gate. The question is whether VoiceOver can reach a lazily-materialised button without the scroll that would also trip the sentinel. **Reachable → Low, design works. Not reachable → Critical, blind users cannot complete the curriculum.** This one test decides the severity of the top iOS defect, so do it early |
| **K-11** | Blocked-swipe feedback | With VoiceOver on, force a blocked swipe | An announcement **is** posted (`:82-83`, "Finish reading this lesson to continue") **and** the toast carries `.updatesFrequently` (`:112`). Both should happen — confirm the announcement is actually spoken, since that's what tells a stuck user what to do |
| **K-12** | Dynamic Type at AX5 | Settings → Accessibility → Display & Text Size → Larger Text → max | **`PREDICTED FAIL`** — buttons in Login, Paywall, Delete Account, Lesson and Tracker use hardcoded `.frame(height: 40–52)` with no `@ScaledMetric`. Expect clipped/truncated labels. Screenshot every clipped control. Severity: High |
| **K-13** | Light/dark | Toggle device appearance in both directions | Full support via `Color(light:dark:)`. No `preferredColorScheme` override anywhere. **Note the inconsistency: web is light-only, iOS follows the device.** That contradicts your own design rule — decide which platform is wrong |
| **K-14** | Reduce Motion | Enable it | Login stripes go static. Quiz and Lesson animations reduced |
| **K-15** | Differentiate Without Color | Enable it | Gain/loss indicators pair colour with arrows **and** a spoken label |
| **K-16** | iPad | Run on iPad if you have one | `.sidebarAdaptable` gives a sidebar. News uses `NavigationSplitView` at regular width |
| **K-17** | Privacy shield | Background the app (swipe up) | Shield overlay covers content in the app switcher |
| **K-18** | Capture protection | Screenshot a **paid** module (`minPlan > .free`) | `SecureContainer` blanks the content. Screenshot a free module — should be unprotected |
| **K-19** | Screen recording | Start a screen recording on a paid module | Cover overlay appears |
| **K-20** | Deployment target | Confirm the shipped build's minimum iOS version | Should now be **18.0** (or 17.0). `IOS-008` establishes that nothing in the code required 26.5 — the binding constraint is `Tab { }` and `.sidebarAdaptable` in `RootTabView.swift`. **If it's still 26.5, the fix wasn't done, and almost nobody can install the app** |
| **K-21** | **Paywall copy vs reality** | Open the Paywall. Read every Challenger bullet. Then try to find each feature in the app | **`PREDICTED FAIL`** — `PaywallView.swift:35-41` sells `"Live price data — real time"`, `"All 15 pattern signals"` and `"Sim trade journal + analytics"`. There is no price feed (charts are deterministic synthetic candles that label themselves "Illustrative example, not live market data"), and **no Journal feature exists in the iOS app at all**. **Severity: Critical — App Store Guideline 2.3.1 rejection risk, and a consumer-fairness problem regardless of Apple** |
| **K-22** | Paywall launch gate | `paidPlansOpen` fails **closed** on iOS (unlike web) | With the flag false, paywall buttons read "Opens when trade sync goes live" and are disabled — but only for `storePlan == .free`. Confirm. Note that iOS gets this right and web gets it wrong (D-01) |
| **K-23** | Web plan recognised | Account A is a paying Stripe subscriber. Check the iOS Account tab | `effectivePlan = max(Auth0 claim, StoreKit plan)`. Web plan should be honoured on iOS |
| **K-24** | **The reverse direction** | (Requires a sandbox App Store purchase — optional.) If you buy on iOS, check `/news` | **`PREDICTED FAIL`** — server-side App Store → Auth0 reconciliation is not built (`StoreService.swift:12`). Apple-billed subscribers are `free` on the server, so **News 403s for people who paid Apple**. Severity: Critical for iOS launch |
| **K-25** | Push token upload | After `IOS-016` adds Debug entitlements, opt in and watch the network call | `POST /user/device` **does** exist and works — it resolves via the `/user/{proxy+}` catch-all. Confirm a `DEVICE#<token>` row appears in DynamoDB. Then confirm `IOS-007`'s fix **deletes it on sign-out** |
| **K-26** | Deep links | Try any `traxent.io` link from Messages | Opens in Safari, not the app. No universal links, no `associated-domains`. **Missing feature, not a defect** — see §6 Q7 of the iOS work order for whether it should ship in v1 |
| **K-27** | Certificate pinning | `PinnedSession.swift` ships with an **empty pin table** — fail-open, behaves as default URLSession | Confirm the DEBUG `PINNING OBSERVED` log lines appear in Xcode console. Severity: Medium (security control that looks present but isn't) |
| **K-28** | Malformed content crash | (Optional, destructive to the build.) `assertionFailure` on malformed `Modules.json`/`Firms.json` **crashes Debug builds** | Note as a TestFlight-debug risk. Severity: Medium |
| **K-29** | Sign-out wipe — check all twelve keys | Sign out. Sign in as a **different** account. Then inspect UserDefaults | **`IOS-007`.** Seven keys were already cleared correctly. **Five were not:** `traxent_apns_token`, `traxent_push_optin`, `traxent_digest_last_shown`, `traxent_digest_count`, `traxent_news_filters`. All twelve must now be gone. The APNs one matters most — if it survives, user A's pushes reach user B's device once push ships |
| **K-29b** | Delete-account wipe | Delete an account on device, then sign in as another | `deleteAccount()` previously cleared **less** local state than sign-out did — it skipped `traxent_auth_method`. Both paths must now call the same `clearAllUserState()` |
| **K-29c** | Server-side device row | After K-29, check DynamoDB for the old account's `DEVICE#<token>` row | Must be gone (`WB-NEW-02` / **D4**). Local clearing alone doesn't fix the misrouting — the server row is what push-sender will read |

---

## Suite L — Security and privacy spot-checks

| ID | Test | Expected |
|---|---|---|
| **L-01** | No token in URLs | Search the Network log for `Bearer` or `id_token` in any query string | None |
| **L-02** | CSP | Check response headers on `/admin` and a `/learn-module-*` page | Page-specific strict CSP on `/admin`. No `unsafe-eval` |
| **L-03** | Security headers | Check any page's response headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy` present (delivered by `security-headers.js` CloudFront function) |
| **L-04** | CORS | From a different origin, attempt a call to the payments API | Rejected. REST API allows `https://traxent.io` only |
| **L-05** | Another user's data | Take Account A's token. Attempt `GET /user` with a manually altered `sub` claim | Rejected — signature check fails. Confirms tokens can't be forged |
| **L-06** | Admin gate | Go to `/admin` as Account A | "Not authorised". The real gate is `ADMIN_SUBS` in the Lambda, not the page |
| **L-07** | Admin as yourself | Sign in with your admin account (Account B later, or your existing one) → `/admin` | Metrics render: signups, active subs, MRR, plan mix, trades, lessons, firm selections |
| **L-08** | Admin partial failure | Note whether a partial-failure banner appears | If sub-queries error, the banner should name which |
| **L-09** | Subscribe enumeration | `POST /subscribe` twice with the same email | Identical responses both times — no way to tell whether the address already existed |
| **L-10** | Honeypot | Submit the waitlist form with the hidden `website` field populated (via DevTools) | Fake `200 {ok:true}`, **no record written**. Verify in DynamoDB |
| **L-11** | Subscribe rate limit | Submit `/subscribe` 11+ times from the same IP within an hour | 429 after 10 |
| **L-12** | Enquiry rate limit | Submit `/enterprise/enquiry` 6+ times | 429 after 5 |
| **L-13** | Webhook dedup fails open | Read `stripe-webhook/index.mjs:110-131` | **`PREDICTED FAIL`** — a DynamoDB error on the dedup table lets the event through. A Dynamo outage means duplicate role changes and duplicate welcome emails. Severity: Medium |
| **L-14** | Secrets | Confirm no Stripe/Auth0/Resend keys appear in any client-side JS or in the iOS binary | Clean. `.gitleaks.toml` and the pre-commit hook cover the repo; this checks the shipped artefacts |
| **L-15** | Alarms fire | CloudWatch → Alarms | The 4 alarms exist and are in OK state. If any suite triggered errors, confirm you got the SNS email |

---

## Suite M — Account deletion — **RUN LAST, IT IS TERMINAL**

Do not run this until every other suite is complete and recorded.

| ID | Test | Expected |
|---|---|---|
| **M-01** | Preconditions | Account A still has a cancelled-but-active subscription from J-12 | |
| **M-02** | Delete from web | `/account` → danger zone → Delete account | **`PREDICTED FAIL`** — `docs/WEB_BACKEND_REQUIREMENTS.md` records that `DELETE /user/account` **500s in production** due to a missing Auth0 Management API `delete:users` scope. **Severity: Critical.** This is a UK GDPR erasure obligation and, for the iOS app, an App Store Guideline 5.1.1(v) requirement. **This one blocks App Store submission** |
| **M-03** | Capture the failure | CloudWatch → `delete-account` log group | Capture the full error. Check whether `err.statusCode` / `step == "billing"` is set |
| **M-04** | Partial deletion? | If it 500'd, check: was the **Stripe subscription cancelled** before the Auth0 delete failed? | **This is the dangerous case.** A partial delete that kills billing but leaves the account is bad; one that deletes data but leaves billing running is worse. Determine exactly how far it got |
| **M-05** | Deliberate refusal | The code is written to refuse deletion of an account still being billed | Confirm the error message the user sees is clear about *why*, not a generic 500 |
| **M-06** | iOS deletion, free user, offline | On iOS with a **free** account: Airplane mode on → Account tab → Delete account | **PREDICTED PASS.** The block condition is `storePlan > .free && (autoRenewActive \|\| products.isEmpty)` (`DeleteAccountView.swift:29-31`), so a free user is never blocked. My first draft said otherwise and was wrong — confirm which is right |
| **M-06b** | iOS deletion, cancelled Apple subscriber, offline | Requires a sandbox subscription with auto-renew **turned off**. Airplane mode on → Delete account | **`PREDICTED FAIL`** — `products.isEmpty` masks the known `autoRenewActive == false`, so a user who has already cancelled is blocked from deleting. Narrow population, but a plausible reviewer scenario. Severity: High |
| **M-07** | If deletion succeeds | Verify: Auth0 user gone, `TraxentUserData` rows purged, Stripe subscription cancelled immediately (not at period end), marketing contact removed from Resend | All four |
| **M-08** | Post-deletion sign-in | Try to sign in as Account A | Fails. No orphaned session |
| **M-09** | Manual cleanup | If M-02 failed, manually cancel the Stripe subscription and delete the Auth0 user so nothing bills you | Confirm £0.00 lifetime charge on the customer |

---

## Suite N — Post-run

| ID | Step |
|---|---|
| **N-01** | Confirm Stripe shows **£0.00** total charged to Account A. If not, resolve it now |
| **N-02** | Confirm no Auth0 user or DynamoDB rows remain for Account A |
| **N-03** | Cancel your day-5 phone reminder |
| **N-04** | Consolidate all screenshots into `traxent-test-1` |
| **N-05** | Bring me the completed defect registers. I'll triage by severity and write the fix plan |
| **N-06** | **Only then** create Account B and start Test Plan 2 |

---

## Appendix A — Severity definitions

| Severity | Meaning | Response |
|---|---|---|
| **Critical** | Blocks launch. Data loss, money loss, legal/compliance exposure, or App Store rejection. | Fix before anything else ships. |
| **High** | Materially damages the product or leaks revenue. Users will hit it. | Fix before public launch. |
| **Medium** | Wrong, confusing, or risky, but survivable at launch. | Fix in the first patch window. |
| **Low** | Cosmetic or cleanup. | Backlog. |

---

## Appendix B — Fix verification checklist

Every line maps to a work order item. **After the fixes ship, all of these should pass.** A failure means that item wasn't fixed — go back to the work order, don't re-diagnose.

### Blockers — verify these before anything else
- [ ] **M-02** → `WB-002` — account deletion works. Blocks App Store submission
- [ ] **K-24** → `WB-NEW-01` — Apple-billed subscriber gets the right server-side plan; `/news` no longer 403s
- [ ] **K-20** → `IOS-008` — deployment target is 18.0 or 17.0, not 26.5
- [ ] **A-09** → `WB-003` — `POST /subscribe` returns 200 unauthenticated

### Security
- [ ] **H-05b** → `WB-NEW-03` — `?code=…` with **no** `state` is rejected server-side
- [ ] **H-05c** → `WB-NEW-03` — `authUrl` contains a server-generated `state`
- [ ] **K-29 / K-29b / K-29c** → `IOS-007` + `WB-NEW-02` — all twelve keys cleared on sign-out *and* delete; `DEVICE#` row removed server-side
- [ ] **I-13 / F-12** → `WB-014`, `WB-015` — per-user rate limit enforced; `progress` payload validated
- [ ] **K-27** → `IOS-006` — pinning either real or renamed; no "pinned" claim on `/security`

### Money
- [ ] **J-11** → `WB-001` — `invoice.payment_failed` and `trial_will_end` handled; failed charge downgrades the role
- [ ] **J-04** → `WB-012` — role removal and assignment both check `res.ok`; no user holds two plan roles
- [ ] **D-01** → `WB-006` — dashboard and account upgrade buttons honour `paidPlansOpen`
- [ ] **L-13** → `WB-023` — dedup failure emits a log line and metric
- [ ] **A-05** → `WB-018` — USD headline price marked or removed
- [ ] **E-07** → `WB-019` — Module 7 tier consistent across all four sources

### Data integrity and progress
- [ ] **C-14** → `WB-004` — forced JS error no longer wipes localStorage or credentials
- [ ] **F-01** → `WB-007` — Trading 101 completion shows on `/learn`
- [ ] **F-03** → `WB-008` — per-lesson ticks appear in all eleven modules
- [ ] **F-06** → `WB-009` — progress visible in a different browser
- [ ] **F-09 / K-04** → `WB-010` / `IOS-009` — web and iOS lesson-key sets identical
- [ ] **F-10 / K-05** → `WB-011` — `content/modules.json` published and rendering; iOS adopts it

### Entitlement
- [ ] **C-11** → `WB-005` — `/tracker` blocks free users
- [ ] **C-11b** → `WB-005` — `/news` uses the shared gate helper

### Accessibility and iOS
- [ ] **K-10** → `IOS-001` — continue button reachable by VoiceOver rotor navigation
- [ ] **K-12** → `IOS-005` — no clipped controls at AX5
- [ ] **K-21** → `IOS-002` — paywall bullets describe what the app actually does
- [ ] **M-06b** → `IOS-004` — cancelled Apple subscriber can delete offline
- [ ] **K-28** → `IOS-013` — malformed content shows an error state, not a crash or a blank
- [ ] **A-22** → `WB-NEW-04` — dark mode consistent across the whole journey

### Content and copy
- [ ] **F-05 / F-05b** → `WB-020` — one pass mark, generated from the constant
- [ ] **F-08** → `WB-021` — one number per module everywhere
- [ ] **A-03** → `WB-017` — no "prelaunch" copy after launch
- [ ] **I-07** → `WB-022` — no fabricated "Member since"
- [ ] **G-02** → `WB-024` — journal firm coverage resolved
- [ ] **G-10** → `WB-025` — firm rules from one source, re-verified against each firm's own site
- [ ] **A-14** → `WB-028` — FAQ blog line corrected

### Confirm these still pass — they were never broken
- [ ] **F-03b** — modules 7 and 8 write per-lesson keys (the pattern the other nine were ported to)
- [ ] **H-12** — `DELETE /user/ctrader` hard-deletes the token row
- [ ] **I-09** — marketing toggle writes `false`
- [ ] **K-11** — blocked-swipe announcement spoken
- [ ] **K-22** — iOS `paidPlansOpen` fails closed
- [ ] **M-06** — free user can delete offline
- [ ] **K-25** — `POST /user/device` resolves

---

## Appendix C — The three genuinely unknown outcomes

Everything else in Appendix B has a known answer in source. These three don't, and they're the ones to pay attention to:

| Test | Question | Why it can't be answered from source |
|---|---|---|
| **K-10** | Can VoiceOver reach the lesson continue button? | Depends on how `LazyVStack` materialises children under accessibility focus. Only a device answers this. If `IOS-001`'s fix (hoist the button to a fixed footer) shipped, it should pass regardless |
| **J-07 / §6 Q3** | Is the Alpha Vantage key set in SSM? | I can't see your parameter store. Not a code defect either way — but it decides whether the £29.99 tier ships with a working news feature |
| **G-10 / TP2 Phase 5** | Do Traxent's firm rules match each firm's own published rules today? | Requires checking 16 external sites. The data is stamped `2026-06-10`. **Users make financial decisions on these numbers** — this is the one to be most careful about |

---

## Appendix D — If a fix-verification test fails

Don't re-diagnose. Every item in Appendix B maps to a work order entry with a root cause, exact file:line references, and a prescribed fix. A failure means one of three things:

1. **The fix wasn't done** — check the work order status.
2. **The fix was done but is incomplete** — the work order entry describes the full scope; compare against what shipped.
3. **The fix introduced something new** — this is the one worth escalating. Capture it as a fresh defect with the template at the end of the relevant work order.

Note for context: eight claims in the first draft of these work orders turned out to be wrong on closer inspection, and six items were dropped entirely because they weren't defects. That correction happened before anything reached the teams. Apply the same scepticism to anything you find during the run — reproduce it twice before filing.

---

## Appendix E — Standing observation: no automated tests exist

Neither repo contains a real test. No jest, vitest, mocha, XCTest, XCUITest or Swift Testing. No test target in the Xcode project (one `PBXNativeTarget`, the app). Four backend `package.json` files carry a `"test"` script, but all four are the npm-init placeholder that exits 1. CI runs `check-routes.py`, gitleaks and a report-only semgrep.

That's the reason this document is thirty predictions long and executed entirely by hand. It isn't a defect to file — it's the condition that produced the defect list. Worth deciding what to do about it once the register is triaged; the six highest-value checks are listed at the end of `DEFECTS-WEB-BACKEND.md`.
