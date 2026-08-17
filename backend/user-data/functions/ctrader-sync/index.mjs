// ── Traxent cTrader deal-sync worker (phase 2 of Connect your account) ──────
// Pulls CLOSED deals from users' connected cTrader accounts and stores them as
// RTRADE# rows, so readiness scoring can run on real fills. Read-only by
// construction: the OAuth scope is `accounts` (no trading), and this worker
// only ever sends list/read messages.
//
// Protocol: cTrader Open API over WebSocket with JSON messaging —
// wss://live.ctraderapi.com:5036 and wss://demo.ctraderapi.com:5036, envelope
// {clientMsgId, payloadType, payload}. Flow per docs: app auth (2100) →
// account list by access token (2149) → account auth (2102, on the proxy
// matching the account's isLive) → light symbols list (2114, for names) →
// deal list (2133) in ≤7-day windows. Errors arrive as 2142/50.
//
// Triggers:
//   - EventBridge schedule (every 6h): sync every user with a connection row.
//   - POST /user/ctrader/sync (JWT-authed): sync just the caller, on demand —
//     called right after connecting so trades appear without waiting.
//
// NOTE: written against the documented protocol BEFORE cTrader app approval —
// it cannot be integration-tested until a real token exists. First live
// connection is the shakedown; failure modes are logged per-user and never
// throw the whole run.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';
import { randomUUID } from 'crypto';

const TABLE = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://traxent.io';
const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';
const HOSTS = { live: 'wss://live.ctraderapi.com:5036', demo: 'wss://demo.ctraderapi.com:5036' };
const PT = { // payload types (ProtoOA unless noted)
  ERROR: 50, HEARTBEAT: 51,
  APP_AUTH_REQ: 2100, APP_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102, ACCOUNT_AUTH_RES: 2103,
  OA_ERROR: 2142,
  SYMBOLS_LIST_REQ: 2114, SYMBOLS_LIST_RES: 2115,
  DEAL_LIST_REQ: 2133, DEAL_LIST_RES: 2134,
  ACCOUNT_LIST_REQ: 2149, ACCOUNT_LIST_RES: 2150,
};
const WEEK_MS = 7 * 24 * 3600 * 1000;
const LOOKBACK_MS = 90 * 24 * 3600 * 1000; // first sync: last 90 days
const MSG_TIMEOUT_MS = 15000;

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
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function getParam(name) {
  const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return r.Parameter.Value;
}

// ── Minimal request/response client over the JSON WebSocket ─────────────────
function openSession(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map(); // clientMsgId → {resolve, reject, timer}

    ws.onopen = () => resolve({
      request(payloadType, payload) {
        return new Promise((res, rej) => {
          const clientMsgId = randomUUID();
          const timer = setTimeout(() => {
            pending.delete(clientMsgId);
            rej(new Error(`timeout waiting for response to ${payloadType}`));
          }, MSG_TIMEOUT_MS);
          pending.set(clientMsgId, { res, rej, timer });
          ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
        });
      },
      close() { try { ws.close(); } catch {} },
    });
    ws.onerror = (e) => reject(new Error('websocket error: ' + (e?.message || url)));
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      if (msg.payloadType === PT.HEARTBEAT) {
        try { ws.send(JSON.stringify({ payloadType: PT.HEARTBEAT, payload: {} })); } catch {}
        return;
      }
      const waiter = msg.clientMsgId && pending.get(msg.clientMsgId);
      if (!waiter) return;
      pending.delete(msg.clientMsgId);
      clearTimeout(waiter.timer);
      if (msg.payloadType === PT.OA_ERROR || msg.payloadType === PT.ERROR) {
        const p = msg.payload || {};
        const err = new Error(p.description || p.errorCode || 'cTrader error');
        err.errorCode = p.errorCode;
        waiter.rej(err);
      } else {
        waiter.res(msg.payload || {});
      }
    };
  });
}

// ── Token freshness ─────────────────────────────────────────────────────────
function normaliseTokens(t) {
  return {
    accessToken: t.accessToken || t.access_token || null,
    refreshToken: t.refreshToken || t.refresh_token || null,
    expiresIn: Number(t.expiresIn || t.expires_in || 0) || null,
  };
}

async function ensureFreshToken(conn, creds) {
  const expiresSoon = conn.expiresAt && (new Date(conn.expiresAt).getTime() - Date.now() < 24 * 3600 * 1000);
  if (!expiresSoon || !conn.refreshToken) return conn;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  const t = normaliseTokens(body);
  if (!t.accessToken) return conn; // keep trying with the old one; auth error surfaces downstream
  const updated = {
    ...conn,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken || conn.refreshToken,
    expiresAt: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : conn.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

// ── Deal mapping ────────────────────────────────────────────────────────────
// Money fields arrive as integers scaled by moneyDigits; prices by 10^5.
function scaleMoney(v, moneyDigits) {
  if (v === undefined || v === null) return null;
  return Number(v) / Math.pow(10, Number(moneyDigits ?? 2));
}

function mapDeal(deal, symbolNames, isLive) {
  const cpd = deal.closePositionDetail;
  if (!cpd) return null; // only closed portions become trades
  const md = deal.moneyDigits;
  const gross = scaleMoney(cpd.grossProfit, md) ?? 0;
  const swap = scaleMoney(cpd.swap, md) ?? 0;
  const commission = scaleMoney(cpd.commission, md) ?? 0;
  const net = gross + swap + commission;
  return {
    dealId: String(deal.dealId),
    positionId: deal.positionId !== undefined ? String(deal.positionId) : null,
    instrument: symbolNames[deal.symbolId] || ('symbol#' + deal.symbolId),
    direction: deal.tradeSide === 2 || deal.tradeSide === 'SELL' ? 'sell' : 'buy',
    volume: deal.filledVolume ?? deal.volume ?? null,
    profit: Number(net.toFixed(2)),
    result: net >= 0 ? 'win' : 'loss',
    entryPrice: cpd.entryPrice ?? null,
    closePrice: deal.executionPrice ?? null,
    closedAt: deal.executionTimestamp ? new Date(Number(deal.executionTimestamp)).toISOString() : null,
    isLive: !!isLive,
  };
}

// ── Per-user sync ───────────────────────────────────────────────────────────
async function syncUser(conn, creds) {
  conn = await ensureFreshToken(conn, creds);
  const fromDefault = Date.now() - LOOKBACK_MS;
  const since = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() - 3600 * 1000 : fromDefault; // 1h overlap
  let saved = 0;

  // Discover accounts once (either proxy answers), then talk to each account
  // on the proxy that owns it (live vs demo).
  const first = await openSession(HOSTS.live);
  let accounts;
  try {
    await first.request(PT.APP_AUTH_REQ, { clientId: creds.clientId, clientSecret: creds.clientSecret });
    const list = await first.request(PT.ACCOUNT_LIST_REQ, { accessToken: conn.accessToken });
    accounts = list.ctidTraderAccount || [];
  } finally { /* keep open for live accounts */ }

  const byHost = { live: first, demo: null };
  try {
    for (const acct of accounts) {
      const hostKey = acct.isLive ? 'live' : 'demo';
      if (!byHost[hostKey]) {
        byHost[hostKey] = await openSession(HOSTS[hostKey]);
        await byHost[hostKey].request(PT.APP_AUTH_REQ, { clientId: creds.clientId, clientSecret: creds.clientSecret });
      }
      const s = byHost[hostKey];
      const id = acct.ctidTraderAccountId;
      try {
        await s.request(PT.ACCOUNT_AUTH_REQ, { ctidTraderAccountId: id, accessToken: conn.accessToken });

        const symRes = await s.request(PT.SYMBOLS_LIST_REQ, { ctidTraderAccountId: id, includeArchivedSymbols: false });
        const symbolNames = {};
        for (const sym of (symRes.symbol || [])) symbolNames[sym.symbolId] = sym.symbolName;

        // Deal history in ≤1-week windows (API constraint).
        for (let from = since; from < Date.now(); from += WEEK_MS) {
          const to = Math.min(from + WEEK_MS, Date.now());
          const dealsRes = await s.request(PT.DEAL_LIST_REQ, {
            ctidTraderAccountId: id, fromTimestamp: from, toTimestamp: to, maxRows: 500,
          });
          for (const deal of (dealsRes.deal || [])) {
            const t = mapDeal(deal, symbolNames, acct.isLive);
            if (!t) continue;
            await ddb.send(new PutCommand({
              TableName: TABLE,
              Item: {
                userId: conn.userId, sk: `RTRADE#${t.dealId}`, source: 'ctrader',
                accountId: String(id), data: t, createdAt: t.closedAt || new Date().toISOString(),
              },
            }));
            saved++;
          }
        }
      } catch (e) {
        console.error(`ctrader-sync account ${id} (non-fatal):`, e.errorCode || e.message);
      }
    }
  } finally {
    Object.values(byHost).forEach((s) => s && s.close());
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: conn.userId, sk: 'CONNECTION#ctrader' },
    UpdateExpression: 'SET lastSyncAt = :t, lastSyncCount = :c',
    ExpressionAttributeValues: { ':t': new Date().toISOString(), ':c': saved },
  }));
  return saved;
}

async function getCreds() {
  const [clientId, clientSecret] = await Promise.all([
    getParam('/traxent/ctrader/client_id'),
    getParam('/traxent/ctrader/client_secret'),
  ]);
  return { clientId, clientSecret };
}

// ── Handler: API (sync me now) or schedule (sync everyone) ─────────────────
export const handler = async (event) => {
  const isApi = !!(event.requestContext || event.httpMethod);

  if (isApi) {
    const method = event.requestContext?.http?.method || event.httpMethod || 'POST';
    if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    let sub;
    try {
      const h = event.headers || {};
      const token = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (!token) throw new Error('Missing Authorization header');
      sub = (await verifier.verify(token)).sub;
    } catch (e) { return json(401, { error: e.message || 'Unauthorized' }); }
    const row = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId: sub, sk: 'CONNECTION#ctrader' } }));
    if (!row.Item) return json(404, { error: 'No cTrader connection' });
    try {
      const saved = await syncUser(row.Item, await getCreds());
      return json(200, { ok: true, synced: saved });
    } catch (e) {
      console.error('ctrader-sync (api) failed:', e.errorCode || e.message);
      return json(502, { error: 'Sync failed — will retry on the next scheduled run' });
    }
  }

  // Scheduled: every connected user, failures isolated per user.
  const creds = await getCreds();
  let users = 0, trades = 0, failures = 0, ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'sk = :c',
      ExpressionAttributeValues: { ':c': 'CONNECTION#ctrader' },
      ExclusiveStartKey,
    }));
    for (const conn of (page.Items || [])) {
      users++;
      try { trades += await syncUser(conn, creds); }
      catch (e) { failures++; console.error(`ctrader-sync user ${conn.userId} (non-fatal):`, e.errorCode || e.message); }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  console.log(`ctrader-sync run: ${users} users, ${trades} trades saved, ${failures} failures`);
  return { users, trades, failures };
};
