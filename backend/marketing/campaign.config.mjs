// ── Campaign configuration ──────────────────────────────────────────────────
// The single place to change who the email comes from, where it points, and
// how it is tagged. Every script in this folder reads from here.

// ⚠️ REQUIRED BEFORE FIRST SEND ⚠️
// A marketing email must carry the sender's real postal address (UK PECR /
// GDPR sender identification, and every major inbox provider's bulk-sender
// policy). Put Akpan Holdings Limited's registered office address here.
// The layout throws if this still contains "REPLACE".
export const POSTAL_ADDRESS = 'Akpan Holdings Limited registered office, 167-169 Great Portland Street, London, W1W 5PF, United Kingdom';

// Sender. `hello@traxent.io` is already the transactional From address.
// Using a distinct marketing subdomain/address keeps marketing reputation from
// dragging down transactional deliverability — but it must be verified in
// Resend first. Start with the verified root domain.
export const FROM = 'Traxent <hello@traxent.io>';
export const REPLY_TO = 'hello@traxent.io';

// Internal-only label, shown in the Resend dashboard.
export const BROADCAST_NAME = 'Prelaunch announcement — waitlist';

// The Resend segment (formerly "audience") the waitlist lives in.
export const SEGMENT_NAME = 'Traxent waitlist';

// Campaign tagging so Plausible can attribute signups back to this send.
export const UTM = {
  utm_source: 'email',
  utm_medium: 'broadcast',
  utm_campaign: 'prelaunch-2026-08',
};

export const SITE = 'https://traxent.io';

/** Append UTM parameters to a traxent.io path. */
export function link(path, extra = {}) {
  const url = new URL(path, SITE);
  for (const [k, v] of Object.entries({ ...UTM, ...extra })) url.searchParams.set(k, v);
  return url.toString();
}
