// ── Traxent account-update Lambda ───────────────────────────────────────────
// POST /user/profile        — update the signed-in user's name and/or email
// POST /user/password-reset — send the signed-in user a password-reset email
//
// Lets users manage their account on traxent.io's own account page instead of
// Auth0's hosted UI. Isolated from the data function because it holds Auth0-admin
// (m2m) permissions — same pattern as delete-account.
//
// Identity always comes from the verified Auth0 ID token (the `sub`), never from
// the request body, so a user can only ever change their own account.
//
// SSM params: /traxent/auth0/domain, /traxent/auth0/m2m_client_id,
//             /traxent/auth0/m2m_client_secret   (the same m2m app the webhook
//             uses — it already has the `update:users` scope).
// The m2m app needs `update:users` (for name/email) — already present since it
// assigns plan roles. Password reset uses the public Authentication API (no scope).

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';

const ssm = new SSMClient({});

const ISSUER = process.env.AUTH0_ISSUER || 'https://auth.traxent.io/';
const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);
const DB_CONNECTION = process.env.AUTH0_DB_CONNECTION || 'Username-Password-Authentication';
const SPA_CLIENT_ID = process.env.AUTH0_SPA_CLIENT_ID || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz';

const verifier = JwtRsaVerifier.create({
  issuer: ISSUER,
  audience: AUDIENCES,
  jwksUri: ISSUER + '.well-known/jwks.json',
});

const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}

// Works for both HTTP API (payload v2) and REST (v1) event shapes.
const httpMethod = (e) => e.requestContext?.http?.method || e.httpMethod || '';
const httpPath = (e) => e.requestContext?.http?.path || e.rawPath || e.path || '';

async function requireAuth(event) {
  const h = event.headers || {};
  const token = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('Missing Authorization header'); e.statusCode = 401; throw e; }
  let payload;
  try { payload = await verifier.verify(token); }
  catch (e) { console.error('JWT verify failed:', e.message); const err = new Error('Invalid token'); err.statusCode = 401; throw err; }
  if (!payload.sub) { const e = new Error('Token missing sub claim'); e.statusCode = 401; throw e; }
  return { sub: payload.sub, email: payload.email };
}

// Cache the m2m token across warm invocations.
let mgmtCache = { token: null, exp: 0 };
async function mgmtToken(domain, clientId, clientSecret) {
  if (mgmtCache.token && Date.now() < mgmtCache.exp) return mgmtCache.token;
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, audience: `https://${domain}/api/v2/`, grant_type: 'client_credentials' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('mgmt token failed: ' + (data.error_description || res.status));
  mgmtCache = { token: data.access_token, exp: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
  return data.access_token;
}

export const handler = async (event) => {
  if (httpMethod(event) === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let auth;
  try { auth = await requireAuth(event); }
  catch (err) { return json(err.statusCode || 401, { error: err.message || 'Unauthorized' }); }

  let domain, mId, mSecret;
  try {
    [domain, mId, mSecret] = await Promise.all([
      getParam('/traxent/auth0/domain'),
      getParam('/traxent/auth0/m2m_client_id'),
      getParam('/traxent/auth0/m2m_client_secret'),
    ]);
  } catch (e) {
    console.error('SSM read failed:', e);
    return json(500, { error: 'Server configuration error' });
  }

  const path = httpPath(event);

  try {
    // ── Password reset email (public Authentication API — no m2m scope needed) ──
    if (path.endsWith('/password-reset')) {
      const res = await fetch(`https://${domain}/dbconnections/change_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: SPA_CLIENT_ID, email: auth.email, connection: DB_CONNECTION }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); console.error('password reset failed:', res.status, t); throw new Error('reset-failed'); }
      return json(200, { success: true, message: 'Password reset email sent.' });
    }

    // ── Profile update (name / email) via Management API ──
    if (path.endsWith('/profile')) {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request body' }); }

      const patch = {};
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 100);

      let emailChanged = false;
      if (typeof body.email === 'string' && body.email.trim() && body.email.trim().toLowerCase() !== (auth.email || '').toLowerCase()) {
        const email = body.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Please enter a valid email address.' });
        patch.email = email;
        patch.email_verified = false; // new email must be re-verified
        emailChanged = true;
      }

      if (!Object.keys(patch).length) return json(400, { error: 'Nothing to update.' });

      const token = await mgmtToken(domain, mId, mSecret);
      const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(auth.sub)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('PATCH /users failed:', res.status, data);
        // 409 = email already in use; 403 = m2m missing update:users scope.
        if (res.status === 409) return json(409, { error: 'That email is already in use.' });
        if (res.status === 403) return json(403, { error: 'Account updates are not enabled — missing update:users scope.' });
        return json(400, { error: data.message || 'Update failed.' });
      }

      // Best-effort: send a verification email for the new address.
      if (emailChanged) {
        try {
          await fetch(`https://${domain}/api/v2/jobs/verification-email`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: auth.sub, client_id: SPA_CLIENT_ID }),
          });
        } catch (e) { console.warn('verification-email job failed (non-fatal):', e); }
      }

      return json(200, { success: true, name: patch.name ?? null, email: patch.email ?? null, emailChanged });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('account-update error:', err);
    return json(500, { error: 'Server error' });
  }
};
