# Enterprise — SSO, SCIM and what to pay for

Written 2026-08-06, after you asked whether Auth0 could do this instead of a
custom build. Short answer: **for SSO yes, for SCIM not yet — and you shouldn't
pay for either until a customer is signing.**

---

## The cost question

| | Build it here | Auth0 |
|---|---|---|
| **SSO** (SAML / OIDC) | Don't. See below. | **B2B Essentials, from $150/mo** — 3 connections bundled |
| **SCIM** (user provisioning) | **£0** — built, runs on the Lambda + DynamoDB you already pay for | **B2B Professional, from $800/mo** |

Auth0 gates inbound SCIM behind Enterprise Connections, which sits on the
Professional tier. That's **$9,600 a year** for a feature you currently have
zero customers asking for.

### So: build SCIM, buy SSO

**SCIM is a good build.** It's a well-specified REST API over your own user
records — RFC 7643 and 7644, both public. There's no cryptography to get wrong
and no attack surface beyond a bearer token. That's why it's in this repo
already, tested against the payloads Okta and Entra ID actually send.

**SSO is a bad build.** SAML is XML signature validation, and getting it wrong
means signature wrapping, XXE, or accepting assertions from an issuer you never
trusted — the kind of bug that ends an enterprise deal, or worse. Auth0 already
does it, has been audited doing it, and $150/mo is far less than the first
security review would cost you.

### When to actually pay

Not now. The sequence:

1. **Today.** `/enterprise` captures enquiries. SCIM is deployed and free to
   run — an idle Lambda costs nothing.
2. **First customer wants SSO.** Subscribe to B2B Essentials ($150/mo), add
   their connection. One customer at Enterprise pricing covers a year of it.
3. **Fourth SSO customer.** Essentials bundles 3 connections. Beyond that
   Auth0 doesn't publish overage — you call sales, so factor that into the
   fourth deal rather than discovering it afterwards.
4. **Revisit SCIM only** if you end up on Professional anyway for other
   reasons. Until then the custom one does the same job for nothing.

---

## What's built

### SCIM 2.0 — `backend/user-data/functions/scim/`

`ANY /scim/v2/{proxy+}`, authenticated by a **per-organisation bearer token**,
not Auth0 — the caller is a machine with no user session.

| Endpoint | Notes |
|---|---|
| `GET /Users` | Filter, 1-based pagination. Unsupported filters are **rejected**, not ignored — an ignored filter returns the whole directory, which an IdP reads as "everyone matches" and can act on destructively |
| `GET /Users/{id}` | |
| `POST /Users` | Duplicate `userName` → `409 uniqueness`, which is how IdPs decide create vs update |
| `PUT /Users/{id}` | Full replace |
| `PATCH /Users/{id}` | **The one that matters** — deactivation on leaver |
| `DELETE /Users/{id}` | Soft delete. A hard delete would destroy someone's learning progress the moment an admin moved them out of a group |
| `ServiceProviderConfig`, `ResourceTypes`, `Schemas` | Discovery. IdPs read these first |

Groups are declared **unsupported** rather than half-implemented. An IdP that
reads `supported: false` skips group sync cleanly; one that finds a broken
`/Groups` retries forever and fills the customer's error log.

**Deactivation handles all three real-world shapes**, because getting it wrong
means a leaver keeps their access:

```jsonc
{ "op": "replace", "value": { "active": false } }          // Okta — pathless, boolean
{ "op": "Replace", "path": "active", "value": "False" }    // Entra ID — capital op, STRING value
{ "op": "remove",  "path": "active" }                      // some connectors
```

**Security:**

- Tokens stored **only as a SHA-256 hash**. This table leaking does not hand
  anyone provisioning rights.
- Constant-time comparison.
- Every read and write is partitioned by `ORG#<orgId>`. There is no code path
  that touches users without an org key, so one customer's IdP cannot see or
  modify another's.

### Enterprise enquiries — `/enterprise`

Captures name, organisation, work email, seat band, timeline and what they
actually need. Seat count and timeline are what tell you whether a lead is a
call this week or a note in six months. Free-mail domains are flagged, not
rejected — plenty of real firms use Gmail, but "500 seats" from one is worth a
second look before you spend an hour on a proposal.

Notifies the SNS alerts topic, so a lead can't sit unread.

---

## Provisioning a customer — your steps

### 1. Create the organisation and issue a SCIM token

```bash
cd backend/enterprise
node provision-org.mjs --name "Acme Trading" --domain acme.com --seats 50 --profile traxent
```

Prints the bearer token **once**. It is stored hashed and cannot be retrieved —
if it's lost, rotate rather than recover:

```bash
node provision-org.mjs --rotate-token --org-id org_xxx --profile traxent
```

### 2. Give the customer their details

- SCIM base URL: `https://gqway1e53f.execute-api.eu-west-2.amazonaws.com/scim/v2`
- Bearer token: the one just printed
- Tell them: SCIM 2.0, Users only, `PATCH` supported, `filter` supported

In Okta that's *Provisioning → Integration → Enable API integration*. In Entra
ID it's *Provisioning → Automatic → Tenant URL + Secret Token*. Both have a
**Test Connection** button that hits `ServiceProviderConfig` — get a green tick
there before going further.

### 3. SSO, when a customer asks — Auth0 dashboard

1. Subscribe to **B2B Essentials** if you haven't.
2. *Authentication → Enterprise →* SAML or OIDC → **Create Connection**.
3. Exchange metadata with the customer's IdP team. They give you their metadata
   URL or certificate; you give them your ACS URL and Entity ID from that page.
4. Enable the connection **for the Traxent SPA application only**.
5. Set **Home Realm Discovery** on their email domain, so `@acme.com` addresses
   route to their IdP automatically instead of the password form.
6. Record the connection ID against the org:
   ```bash
   node provision-org.mjs --org-id org_xxx --sso-connection con_xxx --profile traxent
   ```
7. Test with a real account from the customer's directory before you tell them
   it's live. Auth0's own test button doesn't exercise Home Realm Discovery.

---

## Still open

1. **Seat enforcement isn't wired up.** The org record holds `seats`, and SCIM
   will happily provision past it. Fine while every deal is hand-managed; needs
   doing before self-serve.
2. **SSO users don't inherit the org's plan automatically.** An Auth0 Action or
   post-login rule should map the connection to the org's tier. Worth writing
   with the first customer, against their real directory, rather than guessing.
3. **White label and data logging are listed as "on request"** on the page,
   which is honest — they aren't built. Don't let the page drift into implying
   otherwise.
4. **No admin UI for organisations.** `provision-org.mjs` is the interface.
   Adequate for single figures of customers.
