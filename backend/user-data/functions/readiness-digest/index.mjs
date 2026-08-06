// ── Weekly readiness digest ─────────────────────────────────────────────────
// Scheduled Lambda. The Challenger-tier feature the pricing page has been
// promising: a weekly summary of how the member actually traded, and what in it
// would fail a prop firm challenge.
//
// Runs Monday 07:00 UTC — a trading week is Mon–Fri, so Monday morning is when
// last week is complete and this week can still be influenced.
//
// Three rules it will not break:
//
//   1. Only members who are `subscribed` in TraxentSubscribers get one. This is
//      a recurring email; an unsubscribe has to stop it, or the unsubscribe is
//      a lie. Complained and bounced addresses are never touched.
//   2. Nobody gets two. A per-user send marker keyed to the ISO week makes a
//      retry or a double-trigger idempotent.
//   3. One person's failure never stops the run. Every send is isolated;
//      failures are counted and reported, not thrown.
//
// Env: USER_DATA_TABLE, SUBSCRIBERS_TABLE, RESEND_KEY_PARAM, EMAIL_FROM,
//      POSTAL_ADDRESS, DIGEST_LIMIT

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { summarise, headline, subjectFor, renderDigest, renderDigestText } from './digest.mjs';

const USER_TABLE = process.env.USER_DATA_TABLE;
const SUBS_TABLE = process.env.SUBSCRIBERS_TABLE;
const KEY_PARAM = process.env.RESEND_KEY_PARAM || '/traxent/resend/api_key';
const FROM = process.env.EMAIL_FROM || 'Traxent <hello@traxent.io>';
const POSTAL = process.env.POSTAL_ADDRESS || '';
const LIMIT = Number(process.env.DIGEST_LIMIT || 2000);

// Only tiers that were sold this feature.
const ELIGIBLE_PLANS = new Set(['challenger', 'funded_ready']);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ISO week stamp, e.g. 2026-W33 — the idempotency key. */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - start) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}

export const handler = async (event = {}) => {
  const week = isoWeek();
  const dryRun = event.dryRun === true;
  const only = event.onlyEmail ? String(event.onlyEmail).toLowerCase() : null;
  const report = { week, considered: 0, sent: 0, skippedNotSubscribed: 0, skippedAlreadySent: 0, skippedPlan: 0, failed: [] };

  const key = (await ssm.send(new GetParameterCommand({ Name: KEY_PARAM, WithDecryption: true }))).Parameter?.Value;
  if (!key) throw new Error(`No Resend key at ${KEY_PARAM}`);

  // Members with a PROFILE row — that's where the plan mirror lives.
  const profiles = [];
  let start;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: USER_TABLE,
      FilterExpression: 'sk = :p',
      ExpressionAttributeValues: { ':p': 'PROFILE' },
      ExclusiveStartKey: start,
    }));
    profiles.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start && profiles.length < LIMIT);

  for (const profile of profiles.slice(0, LIMIT)) {
    const email = String(profile.email ?? '').trim().toLowerCase();
    if (!email) continue;
    if (only && email !== only) continue;
    report.considered++;

    try {
      if (!ELIGIBLE_PLANS.has(String(profile.plan ?? '').toLowerCase())) {
        report.skippedPlan++;
        continue;
      }

      // Rule 1 — the marketing list is the authority on whether we may write.
      const sub = (await ddb.send(new GetCommand({ TableName: SUBS_TABLE, Key: { email } }))).Item;
      if (!sub || sub.status !== 'subscribed') { report.skippedNotSubscribed++; continue; }

      // Rule 2 — once per person per week, whatever triggers us.
      if (sub.lastDigestWeek === week) { report.skippedAlreadySent++; continue; }

      const rows = (await ddb.send(new QueryCommand({
        TableName: USER_TABLE,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': profile.userId },
      }))).Items ?? [];

      const summary = summarise(rows);
      const head = headline(summary);

      // The account page is the opt-out for everything on the marketing list,
      // so it's also the opt-out for this.
      const unsubHref = 'https://traxent.io/account';
      const html = renderDigest({ summary, head, unsubHref, postalAddress: POSTAL });
      const text = renderDigestText({ summary, head, unsubHref });

      if (dryRun) {
        console.log('would send:', email, '|', subjectFor(summary, head));
        report.sent++;
        continue;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [email], subject: subjectFor(summary, head), html, text }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 160)}`);

      // Mark only after a confirmed send — a crash here means one duplicate
      // next run, which is far better than one person silently never getting it.
      await ddb.send(new UpdateCommand({
        TableName: SUBS_TABLE, Key: { email },
        UpdateExpression: 'SET lastDigestWeek = :w, lastDigestAt = :n',
        ExpressionAttributeValues: { ':w': week, ':n': new Date().toISOString() },
      }));

      report.sent++;
      await sleep(550);   // Resend's default limit is 2/second

    } catch (e) {
      // Rule 3 — one bad record must not end the run.
      report.failed.push(`${email}: ${String(e.message).slice(0, 120)}`);
    }
  }

  console.log('readiness-digest:', JSON.stringify(report));
  return { statusCode: 200, body: JSON.stringify(report) };
};
