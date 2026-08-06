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

## T1. Does account deletion work?

Sign in on the live site → `/account` → delete account. **Pass:** the account
goes and you're signed out. **Fail:** a 500, which means item 2 above.

## T2. Does the launch flip look right?

The old instructions here were wrong: they used top-level `await`, which is a
syntax error in Safari's console, and then called `location.reload()`, which
would have thrown the override away anyway. Replaced with a proper test hook.

On traxent.io, in the console:

```js
TraxentLaunch.preview('launched')
```

**Pass:** nav becomes **Sign up** with **Sign in** beside it, the hero and
banner stop asking for an email and offer account creation, and the pricing
cards still say "Opens when trade sync goes live" (paid plans are a separate
flag, so they stay shut).

Then put it back:

```js
TraxentLaunch.preview()
```

Local and visual only — it touches nothing on the server and a reload resets it
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
