// ── Enterprise enquiry ──────────────────────────────────────────────────────
// POST /enterprise/enquiry — public, from /enterprise.
//
// Enterprise deals start with a conversation, not a signup form, so this
// captures enough to have that conversation properly: who they are, how many
// seats, what they actually need, and when. Seat count and timeline are what
// tell you whether a lead is worth a call this week or a note in six months.
//
// Same abuse controls as /subscribe — honeypot, validation, per-IP cap — plus
// an SNS notification, because an enterprise lead sitting unread in a database
// for a fortnight is worse than not capturing it.
//
// Env vars: ENTERPRISE_TABLE, ALLOWED_ORIGIN, ALERTS_TOPIC_ARN

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const TABLE = process.env.ENTERPRISE_TABLE;
const TOPIC = process.env.ALERTS_TOPIC_ARN;

const RATE_LIMIT = 5;               // enquiries
const RATE_WINDOW_SECONDS = 3600;   // per hour, per IP

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const sns = new SNSClient({});

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://traxent.io',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

// Free-mail domains aren't rejected — plenty of real small firms use them — but
// they're flagged, because "500 seats" from a gmail address is worth a second
// look before you spend an hour preparing a proposal.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'hotmail.co.uk', 'outlook.com', 'live.com', 'aol.com', 'icloud.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com',
]);

const SEAT_BANDS = new Set(['1-10', '11-50', '51-200', '201-500', '500+']);
const TIMELINES = new Set(['immediately', '1-3-months', '3-6-months', 'exploring']);
const NEEDS = new Set(['sso', 'scim', 'bulk-seats', 'white-label', 'data-logging', 'sla', 'other']);

const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};

async function overRateLimit(ip) {
  if (!ip) return false;
  const now = Math.floor(Date.now() / 1000);
  try {
    const r = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `RATE#${ip}`, sk: 'ENQUIRY' },
      UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':exp': now + RATE_WINDOW_SECONDS },
      ReturnValues: 'ALL_NEW',
    }));
    const item = r.Attributes ?? {};
    if (Number(item.expiresAt) <= now) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `RATE#${ip}`, sk: 'ENQUIRY' },
        UpdateExpression: 'SET #c = :one, expiresAt = :exp',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': now + RATE_WINDOW_SECONDS },
      }));
      return false;
    }
    return Number(item.count) > RATE_LIMIT;
  } catch {
    return false;   // fail open — never lose a lead to a counter bug
  }
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '{}'));
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  // Honeypot — succeed silently so the bot learns nothing.
  if (String(body.website ?? '').trim() !== '') return json(200, { ok: true });

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: 'invalid_email', message: 'Please enter a valid work email address.' });
  }
  const name = str(body.name, 120);
  if (!name) return json(400, { error: 'missing_name', message: 'Please tell us your name.' });
  const company = str(body.company, 200);
  if (!company) return json(400, { error: 'missing_company', message: 'Please tell us your organisation.' });

  const ip = event?.requestContext?.http?.sourceIp ?? '';
  if (await overRateLimit(ip)) {
    return json(429, { error: 'rate_limited', message: 'Too many enquiries from this connection. Please email hello@traxent.io.' });
  }

  const domain = email.slice(email.lastIndexOf('@') + 1);
  const seats = SEAT_BANDS.has(body.seats) ? body.seats : undefined;
  const timeline = TIMELINES.has(body.timeline) ? body.timeline : undefined;
  const needs = Array.isArray(body.needs)
    ? [...new Set(body.needs.filter((n) => NEEDS.has(n)))].slice(0, NEEDS.size)
    : [];

  const now = new Date().toISOString();
  const id = randomUUID();

  const record = {
    pk: `LEAD#${id}`,
    sk: 'ENQUIRY',
    // Indexed so leads can be listed newest-first without a table scan.
    lookupKey: 'LEAD',
    createdAt: now,
    leadId: id,
    status: 'new',
    name, company, email, domain,
    freeMailDomain: FREE_MAIL.has(domain),
    seats, timeline, needs,
    message: str(body.message, 2000),
    phone: str(body.phone, 40),
    sourceIp: ip || undefined,
    userAgent: str(event?.headers?.['user-agent'], 400),
    referrer: str(body.referrer, 500),
    utmSource: str(body.utm_source, 120),
    utmCampaign: str(body.utm_campaign, 120),
  };

  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  } catch (e) {
    console.error('enterprise enquiry: put failed', e);
    return json(500, { error: 'server_error', message: 'Something went wrong. Please email hello@traxent.io.' });
  }

  // Notify. Non-fatal — the lead is already saved.
  if (TOPIC) {
    const lines = [
      `New enterprise enquiry — ${company}`,
      '',
      `Name:     ${name}`,
      `Email:    ${email}${record.freeMailDomain ? '   ⚠ free-mail domain' : ''}`,
      record.phone ? `Phone:    ${record.phone}` : null,
      `Company:  ${company}`,
      `Seats:    ${seats ?? 'not stated'}`,
      `Timeline: ${timeline ?? 'not stated'}`,
      `Needs:    ${needs.length ? needs.join(', ') : 'not stated'}`,
      '',
      record.message ? `Message:\n${record.message}` : '(no message)',
      '',
      `Lead id: ${id}`,
      `Received: ${now}`,
    ].filter((l) => l !== null);
    await sns.send(new PublishCommand({
      TopicArn: TOPIC,
      Subject: `Enterprise enquiry: ${company}`.slice(0, 100),
      Message: lines.join('\n'),
    })).catch((e) => console.error('enterprise enquiry: SNS failed (non-fatal)', e.message));
  }

  return json(200, { ok: true, message: "Thanks — we'll be in touch within one working day." });
};
