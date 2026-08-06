#!/usr/bin/env node
// ── Provision an enterprise organisation ────────────────────────────────────
//
//   node provision-org.mjs --name "Acme Trading" --domain acme.com --seats 50
//   node provision-org.mjs --list
//   node provision-org.mjs --org-id org_xxx --sso-connection con_xxx
//   node provision-org.mjs --rotate-token --org-id org_xxx
//
// Uses the AWS CLI rather than the SDK, so no npm install — same approach as
// backend/marketing/. Pass --profile traxent (or set AWS_PROFILE).
//
// The SCIM bearer token is printed ONCE and stored only as a SHA-256 hash.
// That is deliberate: this table leaking must not hand anyone the ability to
// create and delete users in a customer's account. If a token is lost, rotate
// it — there is no recovery path, by design.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const TABLE = process.env.ENTERPRISE_TABLE || 'TraxentEnterprise';
const REGION = process.env.AWS_REGION || 'eu-west-2';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : (args[i + 1] ?? d); };
const has = (n) => args.includes(`--${n}`);

const PROFILE = flag('profile') || process.env.AWS_PROFILE || null;
const profileArgs = PROFILE ? ['--profile', PROFILE] : [];

function aws(a) {
  try {
    const out = execFileSync('aws', [...a, ...profileArgs, '--region', REGION, '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim() ? JSON.parse(out) : {};
  } catch (e) {
    const err = String(e.stderr ?? '').trim().split('\n')[0];
    if (e.code === 'ENOENT') throw new Error('The AWS CLI is not installed, or not on PATH.');
    if (/ResourceNotFoundException/i.test(err)) {
      throw new Error(`Table "${TABLE}" not found in ${REGION}. Deploy the user-data stack first.`);
    }
    if (/Unable to locate credentials|ExpiredToken/i.test(err)) {
      throw new Error(`AWS CLI not authenticated for ${PROFILE ? `profile "${PROFILE}"` : 'the default profile'} in ${REGION}.`);
    }
    throw new Error(err || e.message);
  }
}

const unmarshal = (item) => Object.fromEntries(Object.entries(item ?? {}).map(([k, v]) => [
  k, 'S' in v ? v.S : 'N' in v ? Number(v.N) : 'BOOL' in v ? v.BOOL : 'NULL' in v ? null : undefined,
]));

const marshal = (o) => Object.fromEntries(Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => [k, typeof v === 'boolean' ? { BOOL: v } : typeof v === 'number' ? { N: String(v) } : { S: String(v) }]));

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
/** 32 bytes of CSPRNG, base64url. Long enough that guessing is not a strategy. */
const newToken = () => 'txscim_' + randomBytes(32).toString('base64url');

/**
 * All organisations.
 *
 * Scans rather than using LookupIndex, deliberately: an item has exactly one
 * `lookupKey`, and for an org that slot is spent on `SCIMTOKEN#<hash>` — which
 * is what SCIM authentication resolves on every single request. Listing orgs
 * happens by hand, a few times a year, against a handful of rows. Spending the
 * index on the hot path and scanning for the cold one is the right way round.
 */
function listOrgs() {
  const rows = [];
  let start;
  do {
    const a = ['dynamodb', 'scan', '--table-name', TABLE,
      '--filter-expression', 'sk = :m',
      '--expression-attribute-values', JSON.stringify({ ':m': { S: 'META' } })];
    if (start) a.push('--exclusive-start-key', JSON.stringify(start));
    const page = aws(a);
    rows.push(...(page.Items ?? []).map(unmarshal));
    start = page.LastEvaluatedKey;
  } while (start);
  return rows;
}

const getOrg = (orgId) => {
  const r = aws(['dynamodb', 'get-item', '--table-name', TABLE,
    '--key', JSON.stringify({ pk: { S: `ORG#${orgId}` }, sk: { S: 'META' } })]);
  return r.Item ? unmarshal(r.Item) : null;
};

function putToken(orgId, token) {
  aws(['dynamodb', 'update-item', '--table-name', TABLE,
    '--key', JSON.stringify({ pk: { S: `ORG#${orgId}` }, sk: { S: 'META' } }),
    '--update-expression', 'SET scimTokenHash = :h, lookupKey = :l, tokenRotatedAt = :n',
    '--expression-attribute-values', JSON.stringify({
      ':h': { S: sha256Hex(token) },
      // The GSI key IS the hash, so the plaintext never reaches DynamoDB.
      ':l': { S: `SCIMTOKEN#${sha256Hex(token)}` },
      ':n': { S: new Date().toISOString() },
    })]);
}

function showToken(token) {
  console.log('');
  console.log('  ┌─ SCIM bearer token ─────────────────────────────────────────┐');
  console.log('  │ Shown once. Stored only as a hash — it cannot be recovered. │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('    ' + token);
  console.log('');
  console.log('  Give the customer:');
  console.log('    Base URL: https://gqway1e53f.execute-api.eu-west-2.amazonaws.com/scim/v2');
  console.log('    Token:    (above)');
  console.log('');
}

try {
  // ── list ────────────────────────────────────────────────────────────────
  if (has('list')) {
    const orgs = listOrgs();
    if (!orgs.length) { console.log('No organisations yet.'); process.exit(0); }
    console.log(`${orgs.length} organisation(s):\n`);
    for (const o of orgs) {
      console.log(`  ${o.orgId}  ${o.name}`);
      console.log(`      domain ${o.domain ?? '—'} · seats ${o.seats ?? '—'} · status ${o.status ?? 'active'}`);
      console.log(`      SCIM ${o.scimTokenHash ? 'configured' : 'NOT configured'} · SSO ${o.ssoConnectionId ?? 'not configured'}`);
    }
    process.exit(0);
  }

  const orgId = flag('org-id');

  // ── rotate ──────────────────────────────────────────────────────────────
  if (has('rotate-token')) {
    if (!orgId) throw new Error('--rotate-token needs --org-id');
    const org = getOrg(orgId);
    if (!org) throw new Error(`No organisation "${orgId}". Run --list.`);
    const token = newToken();
    putToken(orgId, token);
    console.log(`Rotated the SCIM token for ${org.name}.`);
    console.log('The previous token stopped working immediately — tell them before they notice.');
    showToken(token);
    process.exit(0);
  }

  // ── attach an SSO connection ────────────────────────────────────────────
  const sso = flag('sso-connection');
  if (sso) {
    if (!orgId) throw new Error('--sso-connection needs --org-id');
    if (!getOrg(orgId)) throw new Error(`No organisation "${orgId}". Run --list.`);
    aws(['dynamodb', 'update-item', '--table-name', TABLE,
      '--key', JSON.stringify({ pk: { S: `ORG#${orgId}` }, sk: { S: 'META' } }),
      '--update-expression', 'SET ssoConnectionId = :c, updatedAt = :n',
      '--expression-attribute-values', JSON.stringify({ ':c': { S: sso }, ':n': { S: new Date().toISOString() } })]);
    console.log(`✓ Linked Auth0 connection ${sso} to ${orgId}.`);
    console.log('  Remember to enable it for the Traxent SPA application in Auth0, and to set');
    console.log('  Home Realm Discovery on their email domain — otherwise their people still');
    console.log('  see the password form.');
    process.exit(0);
  }

  // ── create ──────────────────────────────────────────────────────────────
  const name = flag('name');
  if (!name) {
    console.log(`Usage:
  node provision-org.mjs --name "Acme Trading" [--domain acme.com] [--seats 50]
  node provision-org.mjs --list
  node provision-org.mjs --org-id org_xxx --sso-connection con_xxx
  node provision-org.mjs --rotate-token --org-id org_xxx

  All commands accept --profile <aws-profile>.`);
    process.exit(1);
  }

  const domain = (flag('domain') || '').trim().toLowerCase() || undefined;
  const seats = flag('seats') ? Number(flag('seats')) : undefined;
  if (seats !== undefined && (!Number.isFinite(seats) || seats < 1)) throw new Error('--seats must be a positive number');

  if (domain) {
    const clash = listOrgs().find((o) => o.domain === domain);
    if (clash) throw new Error(`Domain ${domain} is already on ${clash.name} (${clash.orgId}).`);
  }

  const id = 'org_' + randomBytes(9).toString('hex');
  const now = new Date().toISOString();
  const token = newToken();

  aws(['dynamodb', 'put-item', '--table-name', TABLE,
    '--item', JSON.stringify(marshal({
      pk: `ORG#${id}`, sk: 'META',
      orgId: id, name, domain, seats,
      status: 'active',
      createdAt: now, updatedAt: now,
      scimTokenHash: sha256Hex(token),
      lookupKey: `SCIMTOKEN#${sha256Hex(token)}`,
    })),
    '--condition-expression', 'attribute_not_exists(pk)']);

  console.log(`✓ Created ${name}`);
  console.log(`  org id: ${id}`);
  if (domain) console.log(`  domain: ${domain}`);
  if (seats) console.log(`  seats:  ${seats}`);
  showToken(token);
  console.log('  Next: docs/ENTERPRISE.md, "Provisioning a customer".');

} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
