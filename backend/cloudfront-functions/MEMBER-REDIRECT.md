# Edge member redirect (dormant) — switchover guide

`member-redirect.js` is a CloudFront Function that redirects logged-in members from
the marketing root (`/`) straight to `/home` **server-side**, before any HTML is
served — so there's no flash of the marketing page (the Netflix-style redirect).

It reads a non-sensitive hint cookie `tx_session=1` that the SPA already sets on
login (`src/auth.js` → `setSessionHint`). That cookie ships now and is **inert**
until this function is associated with the distribution. Real auth is always
enforced by the Auth0 token — the cookie is only a routing hint.

**Current state: DORMANT.** The code is in the repo; nothing runs until step 4.
A client-side fallback (`index.html` head script) already removes the flash, so
this edge version is an enhancement, not a fix.

## Activate (switchover)

1. **Create the function (one-time).** AWS Console → CloudFront → Functions →
   Create function → name `traxent-member-redirect`, runtime **cloudfront-js-2.0**.
   (Or CLI: `aws cloudfront create-function --name traxent-member-redirect \
   --function-config Comment="member root->/home redirect",Runtime="cloudfront-js-2.0" \
   --function-code fileb://backend/cloudfront-functions/member-redirect.js`.)

2. **Wire it into the code deploy.** Add to `backend/deploy-map.json` under
   `cloudfrontFunctions`:
   `"backend/cloudfront-functions/member-redirect.js": "traxent-member-redirect"`
   then push — `deploy-backend.yml` publishes the latest code to it.

3. **Test it (no traffic impact yet).** CloudFront → Functions → traxent-member-redirect
   → Test: build a Viewer-request event with `uri = "/"`.
   - With cookie `tx_session=1` → expect a `302` to `/home`.
   - Without the cookie → expect the request to pass through unchanged.
   - With `uri = "/"` and querystring `stay=1` → pass through.

4. **Go live (the switchover).** CloudFront → your distribution → Behaviors → the
   Default (`*`) behavior → Edit → Function associations → **Viewer request** →
   Function type: CloudFront Functions → select `traxent-member-redirect` → Save.
   This is the moment it activates.

5. **Verify.** Incognito (logged out): `traxent.io` shows the marketing page.
   Logged in: `traxent.io` jumps straight to `/home`, no flash. `traxent.io/?stay=1`
   shows the public site even when logged in.

6. **Roll back instantly.** Same Behaviors screen → remove the Viewer-request
   association → Save. (The hint cookie can stay; it's harmless.)

## Later: region / currency routing (same hook)

This is the natural place to add Netflix-style region handling — e.g. show £ vs $
pricing. A Viewer-request function can read the `CloudFront-Viewer-Country` header
(enable it on the cache/origin-request policy first) and redirect or set a country
cookie. Note the bigger part of that feature is Stripe (multi-currency prices), not
this function. Out of scope until you want it.
