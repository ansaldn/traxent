// ── Nightly marketing reconciliation ────────────────────────────────────────
// DynamoDB is the source of truth. Resend is a mirror. Live syncing is fast but
// lossy — any single failed API call leaves the two quietly out of step, and
// "quietly" is the problem: you'd only find out when someone who unsubscribed
// received a broadcast. This job is what makes the live path trustworthy.
//
// Each run:
//   1. pushes every row flagged `resendSynced: false` into Resend
//   2. suppresses contacts whose DynamoDB status says they should be
//   3. tidies up contacts left behind by an email change (`status: moved`)
//   4. flags contacts that exist in Resend but not in DynamoDB
//   5. emails a summary via SNS, but only when something needed fixing or
//      failed — a silent inbox means everything agreed
//
// Deliberately conservative. It will suppress a Resend contact that DynamoDB
// says is unsubscribed, but it will NEVER re-subscribe anyone from this job:
// resurrecting an opt-out automatically is the one mistake you cannot take
// back. Those cases are reported for a human to look at instead.
//
// Env vars:
//   SUBSCRIBERS_TABLE, RESEND_KEY_PARAM, RESEND_SEGMENT_NAME, ALERTS_TOPIC_ARN

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const TABLE = process.env.SUBSCRIBERS_TABLE;
const KEY_PARAM = process.env.RESEND_KEY_PARAM || '/traxent/resend/api_key';
const SEGMENT_NAME = process.env.RESEND_SEGMENT_NAME || 'Traxent waitlist';
const TOPIC = process.env.ALERTS_TOPIC_ARN;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});
const sns = new SNSClient({});

const SUPPRESSED = new Set(['unsubscribed', 'bounced', 'complained']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Resend ──────────────────────────────────────────────────────────────────
let API_KEY = null;

async function resend(method, path, body) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function getSegmentId() {
  const list = await resend('GET', '/segments').catch(() => null);
  const found = (list?.data ?? []).find((s) => s.name === SEGMENT_NAME);
  if (found) return found.id;
  const created = await resend('POST', '/segments', { name: SEGMENT_NAME });
  return created.id;
}

async function listSegmentContacts(segmentId) {
  const r = await resend('GET', `/segments/${segmentId}/contacts`);
  return (r?.data ?? []).map((c) => ({
    id: c.id,
    email: (c.email || '').toLowerCase(),
    unsubscribed: !!c.unsubscribed,
    firstName: c.first_name || null,
  }));
}

// ── DynamoDB ────────────────────────────────────────────────────────────────
async function scanSubscribers() {
  const rows = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    rows.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  // Rate-limit counters carry no `status`, so this drops them.
  return rows.filter((r) => r.email && !r.email.startsWith('RATE#') && r.status);
}

const markSynced = (email, ok, error) => ddb.send(new UpdateCommand({
  TableName: TABLE,
  Key: { email },
  UpdateExpression: 'SET resendSynced = :s, resendSyncedAt = :n, resendSyncError = :e',
  ExpressionAttributeValues: { ':s': ok, ':n': new Date().toISOString(), ':e': error ?? null },
}));

// ── Handler ─────────────────────────────────────────────────────────────────
export const handler = async () => {
  const report = { pushed: 0, suppressed: 0, tidied: 0, orphansInResend: [], needsReview: [], failures: [] };

  const param = await ssm.send(new GetParameterCommand({ Name: KEY_PARAM, WithDecryption: true }));
  API_KEY = param.Parameter?.Value;
  if (!API_KEY) throw new Error(`No Resend API key at ${KEY_PARAM}`);

  const segmentId = await getSegmentId();
  const rows = await scanSubscribers();
  const contacts = await listSegmentContacts(segmentId);
  const byEmail = new Map(contacts.map((c) => [c.email, c]));

  for (const row of rows) {
    const email = row.email;
    const contact = byEmail.get(email);

    try {
      // 3. An email change leaves a `moved` tombstone. Delete the stale contact
      //    so the old address stops receiving mail, then drop the tombstone.
      if (row.status === 'moved') {
        if (contact) { await resend('DELETE', `/contacts/${encodeURIComponent(email)}`); await sleep(550); }
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { email } }));
        report.tidied++;
        continue;
      }

      const shouldBeSuppressed = SUPPRESSED.has(row.status);

      // 1. Not in Resend yet.
      if (!contact) {
        if (shouldBeSuppressed) { await markSynced(email, true, null); continue; }  // nothing to create
        await resend('POST', '/contacts', {
          email,
          ...(row.name ? { first_name: String(row.name).split(' ')[0].slice(0, 50) } : {}),
          unsubscribed: false,
          segments: [{ id: segmentId }],
        });
        await markSynced(email, true, null);
        report.pushed++;
        await sleep(550);
        continue;
      }

      // 2. Present but out of step.
      const patch = {};
      if (contact.unsubscribed !== shouldBeSuppressed) {
        if (shouldBeSuppressed) {
          patch.unsubscribed = true;
          report.suppressed++;
        } else {
          // Resend says unsubscribed, we say subscribed. Never auto-resubscribe
          // — the unsubscribe almost certainly happened via an email link and
          // our webhook missed it. Report it and let a human decide.
          report.needsReview.push(`${email}: suppressed in Resend, "${row.status}" in DynamoDB`);
        }
      }
      const firstName = row.name ? String(row.name).split(' ')[0].slice(0, 50) : null;
      if (firstName && contact.firstName !== firstName) patch.first_name = firstName;

      if (Object.keys(patch).length) {
        await resend('PATCH', `/contacts/${encodeURIComponent(email)}`, patch);
        report.pushed++;
        await sleep(550);
      }
      if (row.resendSynced !== true) await markSynced(email, true, null);

    } catch (e) {
      report.failures.push(`${email}: ${e.message}`);
      await markSynced(email, false, e.message).catch(() => {});
    }
  }

  // 4. In Resend but unknown to us — usually a dashboard import or a manual add.
  //    Never deleted automatically; someone might have added them deliberately.
  const known = new Set(rows.map((r) => r.email));
  report.orphansInResend = contacts.filter((c) => !known.has(c.email)).map((c) => c.email);

  const drift = report.pushed + report.suppressed + report.tidied
    + report.orphansInResend.length + report.needsReview.length + report.failures.length;

  console.log('reconcile:', JSON.stringify({ ...report, scanned: rows.length, inResend: contacts.length }));

  // 5. Only speak up when there's something to say.
  if (TOPIC && drift > 0) {
    const lines = [
      `Traxent marketing reconciliation — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      '',
      `DynamoDB rows:     ${rows.length}`,
      `Resend contacts:   ${contacts.length}`,
      `Pushed to Resend:  ${report.pushed}`,
      `Suppressed:        ${report.suppressed}`,
      `Tidied (moved):    ${report.tidied}`,
    ];
    const section = (title, items) => {
      if (!items.length) return;
      lines.push('', `${title} (${items.length}):`, ...items.slice(0, 25).map((i) => `  · ${i}`));
      if (items.length > 25) lines.push(`  · …and ${items.length - 25} more`);
    };
    section('NEEDS REVIEW — unsubscribed in Resend but not here', report.needsReview);
    section('In Resend but not in DynamoDB', report.orphansInResend);
    section('FAILURES — will retry next run', report.failures);

    await sns.send(new PublishCommand({
      TopicArn: TOPIC,
      Subject: report.failures.length
        ? 'Traxent marketing sync: failures'
        : 'Traxent marketing sync: drift repaired',
      Message: lines.join('\n'),
    })).catch((e) => console.error('SNS publish failed:', e.message));
  }

  return { statusCode: 200, body: JSON.stringify(report) };
};
