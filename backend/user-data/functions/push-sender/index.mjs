// ── Traxent push sender — SCAFFOLD, NOT YET DEPLOYED ────────────────────────
// Sends APNs pushes to registered devices (DEVICE# rows written by
// POST /user/device). Deliberately NOT wired into template.yaml yet: it can't
// work until David creates the APNs auth key in the Apple Developer portal
// (Keys → + → Apple Push Notifications service) and stores it in SSM:
//   /traxent/apns/key      (SecureString — the .p8 file contents)
//   /traxent/apns/key_id   (the 10-char Key ID)
//   /traxent/apns/team_id  (the Apple Team ID)
//
// To activate later: add a function to user-data/template.yaml with
// DynamoDBReadPolicy on TraxentUserData + SSMParameterReadPolicy traxent/*,
// and invoke it from the marketing broadcast flow (see backend/marketing/).
//
// Consent contract (Apple App Review 4.5.4): a marketing push may ONLY go to
// devices where BOTH pushOptIn === true (the iOS toggle — explicit consent)
// AND the user's marketing status is `subscribed`. Transactional pushes
// (e.g. "your weekly readiness report is ready") need only pushOptIn.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createSign } from 'crypto';

const TABLE = process.env.TABLE_NAME || 'TraxentUserData';
const APNS_HOST = process.env.APNS_HOST || 'https://api.push.apple.com'; // sandbox: api.sandbox.push.apple.com
const BUNDLE_ID = process.env.APNS_TOPIC || 'com.traxent.Traxent';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

async function getParam(name) {
  const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return r.Parameter.Value;
}

// APNs token-based auth: ES256 JWT signed with the .p8, valid ≤ 1h, reusable.
async function apnsJwt() {
  const [key, keyId, teamId] = await Promise.all([
    getParam('/traxent/apns/key'),
    getParam('/traxent/apns/key_id'),
    getParam('/traxent/apns/team_id'),
  ]);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

// Collect opted-in device rows. For marketing sends the caller must ALSO
// filter by the marketing `subscribed` status (join on the subscribers table).
async function optedInDevices() {
  const devices = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(sk, :d) AND pushOptIn = :t',
      ExpressionAttributeValues: { ':d': 'DEVICE#', ':t': true },
      ProjectionExpression: 'userId, sk, platform',
      ExclusiveStartKey,
    }));
    for (const it of page.Items || []) devices.push({ userId: it.userId, token: it.sk.slice(7), platform: it.platform });
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return devices;
}

async function sendToDevice(jwt, token, payload) {
  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  // 410 Unregistered → the token is dead; caller should delete the row.
  return { status: res.status, gone: res.status === 410 };
}

// event: { title, body, url? } — broadcast an alert to every opted-in device.
export const handler = async (event) => {
  const { title, body } = event || {};
  if (!title || !body) return { statusCode: 400, body: 'title and body required' };
  const jwt = await apnsJwt();
  const devices = await optedInDevices();
  const payload = { aps: { alert: { title, body }, sound: 'default' }, url: event.url || null };
  let sent = 0, dead = 0;
  for (const d of devices) {
    try {
      const r = await sendToDevice(jwt, d.token, payload);
      if (r.gone) dead++; else if (r.status === 200) sent++;
    } catch (e) { console.error('push failed (non-fatal):', d.userId, e.message); }
  }
  console.log(`push broadcast: ${sent} sent, ${dead} dead tokens of ${devices.length}`);
  return { statusCode: 200, body: JSON.stringify({ sent, dead, total: devices.length }) };
};
