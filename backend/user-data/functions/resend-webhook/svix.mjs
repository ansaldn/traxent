// ── Svix webhook signature verification ────────────────────────────────────
// Resend signs webhooks with Svix. This is the manual verification documented
// at https://docs.svix.com/receiving/verifying-payloads/how-manual, implemented
// with node:crypto so the Lambda needs no `svix` dependency — matching the
// zero-dependency style used elsewhere in this backend.
//
// Algorithm:
//   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
//   expected      = base64(HMAC-SHA256(base64decode(secret after "whsec_"),
//                                      signedContent))
//   the `svix-signature` header is a space-delimited list of `v1,<sig>` values;
//   the request is valid if ANY v1 signature matches, compared in constant time.
//
// The raw body matters: parsing to JSON and re-stringifying changes the bytes
// and the signature will never match.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Reject timestamps outside this window, to blunt replay attacks. */
export const TOLERANCE_SECONDS = 300;

function constantTimeEquals(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * @param {string} rawBody  the request body, byte-for-byte as received
 * @param {object} headers  lower-cased request headers
 * @param {string} secret   signing secret, with or without the `whsec_` prefix
 * @param {number} [nowSeconds]  override for testing
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function verifySvix(rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) return { ok: false, reason: 'no signing secret configured' };

  const h = (name) => headers?.[name] ?? headers?.[name.replace('svix-', 'webhook-')] ?? '';
  const id = h('svix-id');
  const timestamp = h('svix-timestamp');
  const signature = h('svix-signature');

  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing svix headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'malformed timestamp' };
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  // The secret is `whsec_<base64>`; sign with the decoded bytes of the base64
  // part. Accept a bare base64 secret too, in case the prefix was stripped.
  const b64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(b64, 'base64');
  if (!key.length) return { ok: false, reason: 'signing secret is not valid base64' };

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // Header looks like: "v1,abc= v1,def= v2,ghi="  — only v1 is HMAC-SHA256.
  for (const part of signature.split(' ')) {
    const comma = part.indexOf(',');
    if (comma === -1) continue;
    if (part.slice(0, comma) !== 'v1') continue;
    if (constantTimeEquals(part.slice(comma + 1), expected)) return { ok: true };
  }

  return { ok: false, reason: 'no matching signature' };
}
