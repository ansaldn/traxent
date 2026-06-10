import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { JwtRsaVerifier } from 'aws-jwt-verify';
import { randomUUID } from 'crypto';

// ── Traxent user-data API ───────────────────────────────────────────────────
// Persists per-user lesson progress, paper trades, and firm selections in a
// single DynamoDB table keyed by the Auth0 `sub`. Auth: the same Auth0 ID token
// the frontend already holds (audience = SPA Client ID).

const TABLE = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://traxent.io';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const verifier = JwtRsaVerifier.create({
  issuer: process.env.AUTH0_ISSUER || 'https://auth.traxent.io/',
  audience: process.env.AUTH0_AUDIENCE || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz',
  jwksUri: (process.env.AUTH0_ISSUER || 'https://auth.traxent.io/') + '.well-known/jwks.json',
});

const NS = 'https://traxent.io';

const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function requireUser(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('Missing Authorization header'); e.statusCode = 401; throw e; }
  let payload;
  try { payload = await verifier.verify(token); }
  catch { const e = new Error('Invalid token'); e.statusCode = 401; throw e; }
  if (!payload.sub) { const e = new Error('Token missing sub'); e.statusCode = 401; throw e; }
  return { sub: payload.sub, plan: payload[`${NS}/plan`] || 'free', email: payload.email };
}

// ── Data access ─────────────────────────────────────────────────────────────
async function getAllState(userId) {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  const items = out.Items || [];
  const state = { progress: {}, firms: [], trades: [], profile: null };
  for (const it of items) {
    if (it.sk === 'PROGRESS') state.progress = it.data || {};
    else if (it.sk === 'FIRMS') state.firms = it.data || [];
    else if (it.sk === 'PROFILE') state.profile = { plan: it.plan, email: it.email, updatedAt: it.updatedAt };
    else if (it.sk && it.sk.startsWith('TRADE#')) state.trades.push({ id: it.sk.slice(6), ...it.data, createdAt: it.createdAt });
  }
  state.trades.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return state;
}

async function putSingleton(userId, sk, data) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { userId, sk, data, updatedAt: new Date().toISOString() },
  }));
}

async function addTrade(userId, trade) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  // Whitelist fields to avoid storing arbitrary payloads.
  const clean = {
    result: trade.result, risk: numOrNull(trade.risk), rr: numOrNull(trade.rr),
    instrument: strOrNull(trade.instrument), plan: strOrNull(trade.plan),
    emotion: strOrNull(trade.emotion), planMatch: !!trade.planMatch,
    note: strOrNull(trade.note, 280),
  };
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { userId, sk: `TRADE#${id}`, data: clean, createdAt },
  }));
  return { id, ...clean, createdAt };
}

async function deleteTrade(userId, id) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId, sk: `TRADE#${id}` } }));
}

function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function strOrNull(v, max = 60) { return typeof v === 'string' ? v.slice(0, max) : null; }

// ── Router ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  let user;
  try { user = await requireUser(event); }
  catch (err) { return json(err.statusCode || 401, { error: err.message }); }

  const rawPath = event.rawPath || event.path || '/user';
  const path = rawPath.replace(/^.*\/user/, '') || '/'; // part after /user
  let body = {};
  if (event.body) { try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON body' }); } }

  try {
    // GET /user → full state
    if (method === 'GET' && (path === '/' || path === '')) {
      return json(200, await getAllState(user.sub));
    }
    // PUT /user/progress
    if (method === 'PUT' && path === '/progress') {
      if (typeof body.progress !== 'object' || body.progress === null) return json(400, { error: 'progress object required' });
      await putSingleton(user.sub, 'PROGRESS', body.progress);
      return json(200, { ok: true });
    }
    // PUT /user/firms
    if (method === 'PUT' && path === '/firms') {
      if (!Array.isArray(body.firms)) return json(400, { error: 'firms array required' });
      await putSingleton(user.sub, 'FIRMS', body.firms.slice(0, 12).map(String));
      return json(200, { ok: true });
    }
    // POST /user/trades
    if (method === 'POST' && path === '/trades') {
      if (!body || typeof body !== 'object') return json(400, { error: 'trade object required' });
      const saved = await addTrade(user.sub, body);
      return json(201, saved);
    }
    // DELETE /user/trades/{id}
    if (method === 'DELETE' && path.startsWith('/trades/')) {
      const id = path.slice('/trades/'.length);
      if (!id) return json(400, { error: 'trade id required' });
      await deleteTrade(user.sub, id);
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found', method, path });
  } catch (err) {
    console.error('user-data error:', err);
    return json(500, { error: 'Internal error' });
  }
};
