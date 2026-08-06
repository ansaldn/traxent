// ── Email address validation + classification ───────────────────────────────
// Shared by the subscribe Lambda and the offline tooling in backend/marketing/.
// Deliberately conservative: this endpoint is PUBLIC, so anything that gets
// through ends up costing money and reputation on a real send.

// Practical syntax check. Not RFC 5322 — that regex accepts things no inbox
// provider does. This matches what the front-end validates plus a real TLD.
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

// Role/shared mailboxes. Marketing mail to these draws complaints and they are
// a common spam-trap shape.
export const ROLE_PREFIXES = new Set([
  'abuse', 'admin', 'administrator', 'billing', 'compliance', 'contact',
  'devnull', 'help', 'hostmaster', 'info', 'legal', 'mail', 'marketing',
  'no-reply', 'noreply', 'office', 'postmaster', 'privacy', 'root', 'sales',
  'security', 'spam', 'support', 'sysadmin', 'team', 'webmaster',
]);

// Throwaway-inbox providers. Not exhaustive — it never can be — but it removes
// the lazy majority. Keeping these out protects the sending domain's reputation.
export const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
  'temp-mail.org', 'throwawaymail.com', 'sharklasers.com', 'getnada.com',
  'trashmail.com', 'fakeinbox.com', 'tempmail.net', 'dispostable.com',
  'maildrop.cc', 'mintemail.com', 'spamgourmet.com', 'mailnesia.com',
]);

// Our own domains — a signup here is a test, not a subscriber.
export const OWN_DOMAINS = new Set(['traxent.io', 'akpan.uk']);

/**
 * Normalise and classify an address.
 * @returns {{ok: true, email: string} | {ok: false, reason: string}}
 */
export function classifyEmail(raw) {
  const e = String(raw ?? '').trim().toLowerCase();

  if (!e) return { ok: false, reason: 'empty' };
  if (e.length > 254) return { ok: false, reason: 'too long' };
  if (!EMAIL_RE.test(e)) return { ok: false, reason: 'invalid syntax' };

  const at = e.lastIndexOf('@');
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  if (local.length > 64) return { ok: false, reason: 'local part too long' };
  if (domain.includes('..') || local.includes('..')) return { ok: false, reason: 'invalid syntax' };
  if (!/\.[a-z]{2,}$/.test(domain)) return { ok: false, reason: 'invalid tld' };
  if (domain.endsWith('.test') || domain.endsWith('.invalid') || domain.endsWith('.example')) {
    return { ok: false, reason: 'reserved domain' };
  }
  if (domain === 'example.com' || domain === 'example.org') return { ok: false, reason: 'reserved domain' };
  if (OWN_DOMAINS.has(domain)) return { ok: false, reason: 'own domain' };
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: 'disposable domain' };
  if (ROLE_PREFIXES.has(local)) return { ok: false, reason: 'role address' };

  return { ok: true, email: e };
}
