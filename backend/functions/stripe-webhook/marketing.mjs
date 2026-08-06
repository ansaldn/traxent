// ── Marketing-list writes ───────────────────────────────────────────────────
// Shared by every Lambda that needs to touch TraxentSubscribers. Deliberately
// DynamoDB-only: the Resend mirror is done by the subscribe endpoint (for new
// signups), the account marketing toggle (where a delayed unsubscribe would be
// a compliance problem), and the reconcile job (for everything else). Keeping
// the Resend API key out of the Stripe and Auth0 Lambdas is both simpler and a
// smaller blast radius.
//
// This file is duplicated into the function directories that need it, matching
// the existing pattern for email.mjs. Keep the copies in step — reconcile.mjs
// asserts they're identical.

import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Lawful basis for emailing someone. Kept separate because the two populations
 * have genuinely different rights and limits:
 *
 *   'consent'      — they joined the waitlist and asked to hear from us.
 *                    Fair game for any marketing they consented to.
 *
 *   'soft-opt-in'  — they bought something. UK PECR reg 22(3) lets us email
 *                    existing customers about SIMILAR products only, provided
 *                    they were offered a refusal at the point of sale and in
 *                    every message. Narrower than consent. Do not send these
 *                    people anything off-topic.
 */
export const BASIS = { CONSENT: 'consent', SOFT_OPT_IN: 'soft-opt-in' };

/** Statuses nothing may automatically move someone out of. */
const TERMINAL = new Set(['complained', 'bounced']);

export const normaliseEmail = (e) => String(e ?? '').trim().toLowerCase();

export async function getSubscriber(ddb, table, email) {
  const r = await ddb.send(new GetCommand({ TableName: table, Key: { email: normaliseEmail(email) } }));
  return r.Item ?? null;
}

/**
 * Add or update a subscriber.
 *
 * Rules that must not be broken:
 *   · never resurrect a complaint or hard bounce
 *   · never silently upgrade an existing 'consent' record to 'soft-opt-in'
 *     (consent is the stronger basis — downgrading it loses rights)
 *   · never re-subscribe someone who has unsubscribed. Buying something is not
 *     a withdrawal of their opt-out.
 *
 * @returns {'created'|'updated'|'skipped'}
 */
export async function upsertSubscriber(ddb, table, {
  email, consentBasis, plan, name, source, consentText, consentVersion, ip,
}) {
  const key = normaliseEmail(email);
  if (!key || !key.includes('@')) return 'skipped';

  const now = new Date().toISOString();
  const existing = await getSubscriber(ddb, table, key);

  if (existing) {
    if (TERMINAL.has(existing.status)) return 'skipped';

    // Someone who opted out stays opted out. Update the metadata we're allowed
    // to hold (plan, name) but leave status and basis alone.
    const stayOut = existing.status === 'unsubscribed';

    const sets = ['updatedAt = :n'];
    const names = {};
    const values = { ':n': now };
    const add = (attr, val, alias) => {
      if (val === undefined || val === null || val === '') return;
      names[`#${alias}`] = attr;
      values[`:${alias}`] = val;
      sets.push(`#${alias} = :${alias}`);
    };
    add('plan', plan, 'p');
    add('name', name, 'nm');

    if (!stayOut && consentBasis === BASIS.SOFT_OPT_IN && existing.consentBasis !== BASIS.CONSENT) {
      names['#cb'] = 'consentBasis'; values[':cb'] = BASIS.SOFT_OPT_IN; sets.push('#cb = :cb');
      names['#sa'] = 'softOptInAt'; values[':sa'] = existing.softOptInAt ?? now; sets.push('#sa = :sa');
      names['#st'] = 'status'; values[':st'] = 'subscribed'; sets.push('#st = :st');
    }

    // Mark that Resend needs to hear about this.
    sets.push('resendSynced = :false');
    values[':false'] = false;

    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { email: key },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(email)',
    }));
    return 'updated';
  }

  await ddb.send(new PutCommand({
    TableName: table,
    Item: {
      email: key,
      status: 'subscribed',
      consentBasis: consentBasis ?? BASIS.CONSENT,
      ...(consentBasis === BASIS.SOFT_OPT_IN ? { softOptInAt: now } : {}),
      createdAt: now,
      updatedAt: now,
      consentAt: now,
      ...(ip ? { consentIp: ip } : {}),
      ...(consentText ? { consentText } : {}),
      ...(consentVersion ? { consentVersion } : {}),
      ...(plan ? { plan } : {}),
      ...(name ? { name } : {}),
      source: source ?? 'unknown',
      resendSynced: false,
    },
    ConditionExpression: 'attribute_not_exists(email)',
  })).catch((e) => {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;   // raced; fine
  });
  return 'created';
}

/**
 * Move a subscriber to a new address after an Auth0 email change.
 *
 * Without this the old row is orphaned: they keep receiving mail at an address
 * their account no longer knows about, and the unsubscribe toggle in the app
 * looks at the new address and so can't switch it off. A broken unsubscribe is
 * a compliance failure, not just a bug — which is why this is here even though
 * it wasn't on the original list.
 *
 * Status carries over. If they had unsubscribed, they stay unsubscribed at the
 * new address; changing your email is not consent to be emailed again.
 */
export async function migrateSubscriberEmail(ddb, table, oldEmail, newEmail) {
  const from = normaliseEmail(oldEmail);
  const to = normaliseEmail(newEmail);
  if (!from || !to || from === to) return 'noop';

  const old = await getSubscriber(ddb, table, from);
  if (!old) return 'nothing-to-move';

  const now = new Date().toISOString();
  const target = await getSubscriber(ddb, table, to);

  if (target) {
    // The new address is already known. Merge conservatively: the stricter of
    // the two statuses wins, so an unsubscribe on either side is preserved.
    const strictest = [old.status, target.status].find((s) => TERMINAL.has(s))
      ?? ([old.status, target.status].includes('unsubscribed') ? 'unsubscribed' : 'subscribed');
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { email: to },
      UpdateExpression: 'SET #s = :s, updatedAt = :n, mergedFrom = :from, resendSynced = :false',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': strictest, ':n': now, ':from': from, ':false': false },
    }));
  } else {
    await ddb.send(new PutCommand({
      TableName: table,
      Item: {
        ...old,
        email: to,
        previousEmail: from,
        emailChangedAt: now,
        updatedAt: now,
        resendSynced: false,
      },
    }));
  }

  // Tombstone rather than a silent delete, so the audit trail survives and the
  // reconcile job knows to remove the stale Resend contact.
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { email: from },
    UpdateExpression: 'SET #s = :s, movedTo = :to, updatedAt = :n, resendSynced = :false',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': 'moved', ':to': to, ':n': now, ':false': false },
  }));

  return target ? 'merged' : 'moved';
}

/**
 * The user flipping their own marketing preference in the account dashboard.
 * This is the "simple means to refuse" that soft opt-in legally requires.
 */
export async function setMarketingPreference(ddb, table, email, subscribed) {
  const key = normaliseEmail(email);
  const now = new Date().toISOString();
  const existing = await getSubscriber(ddb, table, key);

  // A complaint stays terminal even if they later ask to be re-added here.
  if (existing && TERMINAL.has(existing.status)) return { status: existing.status, changed: false };

  if (!existing) {
    if (!subscribed) return { status: 'unsubscribed', changed: false };  // nothing to do
    await ddb.send(new PutCommand({
      TableName: table,
      Item: {
        email: key, status: 'subscribed', consentBasis: BASIS.CONSENT,
        createdAt: now, updatedAt: now, consentAt: now,
        source: 'account-page', consentText: 'Email me about Traxent news and offers',
        resendSynced: false,
      },
    }));
    return { status: 'subscribed', changed: true };
  }

  const next = subscribed ? 'subscribed' : 'unsubscribed';
  if (existing.status === next) return { status: next, changed: false };

  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { email: key },
    UpdateExpression: subscribed
      ? 'SET #s = :s, updatedAt = :n, consentAt = :n, resubscribedAt = :n, resendSynced = :false'
      : 'SET #s = :s, updatedAt = :n, unsubscribedAt = :n, unsubscribeSource = :src, resendSynced = :false',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': next, ':n': now, ':false': false,
      ...(subscribed ? {} : { ':src': 'account-page' }),
    },
  }));
  return { status: next, changed: true };
}

/** Full erasure — used by account deletion. */
export async function deleteSubscriber(ddb, table, email) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { email: normaliseEmail(email) } }));
}
