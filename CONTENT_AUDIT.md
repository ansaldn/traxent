# Traxent — Content & Product Audit

Based on a logged-in walk-through of the live site (Funded Trader account) plus the codebase.
Overall: the product is in strong shape — the tracker, learn path, calculator, challenge lab,
and news feed all work and the writing is consistent and on-brand. Below is what's working,
what to fix, and the one live bug (cancel) with its root cause.

## Verdict
~80–85% launch-ready on content. No broken pages, consistent voice, good disclaimers
throughout (important for a non-advice trading product). The gaps are polish and a few
config/data issues, not missing functionality.

---

## Live bug — cancel plan (root cause found)
Cancelling a plan returns **404 "No customer found."** The Lambda authenticates fine (the
audience fix is live); it just can't find a Stripe customer for the account. Causes, in order
of likelihood given your test→prod move:

1. **Customer has no `auth0_user_id` metadata.** The original checkout set that metadata on the
   *session/subscription*, not the *customer object*, so the cancel search found nothing. **Fixed**
   in code: cancel now tries `auth0_user_id`, then `auth0_sub`, then falls back to an **email**
   match (mirrors delete-account). Redeploy `cancel-subscription` to apply.
2. **Test vs live mode mismatch.** If `/traxent/stripe/secret_key` is now the **live** key but the
   subscription you're testing was created in **test** mode, the live key can't see it. Verify the
   subscription exists in Stripe **live** mode.
3. **Plan granted manually.** If your `funded_ready` was set via an Auth0 role (not a real Stripe
   purchase), there's genuinely no subscription to cancel — 404 is correct. Do a real live checkout
   to test cancel end-to-end.

### Stripe test→prod checklist (verify all SSM params are LIVE values)
- `/traxent/stripe/secret_key` → `sk_live_…`
- `/traxent/stripe/price_observer` / `_challenger` / `_funded_ready` → **live** price IDs
  (used by create-checkout AND the webhook's price→plan map; if these are still test IDs, new
  purchases won't map to a plan and the role won't be assigned).
- `/traxent/stripe/webhook_secret` → the **live** endpoint's `whsec_…`, and the Stripe webhook
  endpoint is configured in **live** mode pointing at your `/webhook` route.
- Confirm the live webhook is actually receiving events (Stripe Dashboard → Developers → Webhooks → live).

---

## Page-by-page

**Landing (`/`)** — Strong. USP ("Sixteen firms. One score.") now matches the tracker. The 4
example readiness cards are illustrative; consider a small "example" label so visitors don't read
them as their own scores.

**Dashboard** — Clean; all 8 feature cards present including the now-live News card. Minor copy:
a Funded Trader sees "let's get you there" — reword the funded-tier subline (they're already there).

**Readiness tracker** — Excellent. 16 firms, the best-match panel, full rule-by-rule breakdown.
Two notes: (1) with the conservative default inputs several firms tie at 100%, so "best match"
is whichever sorts first — add a tiebreaker (e.g. prefer the firm with the most non-N/A rules
passed, or show "3-way tie"). (2) Consider a one-line "these are example numbers — edit your
habits above" hint near the top so new users know the scores are driven by their inputs.

**News feed** — Live and working (50 articles, real bull/bear/neutral tags, sources, tickers).
Issues to tune:
- **Scrolling** — one long list. *Fixed* (pagination + filters built; push `news.html`).
- **Relevance/fit** — the feed is general US equities (JPM, Costco, REITs). Your audience trades
  **futures/forex/indices**. Tune the Lambda's `topics` to `economy_macro,financial_markets,
  economy_monetary,finance` and consider filtering to index/forex/commodity tickers (ES, NQ, SPY,
  QQQ, DXY, GC, CL, EURUSD…) so it reads like a trader's feed, not a stock-picker's.
- **Noise** — lots of "class action / SEC Form 144" filings and duplicate stories. Add a simple
  dedupe (by title) and a title-keyword blocklist ("class action", "Form 144", "investor notice").

**Learn (7 modules)** — Solid, consistent structure, real lessons + quizzes. Modules 5 & 6 match
the originals. No content gaps. (Optional: a short "what's next" CTA at the end of Module 6 → tracker.)

**Calculator / Chart / Challenge Lab / Calendar / Journal** — All functional and on-brand. The
account page's journal stats are still a placeholder ("until journal is wired to DB") — the
user-data stack now makes wiring this possible (see DEPLOY.md §4 wiring note).

**Compare (`/compare`)** — New public page; good SEO/funnel asset. Keep its firm numbers in sync
with the tracker (they're currently duplicated — a future "single source of truth" `GET /firms`
endpoint, per the iOS brief P1-5, would remove the drift risk).

**FAQ / Privacy / Terms** — Present and stable; required for App/Play review and ads.

---

## Priority fixes (ranked)
1. **Redeploy `cancel-subscription`** (fix is in) + verify the Stripe live config above.
2. **Push `news.html`** (pagination + filters) and **tune the news topics/filtering** to traders.
3. Minor copy: funded-tier dashboard subline; "example" labels on landing + tracker.
4. Best-match tiebreaker when firms tie at 100%.
5. Wire the journal/account stats to the user-data DB (removes the last placeholder).
