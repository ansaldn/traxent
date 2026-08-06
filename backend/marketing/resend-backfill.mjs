#!/usr/bin/env node
// ── Push any un-mirrored subscribers into Resend ────────────────────────────
//
//   node resend-backfill.mjs --dry-run
//   node resend-backfill.mjs
//
// The subscribe Lambda writes to DynamoDB first and then mirrors the contact to
// Resend. If that second step fails — Resend down, key rotated, rate limit —
// the row is kept with `resendSynced: false` and the signup is NOT lost. This
// script is how those rows catch up.
//
// Safe to run any time. It only touches rows that are `subscribed` and not yet
// synced, and it never re-adds anyone who unsubscribed, bounced or complained.

import { getApiKey, ensureSegment, listContacts, createContact, ensureContactProperties, installCleanErrors } from './resend.mjs';
import { listByStatus, markSynced } from './subscribers.mjs';
import { SEGMENT_NAME } from './campaign.config.mjs';

installCleanErrors();

const DRY = process.argv.includes('--dry-run');

let subscribers;
try {
  subscribers = listByStatus('subscribed');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}

const pending = subscribers.filter((r) => r.resendSynced !== true);
console.log(`Subscribed in DynamoDB: ${subscribers.length}`);
console.log(`Not yet mirrored to Resend: ${pending.length}`);

if (!pending.length) {
  console.log('\nNothing to do — everything is in sync.');
  process.exit(0);
}

const apiKey = getApiKey();
const segment = await ensureSegment(apiKey, SEGMENT_NAME);

// Resend rejects contact writes that reference a property key it doesn't know
// about (422 "One or more properties do not exist"). Declare them up front.
const newProps = await ensureContactProperties(apiKey);
if (newProps.length) console.log(`Created contact properties: ${newProps.join(', ')}`);
console.log(`Segment "${segment.name}" (${segment.id})${segment.created ? ' — created' : ''}`);

// Someone may already exist in Resend even though DynamoDB thinks otherwise
// (e.g. the mirror succeeded but the status write afterwards failed). Reconcile
// against the live contact list rather than blindly re-creating.
const already = new Set((await listContacts(apiKey, segment.id)).map((c) => c.email));
const toCreate = pending.filter((r) => !already.has(r.email));
const alreadyThere = pending.filter((r) => already.has(r.email));

console.log(`  · ${alreadyThere.length} already in Resend — will just fix the sync flag`);
console.log(`  · ${toCreate.length} need creating\n`);

if (DRY) {
  for (const r of toCreate.slice(0, 30)) console.log(`  + ${r.email}  [${r.source ?? '?'}]`);
  if (toCreate.length > 30) console.log(`  …and ${toCreate.length - 30} more`);
  console.log('\nDry run — nothing was written.');
  process.exit(0);
}

for (const r of alreadyThere) {
  markSynced(r.email, { synced: true, error: null });
}

let ok = 0, failed = 0;
for (const r of toCreate) {
  try {
    const res = await createContact(apiKey, segment.id, {
      email: r.email,
      unsubscribed: false,
      properties: {
        signup_source: r.source || 'waitlist',
        signup_date: r.createdAt || '',
        consent_basis: `waitlist signup (${r.consentVersion || 'unknown'})`,
        utm_campaign: r.utmCampaign || '',
      },
    });
    markSynced(r.email, { synced: true, contactId: res?.id ?? null });
    ok++;
    if (ok % 25 === 0) console.log(`  …${ok}/${toCreate.length}`);
  } catch (e) {
    const msg = String(e.message).split('\n')[0];
    markSynced(r.email, { synced: false, error: msg });
    failed++;
    console.error(`  ! ${r.email}: ${msg}`);
  }
  // Resend's default rate limit is 2 requests/second.
  await new Promise((res) => setTimeout(res, 550));
}

console.log(`\nDone. Created ${ok}, failed ${failed}, flag-fixed ${alreadyThere.length}.`);
if (failed) console.log('Re-run to retry the failures — the script is idempotent.');
