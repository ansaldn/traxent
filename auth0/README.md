# Custom Auth0 login page

`universal-login-template.html` is a **New Universal Login page template** for `auth.traxent.io`.
It renders a 50/50 split: an animated, themed Traxent splash on the left and the Auth0 login
widget on the right (it collapses to just the widget on mobile). Requires a custom domain — which
you have — and the New Universal Login experience (the one currently live).

It works by wrapping Auth0's own form: the required Liquid tags `{%- auth0:head -%}` and
`{%- auth0:widget -%}` inject Auth0's head and the login widget, so all the auth logic stays
Auth0's — this only controls the surrounding layout and styling.

## Apply it (two ways)

**A. Dashboard (easiest)**
Auth0 Dashboard → **Branding → Universal Login**. With a custom domain you get a page-template
editor (Customization / Advanced). Paste the full contents of `universal-login-template.html`,
preview, and save.

**B. Management API** (if the dashboard editor isn't shown)
Use a token with the `update:branding` scope (add that scope to the M2M app you created for
account deletion, or use the Dashboard's API Explorer token):
```
curl -X PUT 'https://auth.traxent.io/api/v2/branding/templates/universal-login' \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @<(jq -Rs '{template: .}' auth0/universal-login-template.html)
```
(That `jq -Rs` wraps the HTML file as a JSON string in the `template` field.)

## Theme the widget itself
The template styles the *layout*; the form's colors come from branding settings. In
**Branding → Settings** (and/or Branding → Universal Login → Settings) set:
- **Primary color:** `#0a6e4f` (Traxent green) — themes the Continue button and links.
- **Page background:** `#f7f6f2` (or leave; the right panel already uses it).
- **Logo:** your Traxent mark, if you want it above the form.

## Notes
- Keep both `{%- auth0:head -%}` and `{%- auth0:widget -%}` exactly as-is — Auth0 rejects a
  template that's missing either.
- The splash animation is pure CSS (no JS), so it's safe within Auth0's page sandbox.
- To revert, clear the page template in the same place (the form falls back to the default
  centered layout).
- Preview shows the login, signup, password-reset and MFA screens in the same frame — check a
  couple to confirm the widget fits the right-hand panel.
