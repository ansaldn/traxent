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
