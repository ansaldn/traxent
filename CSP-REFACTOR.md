# CSP Hardening Plan — dropping `script-src 'unsafe-inline'` (H3)

**Status: Phases 1–2 SHIPPED (pilot).** `scripts/csp-inventory.mjs` (run it any time) found
56 pages / 126 inline blocks / 783 handlers, and two hazard pages to hand-fix before they can
be enforced: `tracker.html` (eval-pattern) and `home.html` (javascript: URL). The deploy-time
hasher `scripts/csp-hash.mjs` covers a 10-page pilot (hashes verified independently); it also
emits `'unsafe-hashes'` + per-handler hashes so inline handlers keep working under enforcement.
**Expand:** verify the pilot in a browser post-deploy (DevTools console — zero CSP violations,
pages interactive), then flip `PILOT` to `'ALL'` in `scripts/csp-hash.mjs`. Phase 3/4 below.

**Original plan (deliberately NOT executed in one pass):** The site is 44 static pages with
hundreds of inline `<script>` blocks and inline `onclick=` handlers, and every push auto-deploys
to production. A blind bulk refactor risks breaking live pages wholesale; this is the one
remaining lift that needs staged, verified work.

## Why it matters
`'unsafe-inline'` means any successfully injected `<script>` executes. Removing it is the single
biggest XSS-defence upgrade available (and a favourite auditor checkmark). Everything else about
the CSP is already strict.

## Chosen approach: build-time hashes (not nonces)
Nonces need a per-request server — impossible on S3/CloudFront static hosting without Lambda@Edge.
**Hash-based CSP works statically**: at deploy time, compute the SHA-256 of every inline script,
and emit them into the CSP. Browsers then execute only those exact scripts.

- Inline `<script>…</script>` blocks → `script-src 'sha256-…'` per block. Fully supported.
- Inline handlers (`onclick="…"`) → need `'unsafe-hashes'` + a hash per handler string, or
  (better) conversion to `addEventListener` in the page's inline block. Converting is the
  cleaner end-state; `'unsafe-hashes'` is an acceptable intermediate.

## Phases
1. **Inventory (safe, read-only).** Script counts inline blocks + inline handlers per page →
   `csp-inventory.json`. Confirms scale and finds dynamic-script edge cases (anything doing
   `document.write`/`eval` needs hand-fixing first).
2. **Build step (no behaviour change).** Add a deploy-workflow step after the `__BUILD_SHA__`
   stamping: for each HTML file, hash its inline blocks and rewrite the page's CSP meta to
   `script-src 'self' <existing hosts> 'sha256-…' …` — **keeping `'unsafe-inline'` for now**
   (browsers ignore `'unsafe-inline'` when hashes are present in CSP3, so modern browsers already
   get enforcement while old ones keep working — a built-in canary).
3. **Handler conversion (page-by-page).** Convert `onclick=` etc. to `addEventListener` in small
   batches — highest-traffic pages first (index, dashboard, learn) — testing each batch.
4. **Enforce.** Remove `'unsafe-inline'` from the page metas and the CloudFront function
   (`backend/cloudfront-functions/security-headers.js` must be updated in the same release).
   Watch browser-console reports; roll back is a one-line revert of the header function.

## Verification per phase
Load each changed page with DevTools console open — a CSP violation logs loudly; click through
the page's interactive elements (quizzes, calculators, journal). The deploy workflow's HTML
integrity check already guards against structural breakage.

## Effort estimate
Phase 1–2: one session (scripted). Phase 3: the long tail — a few pages at a time over several
sessions. Phase 4: trivial once 3 is done. Good cadence: one Phase-3 batch per monthly sweep.
