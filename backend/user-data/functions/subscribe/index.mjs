// ── Traxent subscribe Lambda ────────────────────────────────────────────────
// POST /subscribe — PUBLIC endpoint. Replaces Formspree form mlgogjdq.
//
// This is now the system of record for the waitlist/marketing list. DynamoDB
// owns the subscriber; Resend is a mirror we push to. If Resend is down the
// signup is still captured and `resend-backfill.mjs` picks it up later — the
// opposite of the old behaviour, where a Formspree failure silently lost people.
//
// What it records (the consent evidence the old forms never captured):
//   email, status, createdAt/updatedAt
//   source page, landing path, referrer, UTM parameters
//   consentAt, consentIp, consentUserAgent, consentText + consentVersion
//
// Abuse controls on a public write endpoint:
//   · honeypot field — bots fill hidden inputs, humans don't
//   · strict server-side address validation (see email.mjs)
//   · per-IP throttle, 10 signups per rolling hour, enforced in DynamoDB
//   · API-wide stage throttling (100 rps / 200 burst) from the HttpApi config
//
// Privacy: responses are deliberately identical whether or not the address is
// already on the list, so the endpoint can't be used to enumerate subscribers.
//
// Env vars:
//   SUBSCRIBERS_TABLE     DynamoDB table (TraxentSubscribers)
//   ALLOWED_ORIGIN        CORS origin (default https://traxent.io)
//   RESEND_KEY_PARAM      SSM path for the Resend API key
//   RESEND_SEGMENT_NAME   Resend segment to mirror contacts into

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { classifyEmail } from './email.mjs';

const TABLE = process.env.SUBSCRIBERS_TABLE;
const RESEND_KEY_PARAM = process.env.RESEND_KEY_PARAM || '/traxent/resend/api_key';
const SEGMENT_NAME = process.env.RESEND_SEGMENT_NAME || 'Traxent waitlist';

// The exact wording shown beneath each signup form, recorded against every
// record so you can prove precisely what a person agreed to and when. The text
// lives here, server-side, rather than being sent by the client — otherwise
// anyone could POST whatever "consent" string they liked.
//
// Bump CONSENT_VERSION and update the map whenever the on-page copy changes.
// Existing rows keep the older version, which is the point.
const CONSENT_VERSION = '2026-08-06';
const CONSENT_TEXTS = {
  'waitlist-page': 'Free to join. No spam. Unsubscribe anytime.',
  'waitlist-hero': 'Free to join. No spam. Unsubscribe anytime.',
  'home-launch-banner': 'Free · no card · unsubscribe anytime · learn more · price-lock terms',
  'open-page': 'Free to join. No card. Unsubscribe anytime.',
};
const DEFAULT_CONSENT_TEXT = 'Free to join. No spam. Unsubscribe anytime.';
const consentTextFor = (source) => CONSENT_TEXTS[source] ?? DEFAULT_CONSENT_TEXT;

const RATE_LIMIT = 10;              // signups
const RATE_WINDOW_SECONDS = 3600;   // per rolling hour, per IP

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

// ── Resend mirror ───────────────────────────────────────────────────────────
let _key = null;
async function resendKey() {
  if (_key) return _key;
  const r = await ssm.send(new GetParameterCommand({ Name: RESEND_KEY_PARAM, WithDecryption: true }));
  _key = r.Parameter?.Value || null;
  return _key;
}

// Resend renamed Audiences → Segments. Probe once per container and cache.
let _collection = null;
async function collectionName(key) {
  if (_collection) return _collection;
  const r = await fetch('https://api.resend.com/segments', { headers: { Authorization: `Bearer ${key}` } });
  _collection = r.status === 404 ? 'audiences' : 'segments';
  return _collection;
}

let _segmentId = null;
async function segmentId(key) {
  if (_segmentId) return _segmentId;
  const c = await collectionName(key);
  const list = await fetch(`https://api.resend.com/${c}`, { headers: { Authorization: `Bearer ${key}` } });
  if (list.ok) {
    const body = await list.json();
    const found = (body?.data ?? []).find((s) => s.name === SEGMENT_NAME);
    if (found) return (_segmentId = found.id);
  }
  const created = await fetch(`https://api.resend.com/${c}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SEGMENT_NAME }),
  });
  if (!created.ok) throw new Error(`Resend segment create ${created.status}: ${await created.text()}`);
  const body = await created.json();
  return (_segmentId = body.id);
}

/** Push the contact to Resend. Never throws — failure is recorded, not fatal. */
async function mirrorToResend(record) {
  try {
    const key = await resendKey();
    if (!key) return { synced: false, error: 'no api key in SSM' };
    const c = await collectionName(key);
    const sid = await segmentId(key);
    const res = await fetch(`https://api.resend.com/${c}/${sid}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: record.email,
        unsubscribed: false,
        properties: {
          signup_source: record.source || 'unknown',
          signup_date: record.createdAt,
          consent_basis: `waitlist signup (${CONSENT_VERSION})`,
          utm_campaign: record.utmCampaign || '',
        },
      }),
    });
    if (!res.ok) return { synced: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = await res.json();
    return { synced: true, contactId: body?.id ?? null };
  } catch (e) {
    return { synced: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

// ── Per-IP throttle ─────────────────────────────────────────────────────────
// One counter item per IP with a TTL, incremented atomically. Fails OPEN: if
// the counter write errors we let the signup through rather than losing it.
async function overRateLimit(ip) {
  if (!ip) return false;
  const now = Math.floor(Date.now() / 1000);
  try {
    // Deliberately no `status` or `createdAt` attribute: the StatusIndex GSI is
    // keyed on both, so these counter rows are never projected into it and can
    // never be mistaken for subscribers by an export or a broadcast.
    const r = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { email: `RATE#${ip}` },
      UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':exp': now + RATE_WINDOW_SECONDS },
      ReturnValues: 'ALL_NEW',
    }));
    const item = r.Attributes ?? {};
    // The TTL sweeper is lazy (up to 48h late), so treat an expired window as reset.
    if (Number(item.expiresAt) <= now) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { email: `RATE#${ip}` },
        UpdateExpression: 'SET #c = :one, expiresAt = :exp',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': now + RATE_WINDOW_SECONDS },
      }));
      return false;
    }
    return Number(item.count) > RATE_LIMIT;
  } catch {
    return false;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    body = JSON.parse(raw || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  // Honeypot. A real browser leaves this hidden field empty; bots fill it.
  // Return the normal success shape so the bot learns nothing.
  if (String(body.website ?? '').trim() !== '') {
    return json(200, { ok: true, status: 'subscribed' });
  }

  const check = classifyEmail(body.email);
  if (!check.ok) {
    // "role address" and "disposable domain" are real people we're declining —
    // tell them plainly rather than claiming their address is malformed.
    const message = check.reason === 'role address'
      ? 'Please use a personal address rather than a shared inbox like info@ or support@.'
      : check.reason === 'disposable domain'
        ? 'That looks like a temporary inbox. Please use an address you\'ll still have at launch.'
        : 'Please enter a valid email address.';
    return json(400, { error: 'invalid_email', reason: check.reason, message });
  }
  const email = check.email;

  const ip = event?.requestContext?.http?.sourceIp ?? '';
  if (await overRateLimit(ip)) {
    return json(429, { error: 'rate_limited', message: 'Too many signups from this connection. Please try again later.' });
  }

  const now = new Date().toISOString();
  const str = (v, max = 500) => (v == null ? undefined : String(v).slice(0, max) || undefined);

  const record = {
    email,
    status: 'subscribed',
    createdAt: now,
    updatedAt: now,
    source: str(body.source, 60) ?? 'unknown',
    landingPath: str(body.landing_path, 300),
    referrer: str(body.referrer, 500),
    utmSource: str(body.utm_source, 120),
    utmMedium: str(body.utm_medium, 120),
    utmCampaign: str(body.utm_campaign, 120),
    utmContent: str(body.utm_content, 120),
    consentAt: now,
    consentIp: ip || undefined,
    consentUserAgent: str(event?.headers?.['user-agent'], 400),
    consentText: consentTextFor(str(body.source, 60) ?? 'unknown'),
    consentVersion: CONSENT_VERSION,
    resendSynced: false,
  };

  // Is this address already known?
  let existing = null;
  try {
    const got = await ddb.send(new GetCommand({ TableName: TABLE, Key: { email } }));
    existing = got.Item ?? null;
  } catch (e) {
    console.error('subscribe: get failed', e);
    return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }

  if (existing) {
    // A complaint or hard bounce is terminal — never resurrect these, it is the
    // fastest way to wreck a sending domain. Record the attempt and move on.
    if (existing.status === 'complained' || existing.status === 'bounced') {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { email },
        UpdateExpression: 'SET updatedAt = :n, resignupAttempts = if_not_exists(resignupAttempts, :z) + :one, lastResignupAt = :n',
        ExpressionAttributeValues: { ':n': now, ':z': 0, ':one': 1 },
      })).catch((e) => console.error('subscribe: suppressed-update failed', e));
      return json(200, { ok: true, status: 'subscribed' });
    }

    // Already subscribed, or previously unsubscribed and now signing up again —
    // a fresh, deliberate act of consent. Refresh the consent evidence.
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { email },
        UpdateExpression: [
          'SET #s = :sub, updatedAt = :n, consentAt = :n, consentIp = :ip,',
          'consentText = :ct, consentVersion = :cv, #src = :src,',
          'signupCount = if_not_exists(signupCount, :z) + :one',
          existing.status === 'unsubscribed' ? ', resubscribedAt = :n' : '',
        ].join(' '),
        ExpressionAttributeNames: { '#s': 'status', '#src': 'source' },
        ExpressionAttributeValues: {
          ':sub': 'subscribed', ':n': now, ':ip': ip || 'unknown',
          ':ct': consentTextFor(record.source), ':cv': CONSENT_VERSION,
          ':src': record.source, ':z': 0, ':one': 1,
        },
      }));
      if (existing.status === 'unsubscribed') await mirrorToResend(record);
    } catch (e) {
      console.error('subscribe: update failed', e);
    }
    return json(200, { ok: true, status: 'subscribed' });
  }

  // New subscriber. Write to DynamoDB FIRST — that is the record that matters.
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: record,
      ConditionExpression: 'attribute_not_exists(email)',
    }));
  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return json(200, { ok: true, status: 'subscribed' });   // raced with itself
    }
    console.error('subscribe: put failed', e);
    return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }

  // Then mirror to Resend. A failure here is recorded, not surfaced — the
  // person is on the list either way, and resend-backfill.mjs will catch up.
  const mirror = await mirrorToResend(record);
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { email },
      UpdateExpression: 'SET resendSynced = :s, resendSyncedAt = :n, resendContactId = :cid, resendSyncError = :err',
      ExpressionAttributeValues: {
        ':s': mirror.synced,
        ':n': now,
        ':cid': mirror.contactId ?? null,
        ':err': mirror.error ?? null,
      },
    }));
  } catch (e) {
    console.error('subscribe: sync-status update failed', e);
  }
  if (!mirror.synced) console.error('subscribe: resend mirror failed', email, mirror.error);

  return json(200, { ok: true, status: 'subscribed' });
};
