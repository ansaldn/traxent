# David's config checklist — do these (only you can)

These are the console/config actions Claude can't do. Ordered by dependency. Region is
**eu-west-2** everywhere. Tick as you go.

## 1. Deploy the latest code  (unblocks cancel, news pagination, delete, node22)
- [ ] Commit + push everything on `main`:
      `git add -A && git commit -m "backend: cancel fix, news→SAM, audience array, node22, delete-account" && git push origin main`
- [ ] Watch GitHub → Actions. Three workflows should run:
      - `Deploy to S3` (frontend — news pagination/filters, etc.)
      - `Deploy Backend` (cancel/checkout/webhook code)
      - `Deploy Infrastructure (SAM)` (DynamoDB, user-data, delete-account, news-feed, node22)
- [ ] (Verify only — likely already set since workflows have run) OIDC role + the
      `AWS_DEPLOY_ROLE_ARN` Actions variable exist. If a workflow fails on AWS auth, see
      `IAM-OIDC-SETUP.md`.

## 2. Grab the API URL and wire it  (unblocks user-data + news + delete on web & iOS)
- [ ] After `Deploy Infrastructure (SAM)` is green, open its run → "Show API URL" step (or
      CloudFormation → stack `traxent-user-data` → Outputs). Copy **`ApiBaseUrl`**.
- [ ] Paste it into `src/userdata.js` → `const USERDATA_API = '...'` (no trailing slash), then push.
      *(Or just send Claude the URL and it'll wire userdata.js — news.html derives its URL from the same value.)*
- [ ] Send the iOS team **`ApiBaseUrl`** + the file **`BACKEND_TO_IOS.md`**. Their
      `userDataAPI` = `ApiBaseUrl`, `newsAPI` = `{ApiBaseUrl}/news`.

## 3. Auth0 — Machine-to-Machine app for account deletion  (NEW — delete 500s without this)
- [ ] Auth0 Dashboard → Applications → create a **Machine to Machine** app, authorize it for the
      **Auth0 Management API**, grant **only** the `delete:users` scope.
- [ ] Store its credentials in SSM (eu-west-2):
      ```
      aws ssm put-parameter --name /traxent/auth0/mgmt_client_id     --type String      --value <client_id>     --region eu-west-2
      aws ssm put-parameter --name /traxent/auth0/mgmt_client_secret --type SecureString --value <client_secret> --region eu-west-2
      ```

## 4. Auth0 — callback URLs  (so deep links to gated pages don't fail login)
- [ ] Application (the SPA) → Allowed Callback URLs — add: `https://traxent.io`,
      `https://traxent.io/dashboard`, `/journal`, `/tracker`, `/calendar`, `/chart`, `/calculator`,
      `/challenge-lab`, `/account`, `/learn`, `/learn-module-1` … `/learn-module-6`, `/news`.
- [ ] Allowed Logout URLs + Allowed Web Origins include `https://traxent.io`.

## 5. Stripe — confirm you're fully on LIVE  (the cancel test→prod issue)
- [ ] `aws ssm get-parameter --name /traxent/stripe/secret_key --with-decryption --region eu-west-2`
      → must start `sk_live_`.
- [ ] Price IDs are **live**: `/traxent/stripe/price_observer`, `_challenger`, `_funded_ready`.
- [ ] `/traxent/stripe/webhook_secret` = the **live** endpoint's `whsec_…`, and in Stripe (Live mode)
      → Developers → Webhooks, the endpoint exists and is receiving events.
- [ ] To actually test cancel: make one **real live checkout** (a live card), then cancel from
      `/account`. (If your current Funded Trader was granted via an Auth0 role, there's no Stripe
      subscription to cancel — 404 is expected.)

## 6. Verify it all works (after the above)
- [ ] `/account` → Cancel plan → success (not 404/401).
- [ ] `/news` → loads articles (you're already `funded_ready`).
- [ ] `/account` → Delete account → use a **throwaway test account**, confirm 204 + the user is gone
      in Auth0/Stripe/DynamoDB. CloudWatch `traxent-delete-account` if it 500s.
- [ ] iOS: once they update the news URL + you've set the mgmt SSM params, news + delete should clear
      (news still needs the App Store→plan-claim reconciliation Claude is building for Apple-billed users).

---

### Not config — separate, when you're ready
- Instagram: `marketing/INSTAGRAM_TODO.md` (set bio link, post the ready creatives, follow, DM).
- Waitlist copy is stale (4 firms/4 modules) — flagged in `CONTENT_AUDIT.md`; Claude can refresh it.
