// ── Traxent Resend webhook receiver ─────────────────────────────────────────
// POST /webhooks/resend — public route, authenticated by Svix signature only.
//
// Keeps DynamoDB honest. Without this, someone could unsubscribe via the link
// in an email and our own database would still show them as subscribed — which
// is exactly the sort of gap that turns into a GDPR complaint.
//
// Events handled:
//   contact.updated       → unsubscribed flag flipped either way
//   contact.deleted       → contact removed in Resend
//   email.bounced         → hard bounce, permanently undeliverable
//   email.complained      → marked as spam. Terminal: never email again
//   suppression.added     → Resend suppressed the address
//   suppression.removed   → suppression lifted
// Everything else (delivered, opened, clicked, …) is acknowledged and ignored.
//
// Always returns 2xx for events we understand, so Resend doesn't retry
// endlessly. Returns 401 only when the signature genuinely fails.
//
// Env vars:
//   SUBSCRIBERS_TABLE          DynamoDB table (TraxentSubscribers)
//   RESEND_WEBHOOK_SECRET_PARAM  SSM path for the Svix signing secret

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { verifySvix } from './svix.mjs';

const TABLE = process.env.SUBSCRIBERS_TABLE;
const SECRET_PARAM = process.env.RESEND_WEBHOOK_SECRET_PARAM || '/traxent/resend/webhook_secret';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

let _secret = null;
async function signingSecret() {
  if (_secret) return _secret;
  const r = await ssm.send(new GetParameterCommand({ Name: SECRET_PARAM, WithDecryption: true }));
  _secret = r.Parameter?.Value || null;
  return _secret;
}

/** Pull the subscriber address out of whichever shape the event uses. */
function extractEmail(data) {
  if (!data) return null;
  const candidate =
    data.email ??
    (Array.isArray(data.to) ? data.to[0] : data.to) ??
    data.recipient ??
    null;
  const e = String(candidate ?? '').trim().toLowerCase();
  return e && e.includes('@') ? e : null;
}

/**
 * Apply a status change, but never overwrite a terminal state.
 * A complaint is the strongest signal there is — once someone has marked us as
 * spam, no later "delivered" or re-subscribe event may undo it.
 */
async function applyStatus(email, status, extra = {}) {
  const now = new Date().toISOString();
  const sets = ['#s = :s', 'updatedAt = :n'];
  const names = { '#s': 'status' };
  const values = { ':s': status, ':n': now, ':complained': 'complained' };

  let i = 0;
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) continue;
    const nk = `#e${i}`, vk = `:e${i}`;
    names[nk] = k;
    values[vk] = v === '@now' ? now : v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { email },
      UpdateExpression: `SET ${sets.join(', ')}`,
      // Only touch rows that already exist (never create a subscriber from a
      // webhook), and never downgrade away from `complained`.
      ConditionExpression: 'attribute_exists(email) AND #s <> :complained',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
    return 'updated';
  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') return 'skipped';
    throw e;
  }
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? 'POST';
  if (method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  // The signature is over the exact bytes received — decode base64 transport
  // encoding, but do not parse-and-restringify before verifying.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');

  // API Gateway lower-cases header names for HTTP APIs, but normalise anyway.
  const headers = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = v;

  let secret;
  try {
    secret = await signingSecret();
  } catch (e) {
    console.error('resend-webhook: cannot read signing secret', e);
    return reply(500, { error: 'server_error' });
  }

  const check = verifySvix(rawBody, headers, secret);
  if (!check.ok) {
    console.warn('resend-webhook: rejected —', check.reason);
    return reply(401, { error: 'invalid_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  const type = payload?.type ?? payload?.event_type ?? '';
  const data = payload?.data ?? {};
  const email = extractEmail(data);

  if (!email) {
    console.log('resend-webhook: no email in', type);
    return reply(200, { ok: true, ignored: true });
  }

  try {
    switch (type) {
      case 'contact.updated': {
        const unsubscribed = data.unsubscribed === true;
        const r = await applyStatus(email, unsubscribed ? 'unsubscribed' : 'subscribed',
          unsubscribed ? { unsubscribedAt: '@now', unsubscribeSource: 'resend' } : { resubscribedAt: '@now' });
        return reply(200, { ok: true, email, applied: unsubscribed ? 'unsubscribed' : 'subscribed', result: r });
      }

      case 'contact.deleted': {
        const r = await applyStatus(email, 'unsubscribed', {
          unsubscribedAt: '@now', unsubscribeSource: 'resend-contact-deleted',
        });
        return reply(200, { ok: true, email, applied: 'unsubscribed', result: r });
      }

      case 'email.bounced': {
        const r = await applyStatus(email, 'bounced', {
          bouncedAt: '@now',
          bounceType: data?.bounce?.type ?? data?.bounce_type ?? 'unknown',
          bounceReason: String(data?.bounce?.message ?? data?.reason ?? '').slice(0, 300) || undefined,
        });
        return reply(200, { ok: true, email, applied: 'bounced', result: r });
      }

      case 'email.complained': {
        // Terminal. applyStatus's guard means nothing can move it back.
        const r = await applyStatus(email, 'complained', { complainedAt: '@now' });
        return reply(200, { ok: true, email, applied: 'complained', result: r });
      }

      case 'suppression.added': {
        const r = await applyStatus(email, 'unsubscribed', {
          suppressedAt: '@now',
          suppressionReason: String(data?.reason ?? '').slice(0, 200) || undefined,
          unsubscribeSource: 'resend-suppression',
        });
        return reply(200, { ok: true, email, applied: 'unsubscribed', result: r });
      }

      case 'suppression.removed': {
        // Lifting a suppression is an admin action in Resend, not consent.
        // Record it, but do NOT auto-resubscribe — they have to opt in again.
        const r = await applyStatus(email, 'unsubscribed', { suppressionRemovedAt: '@now' });
        return reply(200, { ok: true, email, applied: 'noted', result: r });
      }

      default:
        return reply(200, { ok: true, ignored: true, type });
    }
  } catch (e) {
    console.error('resend-webhook: failed to apply', type, email, e);
    // 500 makes Resend retry, which is what we want for a transient DynamoDB error.
    return reply(500, { error: 'server_error' });
  }
};
