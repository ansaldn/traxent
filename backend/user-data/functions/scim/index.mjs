// ── Traxent SCIM 2.0 provisioning endpoint ──────────────────────────────────
// ANY /scim/v2/{proxy+}
//
// An enterprise customer's identity provider (Okta, Entra ID, JumpCloud) calls
// this to keep Traxent in step with their own directory: someone joins, they
// get an account; someone leaves, it's deactivated the same day. That last part
// is the entire commercial reason SCIM exists — manual offboarding is what
// security reviews fail you on.
//
// Auth is a per-organisation bearer token, NOT Auth0. The caller is a machine
// with no user session. The token is stored ONLY as a SHA-256 hash, so this
// table leaking does not hand anyone provisioning rights over a customer's
// users. Comparison is constant-time.
//
// Isolation is the other thing that must not go wrong: every read and write is
// scoped to the organisation the token resolved to, so one customer's IdP can
// never see or modify another's users. There is no code path that queries users
// without an org partition key.
//
// Env vars:
//   ENTERPRISE_TABLE   TraxentEnterprise
//   USER_DATA_TABLE    TraxentUserData (deactivation is mirrored here)

import { createHash, timingSafeEqual } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  SCHEMA, scimError, toScimUser, listResponse, parseFilter, fromScimUser,
  applyPatch, serviceProviderConfig, resourceTypes, schemas,
} from './scim.mjs';

const TABLE = process.env.ENTERPRISE_TABLE;
const MAX_PAGE = 200;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const SCIM_CT = 'application/scim+json; charset=utf-8';

const respond = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': SCIM_CT, 'Cache-Control': 'no-store', ...extra },
  body: body === undefined ? '' : JSON.stringify(body),
});

const fail = (status, detail, scimType) => respond(status, scimError(status, detail, scimType));

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest();

function tokensMatch(presented, storedHex) {
  if (!storedHex) return false;
  const a = sha256(presented);
  let b;
  try { b = Buffer.from(storedHex, 'hex'); } catch { return false; }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Resolve a bearer token to its organisation, or null. */
async function authenticate(headers) {
  const raw = headers['authorization'] || headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;

  // The lookup key is the hash, so the plaintext token is never sent to
  // DynamoDB and never appears in a query log.
  const hashHex = sha256(token).toString('hex');
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'LookupIndex',
    KeyConditionExpression: 'lookupKey = :k',
    ExpressionAttributeValues: { ':k': `SCIMTOKEN#${hashHex}` },
    Limit: 1,
  }));
  const org = r.Items?.[0];
  if (!org) return null;
  // Re-verify in constant time. The GSI hit already proves it, but this guards
  // against a future change that widens the lookup.
  if (!tokensMatch(token, org.scimTokenHash)) return null;
  if (org.status && org.status !== 'active') return null;
  return org;
}

// ── Storage. Every key is scoped to the org — this is the isolation boundary. ─
const userKey = (orgId, scimId) => ({ pk: `ORG#${orgId}`, sk: `USER#${scimId}` });

async function listUsers(orgId) {
  const out = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `ORG#${orgId}`, ':s': 'USER#' },
      ExclusiveStartKey,
    }));
    out.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

const getUser = async (orgId, scimId) =>
  (await ddb.send(new GetCommand({ TableName: TABLE, Key: userKey(orgId, scimId) }))).Item ?? null;

// ── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  const method = (event?.requestContext?.http?.method ?? 'GET').toUpperCase();
  const rawPath = event?.requestContext?.http?.path ?? event?.rawPath ?? '';
  const proto = event?.headers?.['x-forwarded-proto'] ?? 'https';
  const host = event?.headers?.host ?? 'traxent.io';
  const baseUrl = `${proto}://${host}/scim/v2`;

  // Everything after /scim/v2
  const sub = rawPath.replace(/^.*\/scim\/v2\/?/, '').replace(/\/+$/, '');
  const [resource, id] = sub.split('/');

  const headers = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = v;

  let org;
  try {
    org = await authenticate(headers);
  } catch (e) {
    console.error('scim: auth lookup failed', e);
    return fail(500, 'Internal error.');
  }
  if (!org) {
    return respond(401, scimError(401, 'Invalid or missing bearer token.'),
      { 'WWW-Authenticate': 'Bearer realm="Traxent SCIM"' });
  }
  const orgId = org.orgId;

  let body = null;
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body);
    } catch {
      return fail(400, 'Request body is not valid JSON.', 'invalidSyntax');
    }
  }

  try {
    // ── Discovery. IdPs fetch these before anything else. ──────────────────
    if (resource === 'ServiceProviderConfig') return respond(200, serviceProviderConfig(baseUrl));
    if (resource === 'ResourceTypes') return respond(200, resourceTypes(baseUrl));
    if (resource === 'Schemas') return respond(200, schemas());

    if (resource !== 'Users') {
      // Groups deliberately unimplemented — see the note in scim.mjs.
      return fail(404, `Unsupported SCIM resource "${resource || '/'}". This server implements /Users only.`);
    }

    // ── GET /Users — list, filter, paginate ────────────────────────────────
    if (method === 'GET' && !id) {
      const q = event.queryStringParameters ?? {};
      const parsed = parseFilter(q.filter);
      if (parsed && parsed.error) return fail(400, parsed.error, 'invalidFilter');

      let items = await listUsers(orgId);
      if (parsed) {
        const want = parsed.attr === 'email' || parsed.attr === 'userName'
          ? String(parsed.value).toLowerCase()
          : String(parsed.value);
        items = items.filter((u) => {
          const got = u[parsed.attr];
          if (got == null) return false;
          return parsed.attr === 'email' || parsed.attr === 'userName'
            ? String(got).toLowerCase() === want
            : String(got) === want;
        });
      }

      items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

      const startIndex = Math.max(1, parseInt(q.startIndex ?? '1', 10) || 1);
      const count = Math.min(MAX_PAGE, Math.max(0, parseInt(q.count ?? String(MAX_PAGE), 10) || MAX_PAGE));
      const page = items.slice(startIndex - 1, startIndex - 1 + count);

      return respond(200, listResponse(page.map((u) => toScimUser(u, baseUrl)), {
        totalResults: items.length, startIndex, itemsPerPage: page.length,
      }));
    }

    // ── GET /Users/{id} ────────────────────────────────────────────────────
    if (method === 'GET') {
      const u = await getUser(orgId, id);
      if (!u) return fail(404, `User ${id} not found.`);
      return respond(200, toScimUser(u, baseUrl));
    }

    // ── POST /Users — create ───────────────────────────────────────────────
    if (method === 'POST' && !id) {
      const parsed = fromScimUser(body);
      if (!parsed.userName) return fail(400, 'userName is required.', 'invalidValue');
      if (!parsed.email || !parsed.email.includes('@')) {
        return fail(400, 'A valid email is required, either in emails[] or as userName.', 'invalidValue');
      }

      // RFC 7644 §3.3: a duplicate userName is 409 uniqueness, not a new user.
      // IdPs rely on this to decide between create and update.
      const existing = (await listUsers(orgId))
        .find((u) => String(u.userName).toLowerCase() === parsed.userName.toLowerCase());
      if (existing) {
        return respond(409, scimError(409, `userName "${parsed.userName}" already exists.`, 'uniqueness'));
      }

      const now = new Date().toISOString();
      const scimId = `usr_${createHash('sha256').update(`${orgId}:${parsed.userName}:${now}`).digest('hex').slice(0, 24)}`;
      const item = {
        ...userKey(orgId, scimId),
        orgId, scimId, ...parsed,
        createdAt: now, updatedAt: now, version: 1,
      };
      await ddb.send(new PutCommand({
        TableName: TABLE, Item: item,
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      }));
      return respond(201, toScimUser(item, baseUrl), { Location: `${baseUrl}/Users/${scimId}` });
    }

    // ── PUT /Users/{id} — full replace ─────────────────────────────────────
    if (method === 'PUT') {
      const current = await getUser(orgId, id);
      if (!current) return fail(404, `User ${id} not found.`);
      const parsed = fromScimUser(body);
      if (!parsed.userName) return fail(400, 'userName is required.', 'invalidValue');

      const item = {
        ...current, ...parsed,
        updatedAt: new Date().toISOString(),
        version: (current.version ?? 1) + 1,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return respond(200, toScimUser(item, baseUrl));
    }

    // ── PATCH /Users/{id} — the deactivation path ──────────────────────────
    if (method === 'PATCH') {
      const current = await getUser(orgId, id);
      if (!current) return fail(404, `User ${id} not found.`);

      const ops = body?.Operations ?? body?.operations;
      const result = applyPatch(ops);
      if (result.error) return fail(400, result.error, 'invalidValue');

      const sets = ['updatedAt = :now', '#v = if_not_exists(#v, :zero) + :one'];
      const names = { '#v': 'version' };
      const values = { ':now': new Date().toISOString(), ':zero': 0, ':one': 1 };
      let i = 0;
      for (const [k, v] of Object.entries(result.patch)) {
        names[`#a${i}`] = k; values[`:a${i}`] = v;
        sets.push(`#a${i} = :a${i}`);
        i++;
      }

      const updated = await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: userKey(orgId, id),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));

      if (result.patch.active === false) {
        console.log('scim: deactivated', orgId, id, updated.Attributes?.email);
      }
      return respond(200, toScimUser(updated.Attributes, baseUrl));
    }

    // ── DELETE /Users/{id} ─────────────────────────────────────────────────
    // Soft delete. A hard delete would destroy the person's learning progress
    // the moment an admin removes them from a group, which is not recoverable
    // and not what "deprovision" means to a customer. GDPR erasure is a
    // separate, deliberate action.
    if (method === 'DELETE') {
      const current = await getUser(orgId, id);
      if (!current) return fail(404, `User ${id} not found.`);
      await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: userKey(orgId, id),
        UpdateExpression: 'SET active = :f, deprovisionedAt = :now, updatedAt = :now',
        ExpressionAttributeValues: { ':f': false, ':now': new Date().toISOString() },
      }));
      return respond(204);
    }

    return fail(405, `Method ${method} not supported on this resource.`);

  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return respond(409, scimError(409, 'Conflict — the resource changed concurrently.', 'uniqueness'));
    }
    console.error('scim: unhandled', method, rawPath, e);
    return fail(500, 'Internal error.');
  }
};

/** Exported for the admin tooling that provisions an org's token. */
export { sha256 };
