# Launch — the only list that matters

**Launch: Monday 24 August 2026, 08:00 BST.** It flips itself — `fullLaunch` in
`src/flags.json`. Nothing needs deploying that morning.

Completed work is **deleted, not ticked** — if it isn't here, it's done. Where
the state is genuinely unknown there's a test below rather than a guess.

Everything on main is pushed and deployed. The build queue is empty. What's
left is **two judgement calls, three checks, and some tidying.**

*Last verified against the repo on 2026-08-06.*

---

# 🔴 DECIDE — needs you, not code

## D1. The news feed works, but is it showing the right news?

Confirmed live: 50 stories, sentiment tags, filters, `FUNDED TRADER` gate all
working. The key in SSM is being read correctly.

The remaining question is editorial, not technical. The top stories are Royal
Caribbean earnings, an ADM dividend hike, and a PPL Corporation stock outlook.
Traxent's audience trades **index futures, FX and metals** — none of those three
stories helps anyone decide whether they're ready for a funded challenge.

That's the `financial_markets` topic doing it. Alpha Vantage has no futures or FX
topic, so the options are:

| Option | Result |
|---|---|
| **Drop `financial_markets`** | Macro + monetary + fiscal only. Fewer stories, but every one is a rate decision, a CPI print, a central-bank speech — things that actually move ES and the dollar. Risk: on a quiet week the feed could look thin. |
| **Keep it** | 50 stories always, but most are single-stock US equity coverage your audience doesn't trade. |
| **Keep it and filter harder** | Extend the noise regex to drop anything whose only tickers are single equities. More code, and it'll misfire occasionally. |

My read: **drop it.** A feed of ten genuinely relevant macro stories is worth
more to a futures trader than fifty stories about cruise lines, and a thin
honest feed is easier to defend than a full irrelevant one. But this is a
product call about what your users want to read, so it's yours. One line in
`backend/functions/news-feed/index.mjs:90` either way.

## D2. When do paid plans open?

`paidPlansOpen` is `false`, deliberately — the site launches on 24 August with
**free accounts only**, because real-trade sync is what Challenger and Funded
Trader are sold on and no broker connector exists yet.

Nothing to do before launch. But know that this is a flag flip and nothing else:
the day the first connector is live, set it true and the pricing page becomes
purchasable with no deploy. Until then the cards say *"Opens when trade sync
goes live — join free now and this price is yours when it does."*

Worth deciding roughly when you're telling founding members that is, since
they'll ask.

---

# 🔵 CHECK — state unknown, here's how to find out

## T1. Account deletion — real root cause found & fixed (2026-08-26)

Three things were blamed over time; only the third was the actual live bug:

1. **SSM names** (fixed earlier) — used to read `mgmt_*` params that were never
   created → `getParam` threw. Renamed to `m2m_*` (commit `954a294`).
2. **`delete:users` scope** (never the problem) — CONFIRMED ACTIVE on the
   **Traxent Backend** M2M app (`fkUa17h4Bnup7ch8jvR5ih71VrZuSmQF`), verified in
   the Auth0 dashboard 2026-08-26 (`read:users` + `update:users` + `delete:users`,
   6/273). It had been active for weeks. A red herring.
3. **Wrong Auth0 domain for the Management call** (THE bug, fixed in code
   2026-08-26) — delete-account minted its Management API token against the
   CUSTOM domain (`AUTH0_ISSUER` = `auth.traxent.io`), which validates user
   tokens but **cannot mint Management API tokens** — the same gotcha the
   account-linking Action hit. `stripe-webhook` and `account-update` read the
   canonical domain from `/traxent/auth0/domain` (`dev-…us.auth0.com`) and work;
   delete-account used `new URL(ISSUER).hostname`. It now reads
   `/traxent/auth0/domain` like its siblings.

Error visibility was fixed too: the Lambda returns a named `step` (`billing` /
`data_purge` / `auth0_credentials` / `auth0_token` / `auth0_delete`) instead of a
bare `deletion_failed`.

**Deploy Infra, then prove it in prod** (no code change can do this last part):

### Confirm — delete one throwaway account (the definitive test)

Create a throwaway account, delete it from `/account`, and confirm a **204** (and
that the Auth0 user is gone). If it still 500s, the response now carries the
exact `step` — send me that value and it points straight at the cause. Do NOT
re-attribute a failure to `delete:users`; that scope is confirmed present above.

If it isn't ticked: tick it, save, and retest. No deploy needed — the scope is
granted on Auth0's side.

### Step 2 — if that wasn't it, read the step name

Deploy the current main, then retry the deletion. The browser console now prints:

```
Account deletion failed: status=500 step=auth0_delete …
```

Or from CloudWatch:

```bash
aws logs tail /aws/lambda/traxent-delete-account --since 15m \
  --filter-pattern "DELETE-ACCOUNT FAILED" --profile traxent --region eu-west-2
```

| `step=` | What it means |
|---|---|
| `billing` | Found a live Stripe subscription and couldn't cancel it. Deletion stopped on purpose — deleting an account that's still being charged is worse than failing. |
| `data_purge` | DynamoDB. Permissions or table name. |
| `auth0_credentials` | The m2m id/secret couldn't be read from SSM. |
| `auth0_token` | Client-credentials grant refused. The log carries Auth0's own sentence. |
| `auth0_delete` | The delete call itself — this is the `delete:users` scope in Step 1. |

Send me the step and I'll go straight to it rather than guessing again.

This matters beyond the website: App Store 5.1.1 requires in-app account
deletion, and the iOS app calls this same endpoint.

## T2. Does the launch flip look right?

On traxent.io, in the console:

```js
TraxentLaunch.preview('launched')
```

**Pass:** nav becomes **Sign up** with **Sign in** beside it, the hero and
banner stop asking for an email and offer account creation, and the pricing
cards still say "Opens when trade sync goes live" — paid plans are a separate
flag, so they stay shut.

Then put it back:

```js
TraxentLaunch.preview()
```

Local and visual only — it touches nothing on the server, and a reload resets it
regardless. Worth doing on `/`, `/open` and `/waitlist`, which all carry gated
blocks.

## T3. iOS — for your developer conversation

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
- Account deletion must work in-app — same endpoint as T1, same guideline 5.1.1.

---

# 🟡 TIDYING — no rush, but it's cluttering the repo

You asked to close all branches and work out of main. Locally that's done —
`main` is the only branch and the working tree is clean. The **remote** still
has 34 branches:

| Branches | What to do |
|---|---|
| **31 dependabot** | These are dependency bumps GitHub opened on its own. Most are Stripe and AWS SDK minor versions. Worth merging in a batch **after** launch, not during launch week — a surprise SDK change on 23 August is the last thing you need. |
| `chore/md-action-items`, `feat/iso27001-soc2-readiness` | Fully merged into main, 0 unique commits. Safe to delete. |
| `feat/blog` | 2 commits not in main, but they're a **stale snapshot** — the marketing tooling in them already exists in main in a later form. Nothing to salvage. Safe to delete. |

**Deleting the three — one command, in Terminal, from the repo folder:**

```bash
cd ~/Documents/traxent-web && git push origin --delete chore/md-action-items feat/iso27001-soc2-readiness feat/blog
```

I can't run this myself — pushing needs your GitHub credentials, which the
sandbox I work in deliberately doesn't have.

---

# ⚪ DEFERRED — deliberately, don't reopen

| Item | Why it's parked |
|---|---|
| HTTP API JWT authorizer | The one change that can break **all** API auth. Not in launch week. |
| Nonce/hash CSP, drop `unsafe-inline` | Large refactor — every page uses `onclick=`. Post-launch. |
| S3 → CloudFront OAC | `SECURITY-ACTIONS.md` carries a **STOP** — doing the lock-down first 403s the whole site. |
| iOS certificate pinning | Needs a real pin from the iOS build. |
| Stripe webhook idempotency | After the payments cutover settles. |
| Payments CloudFormation import | Template is ready with `DeletionPolicy: Retain`; the console import is a clickOps job with no deadline attached. |
| Edge member-redirect | Built, dormant, and the client-side fallback already removes the flash. Enhancement, not a fix. |
| SOC 2 / ISO 27001 | Correctly **not** claimed anywhere. See `docs/security/COMPLIANCE-ROADMAP.md`. |
| Cloudflare Turnstile | Honeypot + per-IP cap is proportionate until junk signups actually appear. |
| Seat enforcement, SSO plan inheritance | No enterprise customer yet. See `docs/ENTERPRISE.md`. |
| Broker connectors (MT4/5, cTrader, TradingView) | Blocked on broker approval, not on code. Drives D2. |

---

*Superseded `PERSONAL_TODO.md`, `SECURITY-BACKLOG.md` and `WEBSITE-TEST-PLAN.md`
on 2026-08-06. Reference material — `DEPLOY.md`, `EMAIL-SETUP.md`,
`SECURITY-ACTIONS.md`, `docs/ENTERPRISE.md`, `docs/security/` — is unchanged and
still authoritative for how to do a thing, once you know it needs doing.*
