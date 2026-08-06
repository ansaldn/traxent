# Email — the mailing list and the prelaunch broadcast

Two things live here: the **subscriber list you now own**, and the tooling to
send the "Traxent is open" announcement to it via Resend Broadcasts.

**Nothing in this folder can send to your list on its own.** `create-broadcast.mjs`
only creates a *draft*; a human presses Send in the Resend dashboard.

---

## Two populations, two lawful bases

Everyone on the list carries a `consentBasis`, and the difference is not cosmetic:

| Basis | Who | What you may send |
|---|---|---|
| `consent` | Joined the waitlist, or ticked the toggle on /account | Anything they consented to |
| `soft-opt-in` | Bought a plan (Stripe checkout) | **Similar products only** — UK PECR reg 22(3) |

Soft opt-in is the narrower right. Sending those people something unrelated to
what they bought is the line, and it's the reason the two are stored separately
rather than as one undifferentiated "subscribed".

Three rules are enforced in code and covered by tests, because getting any of
them wrong is a complaint rather than a bug:

- Buying something **never downgrades** an existing `consent` record to `soft-opt-in`.
- Buying something **never resurrects** an unsubscribe.
- `complained` and `bounced` are terminal — nothing, including the account
  toggle, can move a row back out of them.

⚠️ **One thing you still owe on soft opt-in.** PECR only allows it if the
customer was given a simple way to refuse **at the point of sale**, not just
afterwards. The wording is already in the code
(`CHECKOUT_MARKETING_NOTICE` in `backend/functions/stripe-webhook/index.mjs`) —
it now needs to actually appear near the checkout button on the site. Until it
does, the account-page toggle is your only refusal route, which is later than
the regulation asks for.

---

## How the list works now

Formspree was retired on 2026-08-06. The pipeline is:

```
   signup form                POST /subscribe            mirror
  (4 places on site) ───────▶ Lambda ──▶ DynamoDB ───────────────▶ Resend
       Stripe checkout ─────▶          TraxentSubscribers        segment
       /account toggle ─────▶               ▲    ▲                   │
                                            │    └── nightly reconcile
                                            └────── POST /webhooks/resend
                                         unsubscribe · bounce · complaint
```

**DynamoDB is the system of record.** Resend is a mirror. That ordering matters:
if Resend is unavailable the signup is still captured, flagged
`resendSynced: false`, and `resend-backfill.mjs` catches it up later. Under the
old setup a Formspree failure lost the person entirely — every handler had
`.catch(() => showSuccess())`, so they were told they'd joined and never had.

Each row carries the consent evidence the old forms never captured: `consentAt`,
`consentIp`, `consentUserAgent`, and `consentText` — the exact wording that was
on screen, held server-side so it can't be forged by the client.

**The moving parts**

| Where | What |
|---|---|
| `backend/user-data/functions/subscribe/` | `POST /subscribe`. Honeypot, address validation, per-IP hourly cap, writes DynamoDB then mirrors to Resend |
| `backend/user-data/functions/resend-webhook/` | `POST /webhooks/resend`. Svix-verified; applies unsubscribe / bounce / complaint / suppression back to the table |
| `backend/user-data/template.yaml` | `TraxentSubscribers` table, both Lambdas, routes, and a tight error alarm on signups |
| `src/subscribe.js` | One shared client behind all four forms. Never shows success unless the server confirmed it |
| `.../functions/*/marketing.mjs` | Write-side rules for the table — consent basis, email migration, the toggle. **Duplicated into three function directories** (subscribe, account-update, stripe-webhook) because they span two CloudFormation stacks; a verify step checks the copies stay identical |
| `.../functions/reconcile-marketing/` | Nightly 03:15 UTC job. Pushes pending changes, suppresses what should be, clears contacts left by an email change, emails a summary only when something needed fixing |
| `src/account.html` | The customer's own opt-out toggle — the refusal route soft opt-in depends on |

### Identity sync

| Trigger | What happens |
|---|---|
| Stripe `checkout.session.completed` | Customer added under `soft-opt-in`, with plan and name |
| Stripe subscription updated / deleted | `plan` property refreshed. Cancelling is **not** an unsubscribe |
| Name changed on /account | Mirrored to Resend. Never adds anyone to the list |
| **Email changed on /account** | Record migrates to the new address, old row tombstoned, stale Resend contact removed by the nightly job. Status carries over, so an unsubscribe survives the move |
| Toggle on /account | Written to DynamoDB and pushed to Resend **immediately** — a delayed unsubscribe is the failure worth avoiding |

Everything except the toggle reaches Resend on the nightly pass rather than
instantly. That's deliberate: it keeps the Resend API key out of the Stripe and
Auth0 Lambdas, and the reconcile job is what makes the delay safe.

A complaint (`marked as spam`) is **terminal**. Nothing — not a webhook, not a
fresh signup — can move a row back out of `complained`. That guard is the single
most important thing protecting the sending domain.

---

## The run order

### 1. Verify `traxent.io` as a sending domain in Resend — **you, in the browser**

This is the blocking step. Until it's done, nothing else will work.

1. Go to <https://resend.com/domains> → **Add Domain**.
2. Domain: `traxent.io`. Region: **EU (Ireland)** — keeps sending data in the EU,
   which matches the UK GDPR position in `docs/security/`.
3. Resend shows you **three or four DNS records**. They are generated per-domain,
   so copy them from *your* dashboard — do not retype from memory. Expect:
   - a `TXT` on `resend._domainkey` (or similar selector) — the **DKIM** key
   - a `TXT` on `send` — the **SPF** record for the return path
   - an `MX` on `send` — the bounce/feedback return path
   - optionally a `TXT` `_dmarc` — see step 5
4. In Cloudflare → `traxent.io` → **DNS** → add each record exactly as shown.

   **Three things that will break this if you get them wrong:**
   - Every record must be **DNS only** (grey cloud, *not* orange/proxied).
     Proxying mail records breaks them silently.
   - Cloudflare auto-appends the domain. Enter the name as `send`, **not**
     `send.traxent.io` — otherwise you get `send.traxent.io.traxent.io`.
   - The new `MX` goes on the **`send` subdomain**. Do **not** touch the root
     `MX` records — those are Cloudflare Email Routing, and removing them stops
     your inbound `hello@traxent.io` forwarding to Gmail.
5. **SPF at the root:** only ever have **one** `v=spf1` TXT record on the apex.
   If one already exists, merge rather than adding a second — two `v=spf1`
   records is a permanent SPF failure. Resend's SPF goes on `send`, so this
   usually doesn't come up, but check before you add anything at the root.
6. **DMARC:** you already have a `p=none` record via Cloudflare DMARC Management.
   **Leave it at `p=none` for now.** Tighten to `p=quarantine` only after a week
   or two of clean reports. Going to `p=reject` before Resend is verified will
   bin your own email.
7. Back in Resend, click **Verify**. It usually passes within a few minutes;
   Cloudflare propagation is fast.

Confirm from the terminal:

```bash
export RESEND_API_KEY=re_...            # or just be logged into the AWS CLI
node -e "import('./resend.mjs').then(async m=>console.table(await m.listDomains(m.getApiKey())))"
```

You want `traxent.io` with status `verified`.

### 2. Fill in the postal address

Open `campaign.config.mjs` and replace `POSTAL_ADDRESS` with Akpan Holdings
Limited's **registered office address**.

This is not optional. A marketing email must identify the sender's physical
address (UK PECR, and every major inbox provider's bulk-sender policy). Every
script in this folder refuses to run while the placeholder is there.

### 3. Preview the email

```bash
node preview.mjs && open preview.html
```

Renders `preview.html` and `preview.txt` locally. No API key needed, nothing sent.
Both files are gitignored.

### 4. Deploy the stack

The stack is **`traxent-user-data`** — the one that already owns the live table,
Lambdas and HTTP API (`gqway1e53f`). Deploying under any other name creates a
second, parallel copy of everything.

**Confirm which account you're pointed at first.** There are several profiles on
this machine, and deploying into the wrong one is tedious to unpick:

```bash
aws sts get-caller-identity --profile traxent --region eu-west-2
```

Then:

```bash
cd backend/user-data
sam build && sam deploy --profile traxent
```

`samconfig.toml` supplies the stack name, region and capabilities, so a bare
`sam deploy` now works — previously it failed with *"Missing option
`--stack-name`"*. It will show you a changeset and wait for confirmation.

The alternative, and the normal route: **push to `main`**. The
`deploy-infra` GitHub Action deploys the same stack on any change under
`backend/user-data/**`, using credentials already configured. No profile
juggling.

Get the URLs back at any time:

```bash
aws cloudformation describe-stacks --stack-name traxent-user-data \
  --profile traxent --region eu-west-2 \
  --query "Stacks[0].Outputs" --output table
```

Then deploy the site (push to `main`) so the forms start posting to the new
endpoint, and smoke-test:

```bash
curl -s -X POST https://gqway1e53f.execute-api.eu-west-2.amazonaws.com/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"you+test@gmail.com","source":"waitlist-page"}'
# → {"ok":true,"status":"subscribed"}
```

### 5. Point the Resend webhook at us — **you, in the browser**

1. <https://resend.com/webhooks> → **Add Webhook**, URL = the `ResendWebhookUrl`
   output from step 4.
2. Subscribe it to: `contact.updated`, `contact.deleted`, `email.bounced`,
   `email.complained`, `suppression.added`, `suppression.removed`.
3. Copy the **signing secret** (`whsec_…`) and store it:
   ```bash
   aws ssm put-parameter --name /traxent/resend/webhook_secret \
     --value "$(pbpaste)" --type SecureString --overwrite \
     --profile traxent --region eu-west-2
   ```
4. Use Resend's **Send test event** button. A `401` means the secret is wrong;
   `{"ok":true,...}` means you're done.

Until this secret exists the endpoint rejects everything — which is the correct
failure mode for an unauthenticated public route.

### 6. Migrate the historical Formspree list — **once, then never again**

1. <https://formspree.io/forms/mlgogjdq/submissions> → **Export** → **CSV**.
2. Save it into this folder (CSVs here are gitignored — delete it when done).

```bash
node import-waitlist.mjs waitlist.csv --dry-run   # see what it would do
node import-waitlist.mjs waitlist.csv             # seed DynamoDB + Resend
```

It lowercases and de-duplicates, drops invalid syntax, role addresses
(`info@`, `admin@`, …) and your own domains, seeds DynamoDB **without ever
overwriting a newer record**, then adds the rest to the Resend segment. Safe to
re-run.

Imported rows are marked `consentVersion: formspree-legacy` so you can always
tell which consent records are the older, thinner ones.

Once this has run and you've confirmed the numbers, **close the Formspree
account** — it is no longer referenced anywhere in the codebase.

### 7. Send yourself a real test

```bash
node test-send.mjs davidansa00@gmail.com
```

Goes through the same domain and From address as the broadcast, so it's a true
deliverability test. In Gmail, open **⋮ → Show original** and confirm:

- `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
- It landed in the inbox
- Renders correctly on your phone
- Every link goes where you expect

Send one to a non-Gmail address too (Outlook/Hotmail if you have one) — they
have different rules.

### 8. Create the draft broadcast

```bash
node create-broadcast.mjs
```

Preflight will refuse to continue unless the domain is verified, the segment has
subscribed contacts, the unsubscribe token survived rendering, the postal address
is set, and the HTML is under Gmail's 102 KB clipping threshold.

### 9. Send it — **you, in the browser**

<https://resend.com/broadcasts> → open the draft → review the preview one last
time → **Send**.

Consider sending on a **Tuesday–Thursday morning UK time**, and if the list is
large, sending to a slice first. A cold domain sending thousands of messages in
its first hour is the fastest way to get filtered.

---

## What's in here

| File | What it does |
|---|---|
| `campaign.config.mjs` | From address, postal address, UTM tags, segment name. **Edit this.** |
| `email-layout.mjs` | Branded marketing shell — matches the transactional layout, plus unsubscribe + sender identity |
| `prelaunch-email.mjs` | The actual copy, HTML and plain text |
| `resend.mjs` | Minimal Resend API client (no SDK; handles both `/segments` and legacy `/audiences`) |
| `preview.mjs` | Render to disk. Sends nothing |
| `subscribers.mjs` | Reads `TraxentSubscribers` via the AWS CLI — no `npm install` needed |
| `export-subscribers.mjs` | Your list → CSV, with the full consent trail |
| `resend-backfill.mjs` | Pushes any rows Resend didn't receive. Idempotent |
| `import-waitlist.mjs` | One-off Formspree CSV → DynamoDB + Resend |
| `test-send.mjs` | One real copy, to you |
| `create-broadcast.mjs` | Creates a **draft**. Cannot send |

The API key is read from `RESEND_API_KEY`, or falls back to SSM
`/traxent/resend/api_key` in `eu-west-2` via the AWS CLI.

**AWS profile.** Everything here shells out to the AWS CLI, and this machine has
several accounts configured. Pass the profile either way:

```bash
node export-subscribers.mjs --profile traxent
AWS_PROFILE=traxent node export-subscribers.mjs
```

`export-subscribers.mjs` prints the account ID it is reading from before it
prints any numbers — an empty result is far more often the wrong account than an
empty list.

---

## Is this legal to send?

Short version: yes, for **this** email.

These people gave you their address on a form that said "we'll tell you when we
launch". Telling them you've launched is the exact purpose they consented to,
which is what UK PECR requires for marketing by email. The email carries a
one-click unsubscribe, identifies Akpan Holdings Limited, and gives a postal
address.

Signups from 2026-08-06 onward carry a full consent record — timestamp, IP, user
agent, and the exact wording shown. Rows imported from Formspree are marked
`consentVersion: formspree-legacy` and carry only an approximate date, because
that is all Formspree ever captured. Treat those as weaker evidence.

Two things still to watch. A *newsletter* is a different purpose from "we'll
tell you when we launch", so if this becomes a regular send, say so on the form
and bump `CONSENT_VERSION` in the subscribe Lambda. And any deletion request
must remove the person from **both** DynamoDB and Resend — see below.

---

## Everyday operations

```bash
node export-subscribers.mjs --count        # how many, by status
node export-subscribers.mjs                # subscribed only → CSV
node export-subscribers.mjs --status all   # everything, including unsubscribes
node resend-backfill.mjs --dry-run         # anything Resend missed?
node resend-backfill.mjs                   # push it
```

Worth running `--count` after any send: a jump in `complained` is the earliest
warning that a campaign is hurting the domain.

---

## Still on the list

1. **The checkout opt-out notice isn't on the page yet.** See the warning above —
   this is the one outstanding item with a legal edge to it.
2. **Erasure requests span two systems.** A GDPR deletion means removing the row
   from DynamoDB *and* deleting the Resend contact. `deleteSubscriber()` exists
   in `marketing.mjs` but `delete-account` doesn't call it yet, and it only
   covers authenticated users — not waitlist subscribers who never made an
   account.
3. **`marketing.mjs` lives in three places.** The Stripe webhook is in a
   different CloudFormation stack from the other two, so a shared module would
   need a Lambda layer or a build step. Three copies plus a drift check was the
   cheaper trade; revisit if it grows.
4. **Reconcile never auto-resubscribes.** If Resend says unsubscribed and
   DynamoDB says subscribed, it reports rather than acts. That's intentional —
   automatically resurrecting an opt-out is the one mistake you can't undo — but
   it does mean those rows need a human look when they appear in the SNS email.
5. **Bot defences are proportionate, not strong.** Honeypot plus a per-IP hourly
   cap stops opportunistic spam, not a determined attacker. If junk signups
   start appearing, add Cloudflare Turnstile rather than tightening the cap and
   blocking real people on shared connections.
