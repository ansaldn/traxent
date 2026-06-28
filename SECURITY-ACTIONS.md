# Traxent — Security Actions You Run (OIDC + console steps)

Companion to `SECURITY-AUDIT.md`. The code/IaC changes are already committed; this file is the
things **only you can do** (IAM, GitHub settings, Auth0/Stripe dashboards, the CDN hash).

---

## ⚠️ Step 0 — REQUIRED before you push the IaC changes

The user-data SAM stack now creates **WAF, SNS, CloudWatch alarms, and a Budget**. Your deploy
role (per `IAM-OIDC-SETUP.md`) currently has CloudFormation/Lambda/DynamoDB/API GW/S3/Logs/IAM —
but **not** wafv2/sns/cloudwatch/budgets. If you push without granting these, `deploy-infra.yml`
will fail with `AccessDenied` partway through.

Add this block to the deploy role's inline policy (IAM → Roles → `traxent-github-deploy` → the
permissions policy) **before pushing**:

```json
{ "Sid": "Waf",       "Effect": "Allow", "Action": "wafv2:*", "Resource": "*" },
{ "Sid": "Sns",       "Effect": "Allow", "Action": ["sns:CreateTopic","sns:DeleteTopic","sns:Subscribe","sns:Unsubscribe","sns:GetTopicAttributes","sns:SetTopicAttributes","sns:ListSubscriptionsByTopic","sns:TagResource"], "Resource": "*" },
{ "Sid": "CwAlarms",  "Effect": "Allow", "Action": ["cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms","cloudwatch:TagResource"], "Resource": "*" },
{ "Sid": "Budgets",   "Effect": "Allow", "Action": ["budgets:ViewBudget","budgets:ModifyBudget"], "Resource": "*" }
```

> Prefer not to give CI budget rights? Delete the `MonthlyBudget` resource from
> `backend/user-data/template.yaml` and instead create the budget once by hand
> (Billing → Budgets → Create). Then you can drop the `Budgets` statement above.

**After deploy:** you'll get a "confirm subscription" email from AWS SNS — click it, or the alarms
can't email you. The WAF managed rule set ships in **count mode** (observe-only); after a week of
clean CloudWatch metrics, flip `OverrideAction: Count: {}` → `None: {}` in the template to enforce.

---

## Step 1 — OIDC / deploy-credential hardening (Finding H2)

### 1a. Migrate the frontend deploy off static keys → OIDC
`deploy.yml` is the last workflow using long-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
The OIDC role already has `s3:*` + `cloudfront:CreateInvalidation`, so this is a drop-in. Edit
`.github/workflows/deploy.yml`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:              # ← add
      id-token: write         # ← add
      contents: read          # ← add
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}   # ← replace the two key lines
          aws-region: eu-west-2
```

Then: **GitHub → Settings → Secrets and variables → Actions** → delete `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`, and in **IAM → Users** delete that user's access key. Push a trivial
`src/` change to confirm the frontend deploy still goes green.

### 1b. Scope the deploy policy down from `*` (do after 1a is green)
Replace the broad inline policy with this least-privilege version (fill `<ACCOUNT_ID>`; keep the
Step 0 wafv2/sns/cloudwatch/budgets statements). Wildcards remain only where CloudFormation/SAM
genuinely needs them:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Cfn", "Effect": "Allow", "Action": "cloudformation:*",
      "Resource": [
        "arn:aws:cloudformation:eu-west-2:<ACCOUNT_ID>:stack/traxent-*/*",
        "arn:aws:cloudformation:eu-west-2:aws:transform/Serverless-2016-10-31" ] },
    { "Sid": "Lambda", "Effect": "Allow", "Action": "lambda:*",
      "Resource": "arn:aws:lambda:eu-west-2:<ACCOUNT_ID>:function:traxent-*" },
    { "Sid": "Dynamo", "Effect": "Allow", "Action": "dynamodb:*",
      "Resource": "arn:aws:dynamodb:eu-west-2:<ACCOUNT_ID>:table/TraxentUserData*" },
    { "Sid": "ApiGw", "Effect": "Allow", "Action": "apigateway:*", "Resource": "*" },
    { "Sid": "Cloudfront", "Effect": "Allow", "Action": [
        "cloudfront:DescribeFunction","cloudfront:GetFunction","cloudfront:UpdateFunction",
        "cloudfront:PublishFunction","cloudfront:CreateInvalidation" ], "Resource": "*" },
    { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*",
      "Resource": "arn:aws:logs:eu-west-2:<ACCOUNT_ID>:log-group:/aws/lambda/traxent-*" },
    { "Sid": "FrontendBucket", "Effect": "Allow", "Action": "s3:*",
      "Resource": [ "arn:aws:s3:::traxent.io", "arn:aws:s3:::traxent.io/*" ] },
    { "Sid": "SamArtifacts", "Effect": "Allow", "Action": "s3:*",
      "Resource": [ "arn:aws:s3:::aws-sam-cli-managed-*", "arn:aws:s3:::aws-sam-cli-managed-*/*" ] },
    { "Sid": "Ssm", "Effect": "Allow", "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:eu-west-2:<ACCOUNT_ID>:parameter/traxent/*" },
    { "Sid": "IamForSamRoles", "Effect": "Allow", "Action": [
        "iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:TagRole","iam:AttachRolePolicy",
        "iam:DetachRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy","iam:GetRolePolicy",
        "iam:ListRolePolicies","iam:ListAttachedRolePolicies" ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/traxent-*" },
    { "Sid": "PassRoleScoped", "Effect": "Allow", "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/traxent-*",
      "Condition": { "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" } } },
    { "Sid": "Waf",      "Effect": "Allow", "Action": "wafv2:*", "Resource": "*" },
    { "Sid": "Sns",      "Effect": "Allow", "Action": ["sns:CreateTopic","sns:DeleteTopic","sns:Subscribe","sns:Unsubscribe","sns:GetTopicAttributes","sns:SetTopicAttributes","sns:ListSubscriptionsByTopic","sns:TagResource"], "Resource": "*" },
    { "Sid": "CwAlarms", "Effect": "Allow", "Action": ["cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms","cloudwatch:TagResource"], "Resource": "*" },
    { "Sid": "Budgets",  "Effect": "Allow", "Action": ["budgets:ViewBudget","budgets:ModifyBudget"], "Resource": "*" }
  ]
}
```
> Note: SAM creates Lambda execution roles with generated names. If a deploy fails on
> `iam:CreateRole`, either add explicit `RoleName: traxent-...` to each function in the templates
> (so they match `traxent-*`), or temporarily widen the IAM `Resource` to `*` for the first deploy.

### 1c. Pin the trust policy to `main`
In the role's **trust** policy, change the subject condition from
`repo:ansaldn/traxent:*` to `repo:ansaldn/traxent:ref:refs/heads/main` so only `main` can assume it.

---

## Step 2 — SRI on the Auth0 SDK (Finding M4)
The SDK loads from the floating `…/2.0/…` path (no fixed hash). Pin a version and add an integrity hash.

1. Pick the current 2.x version `X.Y.Z`, then compute the hash locally:
   ```bash
   curl -s https://cdn.auth0.com/js/auth0-spa-js/X.Y.Z/auth0-spa-js.production.js \
     | openssl dgst -sha384 -binary | openssl base64 -A
   ```
2. Replace the tag in every page that loads it:
   ```bash
   grep -rl "auth0-spa-js" src/*.html
   ```
   New tag:
   ```html
   <script src="https://cdn.auth0.com/js/auth0-spa-js/X.Y.Z/auth0-spa-js.production.js"
           integrity="sha384-PASTE_HASH" crossorigin="anonymous"></script>
   ```
   The CSP already allows `https://cdn.auth0.com`, so no CSP change is needed.
3. Since this pins the version, bump it manually every few months (Dependabot doesn't watch CDN tags).

---

## Step 3 — Confirm S3 is private + behind CloudFront OAC (Finding M5)

> 🛑 **STOP — read this first.** `traxent.io` is currently served via the S3 **website endpoint**,
> which *requires* the bucket to be publicly readable. Enabling Block Public Access on it returns
> **403 AccessDenied** for the whole site. Do **NOT** run the lock-down below until you've first
> migrated CloudFront to a REST origin with **Origin Access Control** (OAC). The lock-down is the
> *last* step of that migration, not a standalone toggle.
>
> **If the site is already 403-ing because this was run, recover immediately:**
> ```bash
> aws s3api delete-public-access-block --bucket traxent.io --profile traxent
> # then confirm the public-read policy is intact (see below); CloudFront recovers within ~1 min
> ```

Inspect (read-only, safe):
```bash
aws s3api get-public-access-block --bucket traxent.io --profile traxent
aws s3api get-bucket-policy --bucket traxent.io --profile traxent --query Policy --output text
```

**Proper lock-down (only after OAC migration):** switch the CloudFront origin from the
`*.s3-website-*` endpoint to the bucket's REST endpoint with an **Origin Access Control**, add a
bucket policy allowing only that distribution (`AWS:SourceArn`), move index/error rewrites into a
CloudFront Function, **then**:
```bash
aws s3api put-public-access-block --bucket traxent.io \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## Step 4 — Auth0 tenant hardening (Finding M6)
- **Security → Attack Protection:** enable Bot Detection, Suspicious IP Throttling, Brute-Force
  Protection, and Breached-Password Detection.
- **Admin MFA:** require MFA on every Auth0 dashboard admin (your Auth0 account settings).
- **Monitoring → Streams:** add a log stream (AWS EventBridge/CloudWatch or Datadog) so failed-login
  spikes are visible.
- **M2M least privilege:** Applications → your two M2M apps → APIs → Auth0 Management API → grant only
  what each needs — the webhook app: `read:roles`, `read:users`, `create:role_members`,
  `delete:role_members`; the delete-account app: `delete:users` (+ `read:users`). **Rotate** both
  client secrets (Credentials → Rotate) and update the SSM params.

---

## Step 5 — Stripe restricted keys (Finding L3)
Developers → API keys → **Create restricted key**, one per function, then store each in its own SSM
param and point that function at it:

| Function | Permissions on the restricted key |
|---|---|
| create-checkout | Customers **write**, Checkout Sessions **write**, Prices **read** |
| cancel-subscription | Customers **read**, Subscriptions **write** |
| delete-account | Customers **read**, Subscriptions **write** |
| stripe-webhook | (only verifies signatures — a read-only key is plenty) |

Enable **Radar** (Stripe → Radar) for fraud scoring on live charges.

---

## Step 6 — Remaining items (code is ready / your call)

### Payments — `deploy-payments` cutover + throttling now
You've renamed the payment stack to `-v2`, which is **Option A** in `PAYMENTS-IMPORT-RUNBOOK.md` and fixes the failing deploy (SAM can now create a fresh stack without colliding with the hand-made `da579ew81m`). Pushing it is safe — it stands up idle v2 infra; the live site keeps running on the old API. To finish the cutover, follow the runbook: grab the new `PaymentsApiBaseUrl` from the stack outputs → repoint the frontend checkout/cancel base → repoint the Stripe **live** webhook to the new `…/webhook` (new `whsec_` into SSM) → verify → delete `da579ew81m` + the old functions → drop the 3 from `deploy-map.json`.

**Throttling on live traffic *now*** (H1 lands on the v2 API only after cutover; this covers the API actually serving traffic in the meantime):
```bash
aws apigateway update-stage --rest-api-id da579ew81m --stage-name prod \
  --patch-operations op=replace,path=/*/*/throttling/rateLimit,value=25 \
                     op=replace,path=/*/*/throttling/burstLimit,value=50 \
  --profile traxent
```

### M1 — HTTP API JWT authorizer (apply as a *standalone, verified* deploy)
This is the one change that can break **all** user-data/news API auth if the audiences/issuer don't match, so deploy it **alone**, verify, and keep the rollback handy. Add to `UserDataApi` in `backend/user-data/template.yaml`:
```yaml
  UserDataApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      Auth:
        Authorizers:
          Auth0JWT:
            IdentitySource: "$request.header.Authorization"
            JwtConfiguration:
              issuer: https://auth.traxent.io/
              audience:
                - ilvfACgF2sCmLWaugCn11qTB04aTvWxz
                - YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK
        DefaultAuthorizer: Auth0JWT
      # ...keep the existing CorsConfiguration block
```
**Verify after deploy** (the Lambdas still do their own checks — this just rejects junk at the gate):
```bash
BASE=https://gqway1e53f.execute-api.eu-west-2.amazonaws.com
curl -s -o /dev/null -w "%{http_code}\n" $BASE/user                       # expect 401 (no token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <real-id-token>" $BASE/user   # expect 200
```
**Rollback:** delete the `Auth:` block and redeploy. (CORS preflight is unaffected; the webhook is on the *other* API, so it's untouched.)

### H3 — shorten the Auth0 ID-token lifetime
Auth0 Dashboard → Applications → your **SPA** app → token settings → set the **ID Token Expiration** to `3600`–`7200` seconds (1–2h) instead of the 10h default. Shrinks the window if a token is ever stolen. Zero code change. (Confirm the exact field name in your tenant's UI before saving.)

### L1 — iOS certificate / public-key pinning
Defense-in-depth against a mis-issued/MITM cert. Add a `URLSessionDelegate` that compares the server public-key hash to a pinned value, and route the API `URLSession` through it. You must supply the **real** pin (a wrong pin bricks the app), and pin the *intermediate* + ship a backup pin so a cert rotation doesn't lock users out. Get the current pin:
```bash
echo | openssl s_client -connect auth.traxent.io:443 -servername auth.traxent.io 2>/dev/null \
  | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```
Tell me when you want this and I'll write the delegate with your pins wired in.

---

## Appendix — what happens when you push these commits
- **`deploy-backend.yml`** (on `backend/functions/**`): updates `create-checkout` + `cancel-subscription`
  in place — this is how the Lambda **code fixes** ship. ✅ works regardless of SAM state.
- **`deploy-infra.yml`** (on `backend/user-data/**`): `sam deploy` of the WAF/alarms/budget/SNS +
  the delete-account fix. ✅ **after Step 0**.
- **`deploy-payments.yml`** (on `backend/template.yaml` + payment functions): `sam deploy` of the
  REST-API **throttling**. ⚠️ This errors until you complete `PAYMENTS-IMPORT-RUNBOOK.md` (pre-existing
  — the import adopts the live console-created API into the stack). The throttling lands once that's
  done; until then you can set it by hand in API Gateway → `traxent-payments` → Stages → `prod` →
  Throttling (rate 25 / burst 50). Your code fixes still ship via `deploy-backend.yml`.
- **`deploy.yml`** (on any push): re-syncs `src/` to S3. Unaffected by the backend changes.
