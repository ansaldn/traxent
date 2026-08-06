#!/usr/bin/env node
// ── Export the subscriber list from DynamoDB ────────────────────────────────
//
//   node export-subscribers.mjs                    → subscribed only, to CSV
//   node export-subscribers.mjs --status all       → every status
//   node export-subscribers.mjs --status unsubscribed
//   node export-subscribers.mjs --count            → just the numbers
//   node export-subscribers.mjs --out list.csv     → choose the filename
//
// This is your list. Unlike the old Formspree setup, you can export it, audit
// it, and prove consent for every row — consentAt, consentIp and the exact
// wording each person saw are all included.
//
// The CSV lands in this folder and is gitignored. Delete it when you're done:
// it is a file full of personal data.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { listAll, listByStatus, csvCell, whoami, TABLE } from './subscribers.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};
const status = flag('status', 'subscribed');
const countOnly = args.includes('--count');

const COLUMNS = [
  'email', 'status', 'createdAt', 'updatedAt',
  'source', 'landingPath', 'referrer',
  'utmSource', 'utmMedium', 'utmCampaign', 'utmContent',
  'consentAt', 'consentIp', 'consentText', 'consentVersion',
  'signupCount', 'resubscribedAt', 'unsubscribedAt', 'unsubscribeSource',
  'bouncedAt', 'bounceType', 'complainedAt',
  'resendSynced', 'resendContactId', 'resendSyncError',
];

let rows, me;
try {
  // Print the account first — with several AWS profiles on this machine, an
  // empty result is far more often "wrong account" than "no subscribers".
  me = whoami();
  console.log(`Account: ${me.account}  ·  profile: ${me.profile}  ·  region: ${me.region}`);
  rows = status === 'all' ? listAll() : listByStatus(status);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}

// Always show the breakdown — it's the number you actually want to know.
const all = status === 'all' ? rows : null;
const breakdown = (all ?? rows).reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

console.log(`Table: ${TABLE}`);
console.log(`Rows:  ${rows.length}${status === 'all' ? '' : ` (status = ${status})`}`);
for (const [k, v] of Object.entries(breakdown).sort()) console.log(`   ${String(v).padStart(6)}  ${k}`);

if (countOnly) process.exit(0);

if (!rows.length) {
  console.log('\nNothing to export.');
  process.exit(0);
}

rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

const csv = [
  COLUMNS.join(','),
  ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')),
].join('\n') + '\n';

const here = dirname(fileURLToPath(import.meta.url));
const name = flag('out', `subscribers-${status}-${new Date().toISOString().slice(0, 10)}.csv`);
const out = isAbsolute(name) ? name : join(here, name);
writeFileSync(out, csv);

console.log(`\n✓ ${rows.length} row(s) → ${out}`);
console.log('  Contains personal data. Delete it once you\'re finished with it.');
