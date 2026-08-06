# Launch — the only list that matters

**Launch: Monday 24 August 2026, 08:00 BST.** It flips itself — `fullLaunch` in
`src/flags.json`. Nothing needs deploying that morning.

This file replaces the scattered TODO lists. Completed work has been **deleted,
not ticked** — if it isn't here, it's done. Where the state is genuinely
unknown, there's a test below rather than a guess.

Two sections left: **decide** (yours) and **check** (yours). The build
queue is empty.

---

# 🔴 DECIDE — needs you, not code

## D1. Enterprise features listed without qualification

`/enterprise` honestly marks white-label and data-logging "on request". The
homepage pricing table lists them as plain Enterprise features. Make the pricing
table match the enterprise page.

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

## T3. Spot-check one deep link

All 15 callback URLs are in (confirmed 2026-08-06). One check is enough to prove
the pattern works — if `/account` returns cleanly, the rest will too.

Sign out, paste `https://traxent.io/account` into a fresh tab. **Pass:** login,
then you land on the account page. **Fail:** an Auth0 callback error.

## T5. Does a live signup actually send an invite?

The domain is verified and `test-send.mjs` works — that half is proven. What
hasn't been exercised is the path through the deployed Lambda.

Enter an address on the home page. **Pass:** the invite arrives within a minute.
**Fail:** check CloudWatch for `traxent-subscribe` — most likely the deployed
function can't read `/traxent/resend/api_key`.

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
