#!/usr/bin/env node
// ── Create the prelaunch broadcast as a DRAFT in Resend ─────────────────────
//
//   node create-broadcast.mjs
//
// This script deliberately CANNOT send. It creates a draft against the
// waitlist segment; you then open Resend → Broadcasts, look at it one last
// time, and press Send yourself. Nothing goes to real people without a human
// clicking the button.
//
// Preflight refuses to create the draft unless:
//   · the From domain is verified in Resend
//   · the segment exists and has at least one subscribed contact
//   · the HTML still contains the {{{RESEND_UNSUBSCRIBE_URL}}} token
//   · the postal address has been filled in

import { installCleanErrors, getApiKey, listDomains, ensureSegment, listContacts, createBroadcast } from './resend.mjs';
import { renderPrelaunchHtml, renderPrelaunchText, SUBJECT } from './prelaunch-email.mjs';
import { FROM, REPLY_TO, SEGMENT_NAME, BROADCAST_NAME, POSTAL_ADDRESS } from './campaign.config.mjs';
import { UNSUB_TOKEN } from './email-layout.mjs';

installCleanErrors();

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// 1. Postal address
if (/REPLACE|TODO/i.test(POSTAL_ADDRESS)) {
  fail('POSTAL_ADDRESS in campaign.config.mjs is still a placeholder. A marketing email must carry the sender\'s real registered address.');
}
console.log('✓ Postal address set');

const apiKey = getApiKey();

// 2. Sending domain verified
const fromDomain = FROM.match(/@([^>\s]+)/)?.[1];
const domains = await listDomains(apiKey);
const d = domains.find((x) => x.name === fromDomain);
if (!d) fail(`Domain "${fromDomain}" is not in this Resend account (found: ${domains.map((x) => x.name).join(', ') || 'none'}).`);
if (d.status !== 'verified') fail(`Domain "${fromDomain}" status is "${d.status}". Add the DNS records and verify it first.`);
console.log(`✓ Sending domain ${fromDomain} verified`);

// 3. Segment populated
const segment = await ensureSegment(apiKey, SEGMENT_NAME);
if (segment.created) fail(`Segment "${SEGMENT_NAME}" did not exist — it has just been created and is empty. Run import-waitlist.mjs first.`);
const contacts = await listContacts(apiKey, segment.id);
const live = contacts.filter((c) => !c.unsubscribed);
if (!live.length) fail(`Segment "${SEGMENT_NAME}" has no subscribed contacts. Run import-waitlist.mjs first.`);
console.log(`✓ Segment "${segment.name}" — ${live.length} subscribed, ${contacts.length - live.length} unsubscribed`);

// 4. Unsubscribe token survived rendering
const html = renderPrelaunchHtml();
const text = renderPrelaunchText();
if (!html.includes(UNSUB_TOKEN)) fail('The rendered HTML no longer contains the unsubscribe token — Resend would send without an unsubscribe link.');
if (!text.includes(UNSUB_TOKEN)) fail('The plain-text version no longer contains the unsubscribe token.');
console.log('✓ Unsubscribe token present in HTML and text');

// 5. Size
if (html.length > 102400) fail(`HTML is ${(html.length / 1024).toFixed(1)} KB — Gmail clips above 102 KB. Trim the body.`);
console.log(`✓ HTML ${(html.length / 1024).toFixed(1)} KB (under Gmail's 102 KB clip threshold)`);

// ── Create the draft ────────────────────────────────────────────────────────
const res = await createBroadcast(apiKey, {
  segmentId: segment.id,
  from: FROM,
  replyTo: REPLY_TO,
  subject: SUBJECT,
  html,
  text,
  name: BROADCAST_NAME,
});

console.log(`\n✓ Draft broadcast created — id ${res.id}`);
console.log(`  Name:      ${BROADCAST_NAME}`);
console.log(`  Subject:   ${SUBJECT}`);
console.log(`  From:      ${FROM}`);
console.log(`  Audience:  ${live.length} people`);
console.log('\nNothing has been sent. Open https://resend.com/broadcasts, review the');
console.log('preview, and press Send when you are happy with it.');
