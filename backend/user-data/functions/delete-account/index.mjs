// ── Traxent delete-account Lambda ───────────────────────────────────────────
// DELETE /user/account — full account deletion per App Review 5.1.1(v).
// Called by the web account page and the iOS app.
//
// Order matters: revoke billing first, then data, then identity — if a later
// step fails the user can retry; an earlier-deleted identity can't retry.
//   1. Cancel any active Stripe subscription IMMEDIATELY (not at period end).
//   2. Delete every DynamoDB item for the user (progress, trades, firms).
//   3. Delete the Auth0 user via the Management API.
//   4. Erase them from the marketing list and Resend (UK GDPR Art. 17 —
//      erasure has to reach every system, not just the one they were looking at).
//
// NOTE: App Store subscriptions CANNOT be cancelled server-side (Apple rule);
// the iOS app warns the user to cancel in Settings before deleting.
//
// Env vars: TABLE_NAME, AUTH0_ISSUER, AUTH0_AUDIENCE (comma-separated —
// SPA + iOS Native client IDs), ALLOWED_ORIGIN. SSM params:
//   /traxent/stripe/secret_key
//   /traxent/auth0/m2m_client_id      ) the SAME m2m app the Stripe webhook,
//   /traxent/auth0/m2m_client_secret  ) account-update and admin-metrics use.
//
// This function used to read mgmt_client_id / mgmt_client_secret — names no
// other function used and which were never created in SSM. getParam threw, and
// every deletion returned a 500. Account deletion is an App Store 5.1.1
// requirement, so this would have failed review.
//
// SCHEMA NOTE: adapted to the deployed TraxentUserData table, whose primary key
// is (userId HASH, sk RANGE). (The original draft assumed a pk="USER#sub" design.)

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { deleteSubscriber } from './marketing.mjs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { JwtRsaVerifier } from 'aws-jwt-verify';
import Stripe from 'stripe';

const TABLE = process.env.TABLE_NAME;
const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE || 'TraxentSubscribers';
const RESEND_KEY_PARAM = process.env.RESEND_KEY_PARAM || '/traxent/resend/api_key';

/**
 * UK GDPR Art. 17 erasure has to reach every system holding the person, not
 * just the one they were looking at. Deleting the Auth0 user and their
 * progress but leaving them on the mailing list means they keep receiving
 * marketing from a company that told them it had deleted them — which is the
 * complaint, not the bug.
 *
 * Best-effort and last: the account deletion itself must not fail because
 * Resend was briefly unavailable. Failures are logged loudly so they can be
 * cleaned up by hand.
 */
async function eraseFromMarketing(email) {
  if (!email) return;
  try {
    await deleteSubscriber(ddb, SUBSCRIBERS_TABLE, email);
    console.log('erasure: removed subscriber row for', email);
  } catch (e) {
    console.error('ERASURE INCOMPLETE — subscriber row remains for', email, e.message);
  }
  try {
    const key = await getParam(RESEND_KEY_PARAM);
    if (!key) { console.warn('erasure: no Resend key, contact not deleted for', email); return; }
    const res = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email.toLowerCase())}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${key}` },
    });
    // 404 means they were never mirrored across — that's a clean result.
    if (res.ok || res.status === 404) console.log('erasure: Resend contact cleared for', email);
    else console.error('ERASURE INCOMPLETE — Resend', res.status, 'for', email);
  } catch (e) {
    console.error('ERASURE INCOMPLETE — Resend contact remains for', email, e.message);
  }
}
const ISSUER = process.env.AUTH0_ISSUER || 'https://auth.traxent.io/';
const AUDIENCES = (process.env.AUTH0_AUDIENCE || '').split(',').map(s => s.trim()).filter(Boolean);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

const verifier = JwtRsaVerifier.create({
  issuer: ISSUER,
  audience: AUDIENCES,           // accepts an array — covers SPA + iOS clients
  jwksUri: ISSUER + '.well-known/jwks.json',
});

const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
  'Content-Type': 'application/json',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

async function getParam(name) {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter.Value;
}

/**
 * A failure we can name.
 *
 * The handler used to catch everything and return a bare `deletion_failed`,
 * which is how account deletion sat broken across two rounds of fixing: the
 * response, the browser console and the CloudWatch line all said the same
 * uninformative thing, so there was nothing to act on. `step` is safe to send
 * to the client — it names a stage of our own pipeline, not an internal
 * message, credential or user identifier.
 */
class StepError extends Error {
  constructor(step, message) { super(message); this.step = step; }
}

// 1 ── Stripe: cancel everything attached to this Auth0 sub, effective now.
//
// Two failure modes, deliberately treated differently:
//
//   · No key, or no customer found — proceed. Most users never paid, and a
//     free user must not be trapped in an undeletable account because a
//     billing parameter is missing. App Store 5.1.1(v) is not optional.
//   · A customer WAS found and cancelling failed — stop. Deleting the identity
//     of someone with a live subscription leaves them being charged for an
//     account that no longer exists, and with no way to sign in and cancel.
//     That is worse than a failed deletion they can retry.
async function cancelStripe(sub, email) {
  let stripe;
  try {
    stripe = new Stripe(await getParam(process.env.STRIPE_KEY_PARAM || '/traxent/stripe/secret_key'));
  } catch (e) {
    console.warn('Stripe key not configured — skipping billing cancellation:', e.message);
    return;
  }
  // Customers are findable by the auth0_sub metadata set at checkout; fall
  // back to email search for legacy customers.
  const queries = [`metadata['auth0_sub']:'${sub}'`, `metadata['auth0_user_id']:'${sub}'`];
  // Defence-in-depth: only use the email in the search query if it can't break out of it.
  const safeEmail = typeof email === 'string' && !/['"\\\n\r]/.test(email) ? email : null;
  if (safeEmail) queries.push(`email:'${safeEmail}'`);
  const seen = new Set();
  for (const query of queries) {
    let customers;
    try {
      customers = await stripe.customers.search({ query });
    } catch (e) {
      // A restricted key without customer-read, or search not enabled on the
      // account. We cannot prove the user has no subscription, but we also
      // cannot prove they have one — and blocking every deletion on a lookup
      // permission is the wrong trade. Log loudly and carry on.
      console.error('BILLING CHECK FAILED — could not search Stripe customers:', e.message);
      continue;
    }
    for (const customer of customers.data) {
      if (seen.has(customer.id)) continue;
      seen.add(customer.id);
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active' });
      for (const s of subs.data) {
        try {
          await stripe.subscriptions.cancel(s.id, {
            cancellation_details: { comment: 'Account deleted by user' },
          });
        } catch (e) {
          // Found a live subscription and could not stop it. Refuse to go
          // further — see the note above cancelStripe.
          throw new StepError('billing', `could not cancel subscription ${s.id}: ${e.message}`);
        }
        console.log('Cancelled Stripe subscription', s.id);
      }
    }
  }
}

// 2 ── DynamoDB: remove every item under the user's partition key.
async function purgeUserData(sub) {
  let lastKey;
  do {
    const page = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': sub },
      ProjectionExpression: 'userId, sk',
      ExclusiveStartKey: lastKey,
    }));
    const items = page.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE]: items.slice(i, i + 25).map(Key => ({ DeleteRequest: { Key } })),
        },
      }));
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
}

// 3 ── Auth0: delete the identity via the Management API.
// Auth0 answers failures with a JSON body that names the actual problem
// ("Grant type not allowed", "Insufficient scope"). Throwing on the status
// code alone discards exactly the sentence that would have explained it.
async function auth0Error(res) {
  let detail = '';
  try {
    const body = await res.text();
    detail = body ? ' — ' + body.slice(0, 300) : '';
  } catch { /* body already consumed or unreadable */ }
  return detail;
}

async function deleteAuth0User(sub) {
  // Management API calls must target the CANONICAL tenant domain, not the custom
  // domain. auth.traxent.io (the ISSUER) validates USER tokens fine but CANNOT
  // mint Management API tokens — the same gotcha the account-linking Action hit.
  // stripe-webhook and account-update both read /traxent/auth0/domain (the
  // canonical dev-…us.auth0.com) and work; this function used to derive the
  // domain from ISSUER (the custom domain), which is why deletion 500'd at
  // auth0_token/auth0_delete while everything else on the same app + scope
  // succeeded. Read the canonical domain from SSM like its siblings.
  let domain;
  try {
    domain = await getParam('/traxent/auth0/domain');
  } catch (e) {
    // Fallback keeps old behaviour rather than making things worse.
    console.warn('auth0/domain SSM read failed, falling back to ISSUER host:', e.message);
    domain = new URL(ISSUER).hostname;
  }
  // Be robust to a mis-set param: strip any scheme and trailing slash so a
  // value like "https://dev-xxx.us.auth0.com/" still yields a bare hostname
  // (otherwise the URL becomes https://https://.../oauth/token and 500s).
  domain = String(domain).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

  let clientId, clientSecret;
  try {
    [clientId, clientSecret] = await Promise.all([
      getParam('/traxent/auth0/m2m_client_id'),
      getParam('/traxent/auth0/m2m_client_secret'),
    ]);
  } catch (e) {
    throw new StepError('auth0_credentials', 'could not read m2m credentials from SSM: ' + e.message);
  }

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
  if (!tokenRes.ok) {
    throw new StepError('auth0_token',
      `management token request failed: ${tokenRes.status}${await auth0Error(tokenRes)}`);
  }
  const { access_token } = await tokenRes.json();

  const delRes = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(sub)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } },
  );
  // 404 = already gone, which is the state we wanted.
  if (!delRes.ok && delRes.status !== 404) {
    // The likeliest cause of a 403 here is the m2m application not being
    // granted `delete:users` on the Management API. It is a separate scope
    // from the read:users / update:users the other functions need, so an app
    // that works everywhere else can still fail on exactly this call.
    throw new StepError('auth0_delete',
      `user deletion failed: ${delRes.status}${await auth0Error(delRes)}`);
  }
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return json(204, null);
  if (method !== 'DELETE') return json(405, { error: 'method_not_allowed' });

  let payload;
  try {
    const auth = event.headers?.authorization || event.headers?.Authorization || '';
    payload = await verifier.verify(auth.replace(/^Bearer\s+/i, '').trim());
  } catch {
    return json(401, { error: 'unauthorized' });
  }
  const sub = payload.sub;

  try {
    await cancelStripe(sub, payload.email);
    await purgeUserData(sub).catch((e) => { throw new StepError('data_purge', e.message); });
    await deleteAuth0User(sub);
    // Last, and deliberately outside the failure path above: an erasure that
    // misses the mailing list is the one the person actually notices.
    await eraseFromMarketing(payload.email);
    console.log('Account deleted:', sub);
    return json(204, null);
  } catch (e) {
    const step = e.step || 'unknown';
    // One greppable line carrying the step and the underlying message. What
    // was here before logged the error object alone, which in CloudWatch
    // rendered as a stack trace with no indication of which stage produced it.
    console.error(`DELETE-ACCOUNT FAILED step=${step} sub=${sub}: ${e.message}`, e);
    return json(500, {
      error: 'deletion_failed',
      step,
      message: 'Deletion failed — please retry. Nothing further is charged while this is unresolved.',
    });
  }
};
