// ── Minimal Resend API client ───────────────────────────────────────────────
// No SDK dependency — matches the approach already used in
// backend/functions/stripe-webhook/email.mjs (plain fetch, Node 18+).
//
// Resend renamed "Audiences" to "Segments". This client probes for /segments
// and transparently falls back to /audiences on older accounts, so the same
// scripts work either way.

import { execFileSync } from 'node:child_process';

const BASE = 'https://api.resend.com';

/**
 * Resolve the API key. Order of preference:
 *   1. RESEND_API_KEY environment variable
 *   2. AWS SSM Parameter Store — /traxent/resend/api_key (the production home)
 */
export function getApiKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY.trim();

  // Several AWS accounts are configured on this machine, so pass the profile
  // explicitly rather than trusting whichever is default.
  const i = process.argv.indexOf('--profile');
  const profile = (i !== -1 ? process.argv[i + 1] : null) || process.env.AWS_PROFILE || null;
  const region = process.env.AWS_REGION || 'eu-west-2';

  let stderr = '';
  try {
    const out = execFileSync('aws', [
      'ssm', 'get-parameter',
      '--name', '/traxent/resend/api_key',
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text',
      ...(profile ? ['--profile', profile] : []),
      '--region', region,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const key = out.trim();
    if (key && key !== 'None') return key;
  } catch (e) {
    stderr = String(e.stderr ?? '').trim().split('\n')[0];
  }

  throw new Error(
    `No Resend API key found (profile ${profile ?? '(default)'}, region ${region}).\n` +
    (stderr ? `  AWS said: ${stderr}\n` : '') +
    '  Either:  export RESEND_API_KEY=re_...\n' +
    `  Or:      aws ssm get-parameter --name /traxent/resend/api_key --with-decryption${profile ? ` --profile ${profile}` : ''} --region ${region}\n` +
    '           …and if that fails, store the key first (see backend/marketing/README.md step 0).'
  );
}

/**
 * Turn a thrown error into a one-line message instead of a stack dump.
 * A rejected top-level `await` in ESM surfaces as `uncaughtException`, not
 * `unhandledRejection`, so both are handled. Set DEBUG=1 to see the stack.
 */
export function installCleanErrors() {
  const report = (e) => {
    if (process.env.DEBUG) console.error(e);
    else console.error(`\n✗ ${e?.message ?? e}`);
    process.exit(1);
  };
  process.on('uncaughtException', report);
  process.on('unhandledRejection', report);
}

async function call(apiKey, method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    throw new Error(`Could not reach api.resend.com (${e?.cause?.code ?? e.message}). Check your network connection.`);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const err = new Error(`Resend ${method} ${path} → ${res.status}: ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * Determine whether this account uses /segments (new) or /audiences (legacy).
 * Cached for the life of the process.
 */
let _collection = null;
export async function listCollectionName(apiKey) {
  if (_collection) return _collection;
  try {
    await call(apiKey, 'GET', '/segments');
    _collection = 'segments';
  } catch (e) {
    if (e.status === 404) _collection = 'audiences';
    else throw e;
  }
  return _collection;
}

/** List all segments/audiences. Returns [{ id, name }]. */
export async function listSegments(apiKey) {
  const c = await listCollectionName(apiKey);
  const r = await call(apiKey, 'GET', `/${c}`);
  return (r?.data ?? []).map((a) => ({ id: a.id, name: a.name }));
}

/** Find a segment by exact name, or create it. Returns { id, name, created }. */
export async function ensureSegment(apiKey, name) {
  const existing = (await listSegments(apiKey)).find((s) => s.name === name);
  if (existing) return { ...existing, created: false };
  const c = await listCollectionName(apiKey);
  const r = await call(apiKey, 'POST', `/${c}`, { name });
  return { id: r.id, name: r.name ?? name, created: true };
}

/**
 * List every contact in a segment. Returns [{ id, email, unsubscribed }].
 * Tries the current segment-scoped route, then the legacy audience route.
 */
export async function listContacts(apiKey, segmentId) {
  const shape = (r) => (r?.data ?? []).map((x) => ({
    id: x.id,
    email: (x.email || '').toLowerCase(),
    unsubscribed: !!x.unsubscribed,
    firstName: x.first_name || null,
    lastName: x.last_name || null,
  }));
  try {
    return shape(await call(apiKey, 'GET', `/segments/${segmentId}/contacts`));
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) throw e;
    const c = await listCollectionName(apiKey);
    return shape(await call(apiKey, 'GET', `/${c}/${segmentId}/contacts`));
  }
}

/**
 * Update an existing contact by email. Used by the identity sync when a name
 * or subscription state changes elsewhere (Auth0, Stripe).
 */
export async function updateContact(apiKey, email, patch) {
  const body = {};
  if (patch.firstName !== undefined) body.first_name = patch.firstName;
  if (patch.lastName !== undefined) body.last_name = patch.lastName;
  if (patch.unsubscribed !== undefined) body.unsubscribed = patch.unsubscribed;
  if (patch.properties) {
    const props = Object.fromEntries(
      Object.entries(patch.properties).filter(([, v]) => v !== '' && v != null)
    );
    if (Object.keys(props).length) body.properties = props;
  }
  return call(apiKey, 'PATCH', `/contacts/${encodeURIComponent(email)}`, body);
}

// ── Custom contact properties ───────────────────────────────────────────────
// Resend rejects a contact write that references a property key which doesn't
// exist yet, with:
//   422 {"message":"One or more properties do not exist","name":"validation_error"}
// Properties are account-wide and must be declared before use. Keys must be
// alphanumeric + underscore, max 50 chars, and the fallback must match the type.
export const CONTACT_PROPERTIES = [
  { key: 'signup_source', type: 'string', fallback_value: 'unknown' },
  { key: 'signup_date', type: 'string', fallback_value: '' },
  { key: 'consent_basis', type: 'string', fallback_value: 'unknown' },
  { key: 'utm_campaign', type: 'string', fallback_value: '' },
  { key: 'plan', type: 'string', fallback_value: 'free' },
];

/** List the custom properties that exist on this account. */
export async function listContactProperties(apiKey) {
  const r = await call(apiKey, 'GET', '/contact-properties');
  return (r?.data ?? []).map((p) => p.key);
}

/**
 * Create any of CONTACT_PROPERTIES that don't exist yet. Idempotent, and safe
 * to call on every run — it lists first and only creates the gaps.
 * Returns the keys it created.
 */
export async function ensureContactProperties(apiKey, defs = CONTACT_PROPERTIES) {
  let existing;
  try {
    existing = new Set(await listContactProperties(apiKey));
  } catch (e) {
    // Older accounts may not expose this endpoint at all. Not fatal — the
    // contact write falls back to dropping properties.
    if (e.status === 404) return [];
    throw e;
  }
  const created = [];
  for (const def of defs) {
    if (existing.has(def.key)) continue;
    try {
      await call(apiKey, 'POST', '/contact-properties', def);
      created.push(def.key);
    } catch (e) {
      // 409 / "already exists" is a race, not a problem.
      if (e.status !== 409 && !/already exists/i.test(e.message)) {
        console.warn(`  · could not create property "${def.key}": ${e.message.split('\n')[0]}`);
      }
    }
  }
  return created;
}

/**
 * Add one contact and put it in a segment.
 *
 * Resend has two generations of this API:
 *   current — POST /contacts          with `segments: [{ id }]`
 *   legacy  — POST /audiences/:id/contacts
 * We try the current shape first and fall back, so this works on either account.
 *
 * `first_name` / `last_name` are omitted entirely when we don't have them. We
 * never collected names on the waitlist — the forms only ever asked for an
 * email — so most contacts legitimately have none. Personalise with Resend's
 * default syntax, `{{{contact.first_name|there}}}`, which renders "there" when
 * the name is missing.
 *
 * Custom `properties` must already exist on the account; Resend rejects unknown
 * keys. If that happens we retry without them rather than losing the contact —
 * the properties are nice-to-have metadata, the subscriber is not.
 */
export async function createContact(apiKey, segmentId, { email, firstName, lastName, unsubscribed = false, properties }) {
  // Empty strings count as "set" to the API and can trip validation. Drop them.
  const props = Object.fromEntries(
    Object.entries(properties ?? {}).filter(([, v]) => v !== '' && v != null)
  );
  const hasProps = Object.keys(props).length > 0;

  const base = {
    email,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    unsubscribed,
  };

  const attempt = async (withProps) => {
    const body = withProps ? { ...base, properties: props } : base;
    try {
      return await call(apiKey, 'POST', '/contacts', { ...body, segments: [{ id: segmentId }] });
    } catch (e) {
      if (e.status !== 404 && e.status !== 405) throw e;
      const c = await listCollectionName(apiKey);          // legacy account
      return call(apiKey, 'POST', `/${c}/${segmentId}/contacts`, body);
    }
  };

  try {
    return await attempt(hasProps);
  } catch (e) {
    if (hasProps && (e.status === 400 || e.status === 422)) {
      console.warn(`  · ${email}: custom properties rejected, retrying without them`);
      return attempt(false);
    }
    throw e;
  }
}

/** Create a broadcast. Always a DRAFT — this client never passes `send`. */
export async function createBroadcast(apiKey, { segmentId, from, subject, html, text, replyTo, name }) {
  const c = await listCollectionName(apiKey);
  const idKey = c === 'segments' ? 'segment_id' : 'audience_id';
  return call(apiKey, 'POST', '/broadcasts', {
    [idKey]: segmentId,
    from,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(name ? { name } : {}),
  });
}

/** Send a single one-off email (used for the test send). */
export async function sendEmail(apiKey, { from, to, subject, html, text, replyTo }) {
  return call(apiKey, 'POST', '/emails', {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
}

/** List verified sending domains — used by the preflight check. */
export async function listDomains(apiKey) {
  const r = await call(apiKey, 'GET', '/domains');
  return (r?.data ?? []).map((d) => ({ id: d.id, name: d.name, status: d.status, region: d.region }));
}
