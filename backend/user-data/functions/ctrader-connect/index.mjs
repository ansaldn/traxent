// ── Traxent cTrader connection API ──────────────────────────────────────────
// Handles the OAuth side of "Connect your account" for cTrader (read-only,
// scope=accounts — the app was registered WITHOUT the trading scope, matching
// the site-wide promise that Traxent can never place trades).
//
// Routes (specific routes win over the user-data function's ANY /user/{proxy+}):
//   GET    /user/ctrader/status    → { connected, since, authUrl } (never tokens)
//   POST   /user/ctrader/exchange  → { code } → exchanges at openapi.ctrader.com,
//                                    stores tokens in the user's CONNECTION row
//   DELETE /user/ctrader           → disconnect (delete the row)
//
// Token storage: { userId, sk: 'CONNECTION#ctrader', accessToken, refreshToken,
// expiresAt, scope, updatedAt } in TraxentUserData (SSE-encrypted at rest).
// GET /user never surfaces CONNECTION# rows, and the delete-account purge
// removes them with everything else. Tokens are never logged.
//
// Phase 2 (separate build): the deal-sync worker that uses these tokens over
// cTrader's Open API (protobuf/WebSocket) to pull closed positions for scoring.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';
import { randomUUID } from 'crypto';

const TABLE = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://traxent.io';
// Must be byte-identical to the URI registered in the cTrader developer portal.
const REDIRECT_URI = process.env.CTRADER_REDIRECT_URI || 'https://traxent.io/integrations';
const AUTH_BASE = 'https://connect.spotware.com/apps/auth';
const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});

const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);

const verifier = JwtRsaVerifier.create({
  issuer: process.env.AUTH0_ISSUER || 'https://auth.traxent.io/',
  audience: AUDIENCES,
  jwksUri: (process.env.AUTH0_ISSUER || 'https://auth.traxent.io/') + '.well-known/jwks.json',
});

const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function requireUser(event) {
  const h = event.headers || {};
  const token = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('Missing Authorization header'); e.statusCode = 401; throw e; }
  let payload;
  try { payload = await verifier.verify(token); }
  catch { const e = new Error('Invalid token'); e.statusCode = 401; throw e; }
  if (!payload.sub) { const e = new Error('Token missing sub'); e.statusCode = 401; throw e; }
  return { sub: payload.sub };
}

async function getParam(name) {
  const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return r.Parameter.Value;
}

const SK = 'CONNECTION#ctrader';
const STATE_SK = 'CTRADER_OAUTH_STATE';       // one pending state per user
const STATE_TTL_SECONDS = 10 * 60;            // 10-minute window

async function getConnection(userId) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId, sk: SK } }));
  return r.Item || null;
}

// ── CSRF state (WB-NEW-03) ───────────────────────────────────────────────────
// The OAuth `state` is minted and stored SERVER-SIDE, bound to the user's sub,
// with a short TTL. Exchange requires it, rejects when absent/unknown/expired,
// and consumes it on use so a code can't be replayed. The browser only relays
// the opaque value back — it is never the source of truth.
async function mintState(userId) {
  const state = randomUUID();
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      userId, sk: STATE_SK, state,
      createdAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS, // DynamoDB TTL attribute
    },
  }));
  return state;
}

// Returns true only if `state` is present, matches the stored value for this
// user, and hasn't expired. Deletes the stored state either way (single use).
async function consumeState(userId, state) {
  if (!state || typeof state !== 'string') return false;
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId, sk: STATE_SK } }));
  const row = r.Item;
  // Always clear it — a failed attempt shouldn't leave a reusable state behind.
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId, sk: STATE_SK } })).catch(() => {});
  if (!row || row.state !== state) return false;
  if (row.expiresAt && row.expiresAt < Math.floor(Date.now() / 1000)) return false;
  return true;
}

// cTrader's token endpoint has answered in both camelCase and snake_case over
// time — accept either shape rather than betting on one.
function normaliseTokens(t) {
  return {
    accessToken: t.accessToken || t.access_token || null,
    refreshToken: t.refreshToken || t.refresh_token || null,
    expiresIn: Number(t.expiresIn || t.expires_in || 0) || null,
  };
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errorCode || (!body.accessToken && !body.access_token)) {
    const e = new Error(body.description || body.errorCode || `token endpoint HTTP ${res.status}`);
    e.statusCode = 502;
    throw e;
  }
  return normaliseTokens(body);
}

async function saveConnection(userId, tokens) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      userId, sk: SK,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : null,
      scope: 'accounts',
      updatedAt: new Date().toISOString(),
    },
  }));
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  let user;
  try { user = await requireUser(event); }
  catch (err) { return json(err.statusCode || 401, { error: err.message }); }

  const rawPath = event.rawPath || event.path || '';
  const path = rawPath.replace(/^.*\/user\/ctrader/, '') || '/';
  let body = {};
  if (event.body) { try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON body' }); } }

  try {
    // GET /user/ctrader/status — safe summary + the auth URL the frontend
    // should send the user to (client_id read from SSM, never hardcoded).
    if (method === 'GET' && path === '/status') {
      const [conn, clientId] = await Promise.all([
        getConnection(user.sub),
        getParam('/traxent/ctrader/client_id'),
      ]);
      // Mint a server-side, user-bound state and embed it in the auth URL.
      const state = await mintState(user.sub);
      const authUrl = `${AUTH_BASE}?client_id=${encodeURIComponent(clientId)}`
        + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
        + `&scope=accounts&response_type=code&product=web`
        + `&state=${encodeURIComponent(state)}`;
      return json(200, {
        connected: !!conn,
        since: conn?.updatedAt || null,
        scope: conn?.scope || null,
        authUrl,
      });
    }

    // POST /user/ctrader/exchange — swap the one-time code for tokens.
    if (method === 'POST' && path === '/exchange') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!code) return json(400, { error: 'code required' });
      // CSRF: state is REQUIRED and validated server-side (WB-NEW-03). Absent,
      // unknown, expired or another user's state all fail — a crafted
      // ?code=… link with no valid state can no longer bind an account.
      const state = typeof body.state === 'string' ? body.state.trim() : '';
      if (!(await consumeState(user.sub, state))) {
        return json(400, { error: 'invalid_state', message: 'Connection request could not be verified. Please start the connection again.' });
      }
      const [clientId, clientSecret] = await Promise.all([
        getParam('/traxent/ctrader/client_id'),
        getParam('/traxent/ctrader/client_secret'),
      ]);
      const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      });
      await saveConnection(user.sub, tokens);
      return json(200, { connected: true });
    }

    // DELETE /user/ctrader — disconnect.
    if (method === 'DELETE' && (path === '/' || path === '')) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId: user.sub, sk: SK } }));
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found', method, path });
  } catch (err) {
    // Never log request bodies or tokens — the message is enough to debug.
    console.error('ctrader-connect error:', err.message);
    return json(err.statusCode || 500, { error: err.statusCode ? err.message : 'Internal error' });
  }
};
