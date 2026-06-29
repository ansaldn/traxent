# Traxent — Ideas & Roadmap

Two parts: (1) what I built this session beyond the brief, and (2) a prioritized list of
new ideas — several spec'd enough to build directly. Scored by **value** (to users/revenue)
and **effort**.

---

## 1. Shipped this session (new capabilities)

- **Best-matched firm engine** — the tracker now scores a user's habits against all 16
  firms and recommends the single best fit, with reasoning and a top-3 ranking. Answers
  "which prop firm is right for me?" from their data, not a guess.
- **16 prop firms** (up from 4) with researched, current published rules and clear caveats.
- **`/news` sentiment feed** — Funded-tier market news with bull/bear tags, pluggable
  provider, server-side gated.
- **Two new learn modules** — Psychology & Discipline, and Review & Building Your Edge —
  taking the path from 4 to 7 modules.
- **User-data backbone** — DynamoDB + Lambda + API (IaC) so progress, paper trades and firm
  selections persist across devices instead of living in one browser.

---

## 2. New ideas (prioritized)

### 🥇 High value

**A. "Firm Finder" onboarding quiz** — *Value: high · Effort: low-med*
A 5–6 question quiz (asset class, risk appetite, account size, futures vs forex, payout
speed) that funnels a brand-new visitor straight to their 2–3 best-fit firms using the
same engine as the best-match panel. Great top-of-funnel conversion tool; can run on the
public landing page (no login) to capture interest before the paywall.

**B. Readiness email digest** — *Value: high · Effort: med*
The pricing page already promises a "weekly readiness report email." Build it: an
EventBridge schedule → Lambda that reads each user's trades from the user-data table,
computes readiness vs their tracked firms, and emails a summary via SES. Strong retention
driver. (Depends on the user-data stack being live.)

**C. Side-by-side firm comparison page (`/compare`)** — *Value: high · Effort: low*
A sortable/filterable table of all 16 firms' rules (daily loss, max DD, consistency, min
days, asset class). Reuses the `FIRMS` dataset. SEO-friendly and genuinely useful — the
kind of page that ranks for "best prop firm" searches and pulls in organic traffic.

### 🥈 Medium value

**D. Live paper-trading mode** — *Value: high · Effort: high*
Let users place simulated trades against live prices (TradingView data already embedded) and
auto-log them to the journal/tracker, instead of manually entering stats. Turns Traxent from
a calculator into a practice platform — the natural moat. Big build; phase it.

**E. Streaks & milestones** — *Value: med · Effort: low*
Gamify discipline: consecutive on-plan days, "30 trades logged", "first 75% readiness". Small
localStorage/user-data additions; meaningfully lifts engagement and habit formation.

**F. Challenge cost calculator / ROI** — *Value: med · Effort: low*
Given a user's readiness and a firm's fee + payout split, estimate expected value of buying
that challenge now vs waiting. Ties the education directly to a financial decision.

### 🥉 Nice to have

**G. Discord/community integration** — *Value: med · Effort: med* — gated community for funded members.
**H. Mobile PWA polish** — *Value: med · Effort: low* — the manifest/SW exist; add offline lesson reading + install prompts.
**I. Affiliate links to firms** — *Value: high (revenue) · Effort: low* — most prop firms have affiliate programs; the comparison page and best-match panel are natural placements (disclose clearly; keep it non-advisory).

---

## 3. Recommended next two

If I pick up where this left off, I'd build **C (comparison page)** first — low effort, high
SEO/funnel value, reuses existing data — then **A (Firm Finder quiz)** to convert the traffic
it brings in. Both lean on the firm dataset and best-match engine already in place.
