# Bringing the payment Lambdas under IaC — one-time adoption runbook

The Stripe **checkout / cancel / webhook** Lambdas and their REST API (`da579ew81m`,
stage `prod`) were created by hand in the console. `backend/template.yaml` now describes
them as code, and `.github/workflows/deploy-payments.yml` deploys the `traxent-payments`
stack on every push. But CloudFormation won't manage resources it didn't create until you
**adopt them once**. There are two ways to do that. Pick one.

Region is `eu-west-2` throughout. The OIDC deploy role from `IAM-OIDC-SETUP.md` already has
the permissions for both paths.

---

## Option A — Clean cutover (recommended)

Let SAM create a **fresh** payments stack (new functions are impossible — names collide — so
we rename, then repoint the two consumers, then delete the old resources). This avoids the
fiddliness of CloudFormation import and is fully reversible: the old API keeps working until
you delete it.

There are exactly **two consumers** of the payment API, which is why a cutover is low-risk:
1. the frontend (`/checkout`, `/cancel` calls), and
2. the Stripe webhook endpoint URL.

**Steps**

1. **Temporarily rename in the template** so SAM can create alongside the live ones. In
   `backend/template.yaml` set the three `FunctionName`s to `*-v2`
   (`traxent-create-checkout-v2`, `traxent-cancel-subscription-v2`, `traxent-stripe-webhook-v2`)
   and `PaymentsApi` `Name` to `traxent-payments-v2`. Commit + push → `deploy-payments.yml`
   creates the new stack and prints `PaymentsApiBaseUrl`, `CheckoutUrl`, `CancelUrl`, `WebhookUrl`.

2. **Move the SSM params** — none needed; the new Lambdas read the same `/traxent/*` SSM
   parameters, so Stripe keys, price IDs and the webhook secret are already in place. (The
   webhook secret must match the endpoint you configure in step 4.)

3. **Repoint the frontend** to the new base URL (the `…/prod/checkout` and `…/prod/cancel`
   from the outputs). Update the checkout/cancel fetch base in the frontend and push.

4. **Repoint Stripe** (LIVE mode → Developers → Webhooks): edit the endpoint to the new
   `WebhookUrl`. Copy the endpoint's **new** signing secret into
   `/traxent/stripe/webhook_secret` (SecureString). Send a test event; confirm 2xx.

5. **Verify** end-to-end: a live checkout assigns the plan role (webhook), and `/account`
   → cancel returns success.

6. **Retire the old resources**: delete the manual `da579ew81m` REST API and the three
   original (non-`-v2`) functions in the console. Then drop the `-v2` suffixes back out of
   the template (optional cosmetic rename; do it later and only if you also rename in AWS,
   or just keep `-v2`).

7. **Decommission the duplicate code-deploy**: once payments deploy via this stack, remove
   `cancel-subscription`, `create-checkout`, `stripe-webhook` from `backend/deploy-map.json`
   so `deploy-backend.yml` no longer double-manages them. (Leave the `security-headers`
   CloudFront function entry — that's still deploy-backend's job.)

---

## Option B — CloudFormation resource import (zero new endpoints)

Keeps the exact same API id and function names — no consumer changes. More steps, and the
imported template must match the live config closely.

1. **Confirm live config matches the template.** For each function check runtime / handler /
   memory / timeout and adjust `backend/template.yaml` (or the live function) so they agree:
   ```
   aws lambda get-function-configuration --function-name traxent-create-checkout --region eu-west-2 \
     --query '{Runtime:Runtime,Handler:Handler,Mem:MemorySize,Timeout:Timeout,Arch:Architectures}'
   ```
   Repeat for `traxent-cancel-subscription` and `traxent-stripe-webhook`. (If they're on
   `nodejs20.x` / `x86_64`, either set those in the template's `Globals`, or plan to let the
   first post-import `sam deploy` update them.)

2. **Build a deployable template** (import needs plain CloudFormation, not the SAM macro):
   ```
   cd backend && sam build && sam package --resolve-s3 \
     --output-template-file packaged.yaml --region eu-west-2
   ```

3. **Create a change set of type IMPORT** mapping each logical id to its physical id. Use the
   console (CloudFormation → Create stack → *With existing resources (import)*) — it's far
   easier than the CLI for this — and provide:
   - `CreateCheckoutFunction` → `traxent-create-checkout`
   - `CancelSubscriptionFunction` → `traxent-cancel-subscription`
   - `StripeWebhookFunction` → `traxent-stripe-webhook`
   - `PaymentsApi` → `da579ew81m`
   Name the stack `traxent-payments`. Execute the import.

   > The API Gateway `Deployment`/`Stage`/method resources that SAM generates implicitly can
   > make a pure import awkward (SAM hides them behind the `Api` event). If the import balks on
   > those generated resources, prefer **Option A** — it's why A is the recommendation.

4. **Reconcile**: push to `main`. `deploy-payments.yml` runs `sam deploy` against the now-
   adopted stack and brings everything to the template's desired state (this is also when any
   runtime/arch differences from step 1 get applied — verify checkout/cancel/webhook still work
   immediately after).

---

## After either option

The backend is now **100% infrastructure-as-code**:
- `traxent-user-data` stack ← `backend/user-data/template.yaml` (DynamoDB, user-data, delete-account, news-feed)
- `traxent-payments` stack ← `backend/template.yaml` (checkout, cancel, webhook + REST API)

Both auto-deploy from Git via their workflows using the OIDC role. No console clicking to ship
a backend change; edit code, push, the relevant stack reconciles itself.
