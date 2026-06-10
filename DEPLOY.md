# Traxent — Deploy & Operations Guide

This guide covers everything built in this work session and exactly what to do to ship
it. Work top-to-bottom; each section says whether it is **automatic** (just push) or a
**one-time manual step**.

> TL;DR: `git add -A && git commit && git push origin main` ships all frontend changes and
> (once you fill in `backend/deploy-map.json`) all Lambda fixes. Two one-time AWS setup
> steps are needed for the brand-new pieces (news Lambda, user-data stack).

---

## 0. What changed this session

**Bug fixes**
- Auth0 login "won't load" → was a stale `auth.js` served from the browser cache. Fixed via cache-control + per-deploy versioning.
- Cancel/downgrade/upgrade failing (401) → Lambdas verified the wrong JWT audience. Fixed in `cancel-subscription` and `create-checkout`.
- Four truncated pages restored (`dashboard`, `account`, `tracker`, `learn`) — OneDrive was eating file tails.

**New features**
- `/news` market-news feed (Funded Trader tier) + `news-feed` Lambda.
- Tracker expanded from 4 → **16** prop firms with researched rules.
- **Best-matched firm** recommendation on the tracker.
- Two new learn modules (5: Psychology & Discipline, 6: Review & Building Your Edge).
- **User-data database** (DynamoDB + Lambda + HTTP API) to persist progress/trades/firms.

**Infrastructure / CI**
- `deploy.yml` — added no-cache headers, `auth.js`/`userdata.js` versioning, and an HTML-truncation guard.
- `deploy-backend.yml` — auto-deploys Lambdas + CloudFront Functions on push (replaces manual zips).
- `deploy-infra.yml` — `sam deploy` for the user-data stack (true IaC).

---

## 1. Frontend — automatic on push

Pushing to `main` runs `deploy.yml`: it stamps the build SHA into `sw.js` and the
`auth.js`/`userdata.js` script references, syncs `src/` to S3 with correct cache headers,
and invalidates CloudFront. **A new HTML-integrity step fails the deploy if any
`src/*.html` is truncated** (missing `</html>` or unbalanced `<script>`).

One-time for current users: anyone who already loaded the old site should hard-refresh
once (Ctrl+Shift+R) to drop the stale `auth.js`. New visitors are fine automatically.

---

## 2. Backend Lambda fixes — automatic once configured

The cancel/checkout audience fix is in the repo but must reach AWS. The new
`deploy-backend.yml` does this on every push — but first, one-time setup:

1. **Fill `backend/deploy-map.json`** with your real AWS resource names:
   ```
   aws lambda list-functions --region eu-west-2 \
     --query "Functions[?contains(FunctionName,'cancel')||contains(FunctionName,'checkout')||contains(FunctionName,'webhook')].FunctionName"
   aws cloudfront list-functions --query "FunctionList.Items[].Name"
   ```
   Replace each `REPLACE_WITH_*` with the matching name. (Leave `news-feed` as a placeholder
   until you create that function — see §3 — then add its name.)

2. **Grant the CI IAM user** (the existing `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`)
   these permissions: `lambda:UpdateFunctionCode`, `lambda:GetFunction`,
   `cloudfront:DescribeFunction`, `cloudfront:UpdateFunction`, `cloudfront:PublishFunction`.

3. Push. `deploy-backend.yml` zips each function (with `npm ci`) and updates it. Unfilled
   placeholders are safely skipped with a warning.

After this, cancel, downgrade and upgrade all work (they share the two fixed Lambdas).

---

## 3. News feed — one-time AWS setup, then automatic

The `/news` page and `backend/functions/news-feed` are built. Because the backend CI only
*updates existing* functions, create the function + route once:

1. **Create the Lambda** `traxent-news-feed` (Node 20, handler `index.handler`), e.g. zip
   `backend/functions/news-feed` after `npm install --omit=dev` and `aws lambda create-function`.
   Give its role `ssm:GetParameter` on `/traxent/news/*` and basic logging.
2. **Add an API Gateway route** `ANY /news` on the existing API (`da579ew81m`, `prod` stage)
   integrated with the new function. (Mirrors how `/checkout` and `/cancel` are wired.)
3. **Add the news provider key** (the feed is built for Alpha Vantage's NEWS_SENTIMENT,
   which returns bull/bear sentiment):
   ```
   aws ssm put-parameter --name /traxent/news/alphavantage_key --type SecureString \
     --value <YOUR_KEY> --region eu-west-2
   ```
   Until the key exists the page shows a friendly "feed is being set up" state — nothing breaks.
4. Add `traxent-news-feed` to `backend/deploy-map.json` so future updates auto-deploy.

The page is gated to the Funded Trader tier both client-side and **server-side** (the Lambda
verifies the ID token and the plan claim), so lower tiers can't call it directly.

---

## 4. User-data database (IaC) — `sam deploy` via Git

This is the new persistence layer (lesson progress, paper trades, firm selections),
defined as code in `backend/user-data/template.yaml`.

1. **IAM**: the CI user needs permission to manage CloudFormation, Lambda, DynamoDB,
   API Gateway and IAM roles (or use a deploy role). This is broader than the frontend
   user — consider a dedicated deploy user/role.
2. Push any change under `backend/user-data/**` → `deploy-infra.yml` runs `sam build` +
   `sam deploy` and prints the stack outputs. (Or run locally: `cd backend/user-data && sam build && sam deploy --guided`.)
3. Copy the **`ApiBaseUrl`** output into `USERDATA_API` at the top of `src/userdata.js`,
   then push. Until that constant is set, `userdata.js` transparently falls back to
   `localStorage`, so nothing breaks before the stack exists.
4. **Wiring (incremental)**: `userdata.js` exposes `TraxentData` (getProgress/markLesson,
   getFirms/setFirms, getTrades/addTrade/deleteTrade, `deleteAccount`, and `sync()`). To move
   a page off raw `localStorage`, load `userdata.js` (with `?v=__BUILD_SHA__`) after `auth.js`,
   call `await TraxentData.sync()` on init, and route reads/writes through `TraxentData`. The
   tracker and learn pages are the natural first candidates. (The account page is already
   wired for `deleteAccount`.)

---

## 4a. Account deletion (`DELETE /user/account`) — App Review 5.1.1(v)

The deletion Lambda (`backend/user-data/functions/delete-account`) is **part of the same SAM
stack**, wired to `DELETE /user/account`, so it deploys automatically with §4 — no separate
deploy. It cancels the user's Stripe subscription immediately, purges all their DynamoDB data,
then deletes the Auth0 user. The web account page (`/account`) already has the delete button +
confirm modal calling it; the same endpoint serves the iOS app.

One-time prerequisites:
1. **Auth0 Machine-to-Machine app** authorized for the **Management API** with the
   `delete:users` scope. Put its credentials in SSM:
   ```
   aws ssm put-parameter --name /traxent/auth0/mgmt_client_id     --type String       --value <id>     --region eu-west-2
   aws ssm put-parameter --name /traxent/auth0/mgmt_client_secret --type SecureString  --value <secret> --region eu-west-2
   ```
   (These are separate from the webhook's `m2m_*` params, which don't have `delete:users`.)
2. The Stripe customer must carry the Auth0 identity. `create-checkout` now stamps
   `auth0_sub` (and `auth0_user_id`) on the Stripe customer at checkout — already done; just
   redeploy that Lambda (§2). The delete flow also falls back to an email search for legacy customers.
3. Set `USERDATA_API` in `src/userdata.js` (§4 step 3) so the account page can reach the endpoint.

Note for App Review: a free user with no subscription can still delete — Stripe cancellation is
skipped gracefully. iOS-purchased subscriptions can't be cancelled server-side (Apple rule); the
modal tells the user to cancel in iPhone Settings.

---

## 5. Auth0 dashboard — one-time

Add every gated path to **Allowed Callback URLs** (the page gate uses
`redirect_uri = origin + pathname`), or deep links to those pages fail login:

```
https://traxent.io, https://traxent.io/dashboard, /journal, /tracker, /calendar,
/chart, /calculator, /challenge-lab, /account, /learn,
/learn-module-1 ... /learn-module-6, /news
```
Also confirm **Allowed Logout URLs** and **Allowed Web Origins** include `https://traxent.io`.

---

## 6. Verification checklist after deploy

- [ ] Log in end-to-end → lands on dashboard (no hang).
- [ ] Account → Cancel plan → returns success (not 401).
- [ ] `/news` loads (feed or "being set up" state), and is blocked for non-Funded users.
- [ ] `/tracker` shows the **best-matched firm** panel and all 16 firms.
- [ ] `/learn` shows six modules; Modules 5 & 6 open and the quizzes pass.
- [ ] GitHub Actions: all three workflows green.

---

## 7. Strongly recommended (root-cause hygiene)

- **Move the repo out of OneDrive** (or pause sync on the folder). OneDrive truncating file
  tails has now corrupted 5 files across two incidents. The CI guard catches it at deploy
  time, but the real fix is to stop the corruption at source.
- Consider a dedicated, least-privilege IAM deploy role per workflow rather than one shared user.

---

## 8. Is the IaC automation live yet? (answer + exactly what you must do)

**Status:** the automation is **written and ready, but has not run yet.** The pipeline
(`.github/workflows/deploy-infra.yml`) does the whole job — on any push that touches
`backend/user-data/**` it runs `sam build` + `sam deploy`, which **creates/updates the DynamoDB
table, both Lambdas, and the HTTP API from `template.yaml`.** Nothing is deployed until you do
two one-time things:

1. **Push the repo to `main`.** The workflow only becomes active once it's on the default
   branch. (It's currently only in your working folder.)
2. **Give the deploy credentials the right permissions.** Your existing
   `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are scoped for the frontend (S3 + CloudFront)
   only. SAM/CloudFormation needs more. Quickest path for a solo setup — attach these AWS
   *managed* policies to that IAM user (tighten later):
   `AWSCloudFormationFullAccess`, `AWSLambda_FullAccess`, `AmazonDynamoDBFullAccess`,
   `AmazonAPIGatewayAdministrator`, `AmazonS3FullAccess` (for the SAM artifact bucket), and
   `IAMFullAccess` (SAM creates the Lambda execution roles — the sensitive one; scope this
   down to `iam:*Role*` on `traxent-*` when you can).

That's it. After those two steps, **IaC is fully automated**: edit anything under
`backend/user-data/`, push, and the stack reconciles itself. No manual `sam` commands, no
console clicking. Locally you can dry-run with `cd backend/user-data && sam build && sam deploy --guided`.

**Better long-term (recommended):** replace the static access keys with a **GitHub OIDC role** —
GitHub Actions assumes a scoped IAM role at deploy time, so there are no long-lived secrets. Worth
doing before launch; not required to get automation working now.

> The existing-Lambda code deploy (`deploy-backend.yml`) is the *other* automation and is
> separate: it only updates already-created functions (cancel/checkout/news), and needs the
> `deploy-map.json` names + the lambda/cloudfront permissions in §2. The new account-delete and
> user-data functions are created by the SAM stack here, not by that workflow.
