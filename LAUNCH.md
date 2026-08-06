# Launch — the only list that matters

**Launch: Monday 24 August 2026, 08:00 BST.** It flips itself — `fullLaunch` in
`src/flags.json`. Nothing needs deploying that morning.

This file replaces the scattered TODO lists. Completed work has been **deleted,
not ticked** — if it isn't here, it's done. Where the state is genuinely
unknown, there's a test below rather than a guess.

Three sections: **do**, **check**, **decide**. Nothing else.

---

# 🔴 DECIDE — needs you, not code

## D1 — RESOLVED: launching free-only

Decided 2026-08-06. The site launches on 24 Aug with **free accounts only**.
Challenger and Funded Trader open when real-trade sync exists, gated by
`paidPlansOpen` in `flags.json` — one flag flip, no deploy.

Prices stay visible so the founding price-lock still works; the card reads
*"Opens when trade sync goes live — join free now and this price is yours when
it does."* The four connector-dependent features are marked "coming soon".

**You are pursuing (c) in parallel** — cTrader developer credentials. The day the
first connector is live: flip `paidPlansOpen`, un-dim those features.

## D2 — Weekly readiness report: BUILDING NOW

Decided: build it rather than drop it. Marked "coming soon" on the pricing page
until it ships.

## D4. Enterprise features listed without qualification

`/enterprise` honestly marks white-label and data-logging "on request". The
homepage pricing table lists them as plain Enterprise features. Make the pricing
table match the enterprise page.

---

# 🟠 DO — in this order

## Week 1

### 1. Resend sending domain — **start today, longest lead time**

Nothing else in email works until this is done, and DNS takes time to settle.
Full steps in `backend/marketing/README.md` §1. In short:

- resend.com/domains → add `traxent.io`, region **EU (Ireland)**
- Copy its DNS records into Cloudflare, all **DNS only (grey cloud)**
- Enter names as `send`, not `send.traxent.io` — Cloudflare appends the domain
- **Do not touch the root MX** — that's your inbound mail to Gmail
- Verify, then store the key:
  ```bash
  aws ssm put-parameter --name /traxent/resend/api_key --value "$(pbpaste)" \
    --type SecureString --overwrite --profile traxent --region eu-west-2
  ```

Until this is live, the prelaunch invite email and the Stripe welcome email are
both silent no-ops. They fail safely — but they fail.

### 2. Auth0 — three things, each a hard failure

- **M2M app with `delete:users`** → SSM. Without it **account deletion returns
  500**, which is an App Store 5.1.1 requirement and will fail review.
- **Allowed Callback URLs** for every gated deep link: `/dashboard`, `/journal`,
  `/tracker`, `/news`, `/learn-module-1` … `-7`, `/learn-201`, `/learn-301`,
  `/home`, `/admin`. Missing ones break login-return on that page only, which is
  why it's easy to miss.
- **Custom SMTP → Resend**, and enable both branded templates from `auth0/`.

### 3. Stripe live keys

`sk_live_`, the three live price IDs, and the live `whsec_` into SSM. Test one
real £4.99 purchase end to end and refund it.

### 4. Deploy the payments stack

Not automatic — `backend/template.yaml` changed for the marketing sync and the
new 7-day trial.

```bash
cd backend && sam build && sam deploy --stack-name traxent-backend \
  --profile traxent --resolve-s3 --capabilities CAPABILITY_IAM --region eu-west-2
```

### 5. Resend webhook

`resend.com/webhooks` → the `ResendWebhookUrl` stack output. Events:
`contact.updated`, `contact.deleted`, `email.bounced`, `email.complained`,
`suppression.added`, `suppression.removed`. Then:

```bash
aws ssm put-parameter --name /traxent/resend/webhook_secret --value "$(pbpaste)" \
  --type SecureString --overwrite --profile traxent --region eu-west-2
```

### 6. Migrate the Formspree list, then close that account

```bash
cd backend/marketing
node import-waitlist.mjs waitlist.csv --dry-run --profile traxent
node import-waitlist.mjs waitlist.csv --profile traxent
node export-subscribers.mjs --count --profile traxent
```

## Week 2

### 7. GDPR erasure spans two systems — I'll build this

`deleteSubscriber()` exists in `marketing.mjs` and is called from nowhere. An
Art. 17 request currently leaves the subscriber row and the Resend contact
behind. Small.

### 8. Account activity stats are fake

`account.html:551` reads localStorage keys the journal never writes, so a paying
member sees `0 / 0 / —` on a new device. The user-data API already has the real
numbers. Small — I'll do it.

### 9. News feed

Set `/traxent/news/alphavantage_key` (until then the endpoint returns an empty
feed — it's sold as "Advanced news sentiment engine" on Funded). Then retarget
`topics=` in `backend/functions/news-feed/index.mjs` from US equities to
futures/forex/indices, which is what your audience actually trades.

### 10. Stale copy

- `faq.html` says the blog is "coming soon". It exists.
- The blog isn't linked from any navigation — sitemap only.
- `waitlist.html` lists "News sentiment feed" under "coming soon". It's live.
- `risk-register.md:26` says the deploy uses long-lived AWS keys. It's been on
  OIDC for weeks — this **understates** your posture in the document an auditor
  reads first.

---

# 🔵 CHECK — state unknown, here's how to find out

Run these and tell me the results. Each is a single command or a single click.

## T1. Is the payments API actually under IaC?

Two docs disagree: `SECURITY-ACTIONS.md` says the import runbook is incomplete,
`SECURITY-BACKLOG.md` says it was resolved by adoption.

```bash
aws cloudformation describe-stack-resources --stack-name traxent-backend \
  --profile traxent --region eu-west-2 \
  --query "StackResources[?ResourceType=='AWS::ApiGateway::RestApi'].[LogicalResourceId,PhysicalResourceId]" \
  --output table
```

**Pass:** one row, PhysicalResourceId `da579ew81m`.
**Fail:** empty, or a different id — the console API was never adopted and a
`sam deploy` would create a second one.

## T2. Does account deletion work?

Sign in on the live site → `/account` → delete account. **Pass:** the account
goes and you're signed out. **Fail:** a 500, which means item 2 above.

## T3. Do gated deep links survive login?

Sign out, then paste each of these directly into a fresh tab:
`/dashboard`, `/journal`, `/tracker`, `/news`, `/learn-module-1`, `/learn-201`,
`/learn-301`, `/admin`.

**Pass:** login, then you land on **that page**.
**Fail:** an Auth0 callback error → that URL is missing from Allowed Callbacks.

## T4. Is Stripe in live mode?

```bash
aws ssm get-parameter --name /traxent/stripe/secret_key --with-decryption \
  --profile traxent --region eu-west-2 --query 'Parameter.Value' --output text | cut -c1-7
```

**Pass:** `sk_live`. **Fail:** `sk_test` — you'd take no real money.

## T5. Does the whole email chain work?

```bash
cd backend/marketing && node test-send.mjs davidansa00@gmail.com --profile traxent
```

Then in Gmail: **⋮ → Show original**. **Pass:** SPF, DKIM and DMARC all say
PASS, and it's in the inbox. **Fail on any one:** DNS isn't finished.

Then a live signup: enter an address on the home page. **Pass:** an invite
arrives within a minute.

## T6. Does the launch flip actually work?

Don't wait until the 24th to find out. In your browser console on traxent.io:

```js
// Pretend it's launch morning
TraxentFlags._reset();
await TraxentFlags.load('data:application/json,{"fullLaunch":{"enabled":true}}');
location.reload();
```

Simpler and safer: temporarily set `fullLaunch.enabled` to `true` in
`src/flags.json`, deploy, look at the site, set it back. **Pass:** nav shows
**Sign up** with **Sign in** beside it, the hero and banner stop asking for an
email. **Do this at least a week before launch.**

## T7. iOS — for your developer conversation

Confirm with them:

- The app is on **Akpan Holdings Limited's** Apple Developer account, not a
  personal one. Moving it later is painful, and TestFlight external testing
  needs the org account with a D-U-N-S number.
- **App Store Connect** access for you as Account Holder or Admin.
- Which Auth0 client id the app uses — the iOS one is already in
  `Auth0Audience`, so tokens should work, but have them confirm against the
  live API rather than assume.
- **Known gap:** the iOS app syncs progress and firm selections but **not paper
  trades**. `waitlist.html` promises "full sim-journal sync on iPhone" — check
  whether that's still 4–8 weeks away before founding members read it.
- Account deletion must work in-app (App Store 5.1.1) — this is T2 on iOS too.

---

# ⚪ DEFERRED — deliberately, don't reopen

| Item | Why it's parked |
|---|---|
| HTTP API JWT authorizer | The one change that can break **all** API auth. Not in launch week. |
| Nonce/hash CSP, drop `unsafe-inline` | Large refactor — every page uses `onclick=`. Post-launch. |
| S3 → CloudFront OAC | `SECURITY-ACTIONS.md` carries a **STOP** — doing the lock-down first 403s the whole site. |
| iOS certificate pinning | Needs a real pin from the iOS build. |
| Stripe webhook idempotency | After the payments cutover settles. |
| Edge member-redirect | Built, dormant, and the client-side fallback already removes the flash. Enhancement, not a fix. |
| SOC 2 / ISO 27001 | Correctly **not** claimed anywhere. See `docs/security/COMPLIANCE-ROADMAP.md`. |
| Cloudflare Turnstile | Honeypot + per-IP cap is proportionate until junk signups actually appear. |
| Seat enforcement, SSO plan inheritance | No enterprise customer yet. See `docs/ENTERPRISE.md`. |

---

*Superseded `PERSONAL_TODO.md`, `SECURITY-BACKLOG.md` and `WEBSITE-TEST-PLAN.md`
on 2026-08-06. Reference material — `DEPLOY.md`, `EMAIL-SETUP.md`,
`SECURITY-ACTIONS.md`, `docs/ENTERPRISE.md`, `docs/security/` — is unchanged and
still authoritative for how to do a thing, once you know it needs doing.*
