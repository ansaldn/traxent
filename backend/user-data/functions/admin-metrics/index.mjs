// ── Traxent admin-metrics Lambda ────────────────────────────────────────────
// GET /admin/metrics — ADMIN-ONLY aggregate metrics dashboard.
//
// Returns COUNTS ONLY (no per-user records, emails, names or IDs) so it stays
// low privacy-risk: total signups, active subscriptions + MRR + plan mix, and
// usage totals derived from the DynamoDB schema. Built for the internal admin
// page at src/admin.html.
//
// Two-stage gate:
//   1. AUTHENTICATE — verify the caller's Auth0 ID token (same pattern as
//      delete-account / account-update: aws-jwt-verify, issuer
//      https://auth.traxent.io/, audiences from AUTH0_AUDIENCE).
//   2. AUTHORIZE — the token `sub` must be in the comma-separated ADMIN_SUBS
//      allow-list. If ADMIN_SUBS is empty/unset, EVERYONE is denied (safe
//      default — the dashboard grants nobody access until you opt an admin in).
//
// Env vars:
//   TABLE_NAME          DynamoDB table (TraxentUserData)
//   AUTH0_ISSUER        Auth0 token issuer (default https://auth.traxent.io/)
//   AUTH0_AUDIENCE      comma-separated ID-token audiences (SPA + iOS client IDs)
//   ADMIN_SUBS          comma-separated Auth0 `sub`s allowed to view metrics
//   ALLOWED_ORIGIN      CORS allowed origin (default https://traxent.io)
//
// SSM params (all under /traxent/*, read with decryption):
//   /traxent/auth0/domain, /traxent/auth0/m2m_client_id,
//   /traxent/auth0/m2m_client_secret           — signup count (Mgmt API)
//   /traxent/stripe/secret_key                  — subs + MRR
//   /traxent/stripe/price_observer|challenger|funded_ready — plan mapping
//
// Resilient: if one data source errors, the others are still returned along
// with an `errors` array. Always responds JSON with CORS.
//
// SCHEMA NOTE (from functions/user-data/index.mjs): each user partition holds
//   sk = 'PROGRESS'      singleton, data = { <lessonKey>: true, ... }  (lessons/quizzes)
//   sk = 'FIRMS'         singleton, data = [ firmId, ... ]              (firm selections)
//   sk = 'PROFILE'       singleton, billing/plan mirror
//   sk = 'TRADE#<uuid>'  one item per logged sim trade
// We Scan once (bounded, paginated) and aggregate those into counts.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';
import Stripe from 'stripe';

const TABLE = process.env.TABLE_NAME;
const ISSUER = process.env.AUTH0_ISSUER || 'https://auth.traxent.io/';
const AUDIENCES = (process.env.AUTH0_AUDIENCE
  || 'ilvfACgF2sCmLWaugCn11qTB04aTvWxz,YKvrjZoxnehdES7nmMs9SRXi3G0MdXcK')
  .split(',').map(s => s.trim()).filter(Boolean);
// Allow-list of admin Auth0 `sub`s. Empty ⇒ deny everyone (safe default).
const ADMIN_SUBS = new Set(
  (process.env.ADMIN_SUBS || '').split(',').map(s => s.trim()).filter(Boolean),
);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

const verifier = JwtRsaVerifier.create({
  issuer: ISSUER,
  audience: AUDIENCES,            // accepts an array — covers SPA + iOS clients
  jwksUri: ISSUER + '.well-known/jwks.json',
});

const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}

// Works for both HTTP API (payload v2) and REST (v1) event shapes.
const httpMethod = (e) => e.requestContext?.http?.method || e.httpMethod || '';

// ── 1. Signups: total Auth0 users via the Management API ─────────────────────
// `per_page=0` + `include_totals=true` returns just the `total` — no user
// records are fetched, so nothing personal leaves Auth0.
async function getSignupCount() {
  const [domain, clientId, clientSecret] = await Promise.all([
    getParam('/traxent/auth0/domain'),
    getParam('/traxent/auth0/m2m_client_id'),
    getParam('/traxent/auth0/m2m_client_secret'),
  ]);
  const tokenRes = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tok.access_token) {
    throw new Error('Auth0 management token failed: ' + (tok.error_description || tokenRes.status));
  }
  const usersRes = await fetch(
    `https://${domain}/api/v2/users?include_totals=true&per_page=0`,
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
  );
  const data = await usersRes.json().catch(() => ({}));
  if (!usersRes.ok) {
    // 403 here almost always means the m2m app is missing the `read:users` scope.
    throw new Error('Auth0 users query failed: ' + usersRes.status + (data.message ? ' ' + data.message : ''));
  }
  return { totalUsers: Number(data.total) || 0 };
}

// ── 2. Subscriptions + MRR + plan breakdown from Stripe ──────────────────────
// Counts active subscriptions, normalises each item's amount to a MONTHLY
// figure, and groups by price ID → plan name using the SSM price params.
function monthlyAmountFromItem(item) {
  const price = item.price || {};
  const unit = (price.unit_amount || 0) * (item.quantity || 1); // minor units
  const recurring = price.recurring || {};
  const interval = recurring.interval || 'month';
  const count = recurring.interval_count || 1;
  // Normalise to per-month so yearly plans contribute their fair monthly share.
  let perMonth;
  if (interval === 'year') perMonth = unit / (12 * count);
  else if (interval === 'week') perMonth = (unit * 52) / (12 * count);
  else if (interval === 'day') perMonth = (unit * 365) / (12 * count);
  else perMonth = unit / count; // month
  return { perMonth, currency: price.currency || 'gbp' };
}

async function getStripeMetrics() {
  const stripe = new Stripe(await getParam('/traxent/stripe/secret_key'));

  // Map known price IDs → friendly plan names (missing params are simply skipped).
  const priceToPlan = {};
  const planParams = [
    ['observer', '/traxent/stripe/price_observer'],
    ['challenger', '/traxent/stripe/price_challenger'],
    ['funded_ready', '/traxent/stripe/price_funded_ready'],
  ];
  await Promise.all(planParams.map(async ([plan, param]) => {
    try { priceToPlan[(await getParam(param)).trim()] = plan; } catch { /* param not set */ }
  }));

  let activeSubscriptions = 0;
  let mrrMinor = 0;            // summed monthly revenue in minor units
  let currency = null;
  const planCounts = { observer: 0, challenger: 0, funded_ready: 0, other: 0 };

  // Page through every active subscription. expand price data so we can read
  // unit_amount + recurring interval without a second round-trip per item.
  let startingAfter;
  // Bound the loop so a runaway never burns the whole timeout.
  for (let page = 0; page < 100; page++) {
    const res = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.items.data.price'],
    });
    for (const sub of res.data) {
      activeSubscriptions += 1;
      // A subscription's plan = the plan of its first recognised priced item.
      let subPlan = 'other';
      for (const item of (sub.items?.data || [])) {
        const { perMonth, currency: cur } = monthlyAmountFromItem(item);
        mrrMinor += perMonth;
        if (cur && !currency) currency = cur;
        const mapped = priceToPlan[item.price?.id];
        if (mapped && subPlan === 'other') subPlan = mapped;
      }
      planCounts[subPlan] = (planCounts[subPlan] || 0) + 1;
    }
    if (!res.has_more) break;
    startingAfter = res.data[res.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return {
    activeSubscriptions,
    mrr: Math.round(mrrMinor) / 100, // major units, 2dp
    currency: (currency || 'gbp').toUpperCase(),
    planBreakdown: planCounts,
  };
}

// ── 3. Usage from DynamoDB (paginated Scan; counts only) ─────────────────────
// Fine at current scale. We only ever read keys + a tiny projection, and emit
// aggregate counts — never any user's data.
async function getUsageMetrics() {
  const distinctUsers = new Set();
  let simTrades = 0;
  let lessonCompletions = 0;   // sum of truthy entries across every PROGRESS doc
  let firmSelections = 0;      // sum of selected-firm list lengths
  let usersWithFirms = 0;
  let usersWithTrades = new Set();

  let lastKey;
  // Hard page cap keeps a huge table from blowing the 10s timeout; raise later
  // (or move to an aggregating stream) if the table grows past this.
  for (let page = 0; page < 200; page++) {
    const out = await ddb.send(new ScanCommand({
      TableName: TABLE,
      // Only the bits we count — keeps payloads tiny and avoids reading trade detail.
      ProjectionExpression: 'userId, sk, #d',
      ExpressionAttributeNames: { '#d': 'data' },
      ExclusiveStartKey: lastKey,
    }));
    for (const it of (out.Items || [])) {
      if (it.userId) distinctUsers.add(it.userId);
      const sk = it.sk || '';
      if (sk === 'PROGRESS') {
        const d = it.data && typeof it.data === 'object' ? it.data : {};
        for (const k of Object.keys(d)) if (d[k]) lessonCompletions += 1;
      } else if (sk === 'FIRMS') {
        if (Array.isArray(it.data) && it.data.length) {
          firmSelections += it.data.length;
          usersWithFirms += 1;
        }
      } else if (sk.startsWith('TRADE#')) {
        simTrades += 1;
        if (it.userId) usersWithTrades.add(it.userId);
      }
    }
    lastKey = out.LastEvaluatedKey;
    if (!lastKey) break;
  }

  return {
    usersWithData: distinctUsers.size,
    simTrades,
    lessonCompletions,
    firmSelections,
    usersWithFirms,
    usersWithTrades: usersWithTrades.size,
  };
}

export const handler = async (event) => {
  if (httpMethod(event) === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (httpMethod(event) !== 'GET') return json(405, { error: 'method_not_allowed' });

  // 1 ── Authenticate.
  let sub;
  try {
    const h = event.headers || {};
    const token = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'unauthorized' });
    const payload = await verifier.verify(token);
    sub = payload.sub;
    if (!sub) return json(401, { error: 'unauthorized' });
  } catch (e) {
    console.error('admin-metrics JWT verify failed:', e.message);
    return json(401, { error: 'unauthorized' });
  }

  // 2 ── Authorize. Empty allow-list ⇒ deny everyone (safe default).
  if (ADMIN_SUBS.size === 0 || !ADMIN_SUBS.has(sub)) {
    console.warn('admin-metrics: denied non-admin sub', sub, '(allow-list size', ADMIN_SUBS.size + ')');
    return json(403, { error: 'forbidden', message: 'Not authorised.' });
  }

  // 3 ── Gather every source independently so one failure can't sink the rest.
  const errors = [];
  const result = {
    signups: null,
    subscriptions: null,
    usage: null,
    generatedAt: new Date().toISOString(),
  };

  const [signups, stripe, usage] = await Promise.allSettled([
    getSignupCount(),
    getStripeMetrics(),
    getUsageMetrics(),
  ]);

  if (signups.status === 'fulfilled') result.signups = signups.value;
  else { console.error('signups failed:', signups.reason); errors.push({ source: 'signups', message: String(signups.reason?.message || signups.reason) }); }

  if (stripe.status === 'fulfilled') result.subscriptions = stripe.value;
  else { console.error('stripe failed:', stripe.reason); errors.push({ source: 'subscriptions', message: String(stripe.reason?.message || stripe.reason) }); }

  if (usage.status === 'fulfilled') result.usage = usage.value;
  else { console.error('usage failed:', usage.reason); errors.push({ source: 'usage', message: String(usage.reason?.message || usage.reason) }); }

  if (errors.length) result.errors = errors;
  return json(200, result);
};
