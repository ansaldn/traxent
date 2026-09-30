# Traxent — hosting topology & outage runbook

> Written after the 2026-09-22 outage, where an unpaid **£2** AWS balance
> suspended the account, took CloudFront offline, and surfaced as a Cloudflare
> **Error 1016** on traxent.io. Most of that hour was spent rediscovering *how
> the site is hosted*. This file exists so that never happens again.

## The request path

```
visitor
  → Cloudflare          (DNS + proxy, "orange cloud")
      → CloudFront      distribution E2RA25KNTQMO22  →  d19xn3c9xuxe68.cloudfront.net
          → S3          website endpoint: traxent.io.s3-website.eu-west-2.amazonaws.com
              (bucket s3://traxent.io, region eu-west-2)
```

| Layer | Identifier | Notes |
|---|---|---|
| Cloudflare DNS | `traxent.io` + `www.traxent.io` → CNAME → `d19xn3c9xuxe68.cloudfront.net` | **Proxied** (orange). These two records are what break if the origin disappears. |
| CloudFront | distribution **`E2RA25KNTQMO22`** | Aliases: `traxent.io`, `www.traxent.io`. Config changes take 5-15 min to reach `Deployed`. |
| Origin | `traxent.io.s3-website.eu-west-2.amazonaws.com` | The S3 **website** endpoint, NOT the REST endpoint. |
| Bucket | `s3://traxent.io` (eu-west-2) | Populated by `.github/workflows/deploy.yml` (`aws s3 sync src/`). |

**Why the origin must stay the S3 *website* endpoint:** the site serves clean URLs
(`/learn-101`, not `/learn-101.html`). S3 website hosting resolves those via its
index/error-document handling. Swapping to the REST endpoint + OAC would break
every deep link unless a CloudFront Function is added to rewrite paths. If the
distribution is ever rebuilt, use the website endpoint as a **custom origin**.

## NOT behind Cloudflare / CloudFront

These are separate and stay up when the website is down — which is why the iOS
app kept working through the 2026-09-22 outage:

- **Backend API** — `gqway1e53f.execute-api.eu-west-2.amazonaws.com` (HTTP API →
  Lambdas → DynamoDB `TraxentUserData`). Direct to AWS.
- **Auth** — `auth.traxent.io` is the Auth0 custom domain, deliberately
  **DNS-only** (unproxied). See `CLOUDFLARE-INSIGHTS.md` §C — proxying it breaks
  Auth0 certificate renewal.
- **Payments** — Stripe (`checkout.traxent.io` → hosted checkout, DNS-only).

## Runbook — Cloudflare "Error 1016 (Origin DNS error)"

1016 means **Cloudflare cannot resolve the origin**. Cloudflare is fine; the
CloudFront domain behind it isn't answering. Work down this list:

```bash
# 1. Does the origin resolve? Empty output = CloudFront is offline or gone.
dig d19xn3c9xuxe68.cloudfront.net +short

# 2. Is the rest of AWS alive? An HTTP status (even 404) = account is NOT suspended.
#    A timeout here means the whole account is down → check billing FIRST.
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://gqway1e53f.execute-api.eu-west-2.amazonaws.com/subscribe \
  -X POST -H "Content-Type: application/json" -d '{}'

# 3. Distribution state (needs auth — see note below).
aws cloudfront list-distributions \
  --query "DistributionList.Items[].{Id:Id,Domain:DomainName,Enabled:Enabled,Status:Status}" --output table

# 4. Is the content still in S3? (A suspension never deletes it.)
aws s3 ls s3://traxent.io | head
```

**Interpreting it:**

| Finding | Meaning | Fix |
|---|---|---|
| Distribution listed, `Deploying` | Recovering by itself | Wait 5-15 min for `Deployed`, then ~5 more for Cloudflare to retry the origin |
| Distribution listed, `Disabled` | Manually/automatically disabled | Enable it; wait for `Deployed` |
| Distribution **missing** | Genuinely deleted (only after account *termination*, ~90 days — rare) | Recreate with the website endpoint as origin, then repoint BOTH Cloudflare CNAMEs at the new `dXXXX.cloudfront.net` |
| API curl times out too | Account-level suspension | **Billing first** — everything else is downstream |

If 1016 persists >15 min after CloudFront shows `Deployed`, Cloudflare cached the
failed lookup: **Cloudflare → Caching → Purge Everything**.

### Can't sign in to AWS?

Billing suspension disables *resources*, not *login*. IAM/Identity Center access
can lag reactivation by minutes-to-hours, but the **root user** (the email that
created the account) works throughout — use it at `console.aws.amazon.com` to
check billing. Root is the reliable way in when SSO is being unhelpful.

## Prevention

- **AWS Budgets alert** — a failed card charge for a couple of pounds suspended
  the whole account with no warning that reached a human. A low-threshold budget
  alarm is the control that would actually have caught this early; an uptime
  monitor only catches it *after* the site is already down.
- **Keep the payment card current** — the root cause was a failed charge, not
  overspend.
- **Uptime monitor** — a scheduled check on `traxent.io` reports an outage within
  ~30 minutes rather than it being found by chance.

## Custom 404 page (branded)

**Status (audited 2026-09-30):** a request for a non-existent path (e.g.
`traxent.io/does-not-exist`) returns **HTTP 404 but serves the full homepage**
(`index.html`, ~64 KB) — the S3 website **error document is currently set to
`index.html`**. That's confusing UX and shows a member-redirect script running on
an error page. A branded `src/404.html` now ships in the repo (deploys to
`s3://traxent.io/404.html` like any other file). It is `noindex`.

**Owner action to make it show** (needs AWS credentials — not doable from the repo):

1. **S3 (minimal, recommended).** Point the bucket's static-website **Error
   document** at `404.html`:
   ```bash
   aws s3 website s3://traxent.io --index-document index.html --error-document 404.html
   ```
   Then invalidate CloudFront: `aws cloudfront create-invalidation --distribution-id E2RA25KNTQMO22 --paths "/*"`.

   **Why this is safe:** clean URLs to *real* pages (`/learn-101` etc.) return 200
   and never touch the error document — only genuinely-missing paths do — so this
   changes the not-found experience without affecting working links. (Confirmed by
   probing live: real clean URLs → 200; missing paths → the error document.)
   The one thing to confirm first: no route intentionally relies on the current
   `index.html` fallback (this is an MPA of real `.html` files, so none should).

2. **CloudFront custom error response (optional, for caching control).**
   Distribution `E2RA25KNTQMO22` → Error pages → Create: HTTP error code **404**,
   Response page path **`/404.html`**, HTTP Response code **404**. Do **not** map
   403/other codes to `/404.html` blindly — S3 website already returns 404 for
   missing keys, so the S3 error-document change above is sufficient on its own.
