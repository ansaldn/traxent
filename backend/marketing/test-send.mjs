#!/usr/bin/env node
// ── Send ONE real copy of the prelaunch email to yourself ───────────────────
//
//   node test-send.mjs you@example.com
//
// Sends through the same domain and From address the broadcast will use, so
// this is a true deliverability test: check SPF/DKIM/DMARC all pass in the
// received headers, and that it doesn't land in spam.
//
// Note: because this goes via /emails (not /broadcasts), Resend does NOT
// substitute the unsubscribe token — a placeholder is used instead.

import { installCleanErrors, getApiKey, sendEmail, listDomains } from './resend.mjs';
import { renderPrelaunchHtml, renderPrelaunchText, SUBJECT } from './prelaunch-email.mjs';
import { FROM, REPLY_TO } from './campaign.config.mjs';

installCleanErrors();

const to = process.argv[2];
if (!to) {
  console.error('Usage: node test-send.mjs you@example.com');
  process.exit(1);
}

const apiKey = getApiKey();

// Preflight: refuse to send from an unverified domain — it would land in spam
// and burn the domain's reputation on the first impression.
const fromDomain = FROM.match(/@([^>\s]+)/)?.[1];
const domains = await listDomains(apiKey);
const d = domains.find((x) => x.name === fromDomain);
if (!d) {
  console.error(`✗ Domain "${fromDomain}" is not added to this Resend account.`);
  console.error(`  Domains present: ${domains.map((x) => `${x.name} (${x.status})`).join(', ') || 'none'}`);
  process.exit(1);
}
if (d.status !== 'verified') {
  console.error(`✗ Domain "${fromDomain}" status is "${d.status}", not "verified".`);
  console.error('  Add the DKIM/SPF records in Cloudflare and click Verify in Resend first.');
  process.exit(1);
}
console.log(`✓ ${fromDomain} verified (${d.region})`);

const unsubHref = 'https://traxent.io/privacy#cookies';
const res = await sendEmail(apiKey, {
  from: FROM,
  to,
  subject: `[TEST] ${SUBJECT}`,
  html: renderPrelaunchHtml({ unsubHref }),
  text: renderPrelaunchText({ unsubHref }),
  replyTo: REPLY_TO,
});

console.log(`✓ Sent to ${to} — id ${res.id}`);
console.log('\nNow check in the received message:');
console.log('  · "Show original" (Gmail) → SPF PASS, DKIM PASS, DMARC PASS');
console.log('  · It landed in the inbox, not Promotions-then-spam');
console.log('  · Images/layout render on mobile');
console.log('  · Every link goes where you expect');
