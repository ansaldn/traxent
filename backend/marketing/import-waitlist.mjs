#!/usr/bin/env node
// ── One-off migration: Formspree export → DynamoDB + Resend ────────────────
//
//   node import-waitlist.mjs <export.csv> [--dry-run]
//
// Formspree (form mlgogjdq) held the waitlist before the /subscribe API existed.
// Export it as CSV from the Formspree dashboard, then run this ONCE. The script:
//   • parses the CSV (any column that looks like an email is used)
//   • lowercases, trims and de-duplicates
//   • drops obvious junk (invalid syntax, role addresses, our own domain)
//   • skips anyone already in the segment — including anyone who unsubscribed
//   • seeds TraxentSubscribers in DynamoDB (never overwriting a newer record)
//   • adds the rest as Resend contacts, recording their signup source + date
//
// Re-running is safe: it only ever adds people who aren't already there.

import { readFileSync } from 'node:fs';
import { installCleanErrors, getApiKey, ensureSegment, listContacts, createContact, ensureContactProperties } from './resend.mjs';
import { putSubscriberIfNew, markSynced } from './subscribers.mjs';
import { SEGMENT_NAME } from './campaign.config.mjs';

// Formspree rows without a usable timestamp get this date, so `createdAt` is
// never blank. It is the day the migration ran, not a real signup date — the
// `consentVersion: formspree-legacy` marker flags these as approximate.
const IMPORT_FALLBACK_DATE = new Date().toISOString();

installCleanErrors();

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');

// Find the CSV path: the first bare argument that isn't a flag AND isn't the
// value belonging to a flag that takes one (e.g. `--profile traxent`).
const FLAGS_WITH_VALUES = new Set(['--profile', '--region']);
const csvPath = (() => {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (FLAGS_WITH_VALUES.has(args[i])) i++;   // skip its value
      continue;
    }
    return args[i];
  }
  return null;
})();

if (!csvPath) {
  console.error('Usage: node import-waitlist.mjs <export.csv> [--dry-run] [--profile <name>]');
  process.exit(1);
}

// ── CSV parsing (RFC 4180: quoted fields, escaped quotes, embedded newlines) ─
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Role/shared addresses — sending marketing to these is a spam-trap risk.
const ROLE_PREFIXES = new Set([
  'abuse', 'admin', 'billing', 'compliance', 'contact', 'devnull', 'help',
  'hostmaster', 'info', 'legal', 'mail', 'marketing', 'no-reply', 'noreply',
  'postmaster', 'privacy', 'root', 'sales', 'security', 'spam', 'support',
  'sysadmin', 'webmaster',
]);

function classify(email) {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, reason: 'invalid syntax' };
  const [local, domain] = e.split('@');
  if (domain === 'traxent.io' || domain === 'akpan.uk') return { ok: false, reason: 'own domain' };
  if (domain.endsWith('.test') || domain === 'example.com') return { ok: false, reason: 'test domain' };
  if (ROLE_PREFIXES.has(local)) return { ok: false, reason: 'role address' };
  return { ok: true, email: e };
}

// ── Read + normalise the export ─────────────────────────────────────────────
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
if (rows.length < 2) { console.error('CSV appears to have no data rows.'); process.exit(1); }

const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
const emailIdx = col('email') !== -1 ? col('email') : header.findIndex((h) => h.includes('email'));
const sourceIdx = col('source');
const tsIdx = col('ts') !== -1 ? col('ts') : col('submitted at');

if (emailIdx === -1) {
  console.error(`No email column found. Header was: ${header.join(', ')}`);
  process.exit(1);
}

const seen = new Map();   // email → { source, ts }
const rejected = [];
for (const r of rows.slice(1)) {
  const raw = (r[emailIdx] ?? '').trim();
  if (!raw) continue;
  const c = classify(raw);
  if (!c.ok) { rejected.push(`${raw} (${c.reason})`); continue; }
  // Keep the FIRST occurrence — that's the original signup.
  if (!seen.has(c.email)) {
    seen.set(c.email, {
      source: sourceIdx !== -1 ? (r[sourceIdx] ?? '').trim() : '',
      ts: tsIdx !== -1 ? (r[tsIdx] ?? '').trim() : '',
    });
  }
}

console.log(`Parsed ${rows.length - 1} row(s) → ${seen.size} unique valid address(es).`);
if (rejected.length) {
  console.log(`Rejected ${rejected.length}:`);
  for (const r of rejected.slice(0, 25)) console.log(`  · ${r}`);
  if (rejected.length > 25) console.log(`  · …and ${rejected.length - 25} more`);
}

// ── Seed DynamoDB ───────────────────────────────────────────────────────────
// The table is the system of record, so the historical Formspree signups go in
// there first. `putSubscriberIfNew` never overwrites, so anyone who has since
// signed up again through the live form keeps their newer consent record.
let created = 0, alreadyPresent = 0;
try {
  if (DRY) throw new Error('__dry__');
  for (const [email, meta] of seen) {
    const r = putSubscriberIfNew({
      email,
      status: 'subscribed',
      createdAt: meta.ts || IMPORT_FALLBACK_DATE,
      updatedAt: new Date().toISOString(),
      source: meta.source || 'formspree-import',
      consentAt: meta.ts || IMPORT_FALLBACK_DATE,
      consentText: 'Free to join. No spam. Unsubscribe anytime.',
      consentVersion: 'formspree-legacy',
      importedFrom: 'formspree:mlgogjdq',
      importedAt: new Date().toISOString(),
      resendSynced: false,
    });
    if (r === 'created') created++; else alreadyPresent++;
  }
  console.log(`\nDynamoDB: ${created} created, ${alreadyPresent} already present.`);
} catch (e) {
  if (e.message === '__dry__') {
    console.log(`\nDynamoDB: would attempt ${seen.size} insert(s) (dry run — nothing written).`);
  } else {
    console.error(`\n✗ DynamoDB seed failed: ${e.message}`);
    console.error('  Has the user-data stack been deployed? Continuing to the Resend sync anyway.');
  }
}

// ── Sync into Resend ────────────────────────────────────────────────────────
const apiKey = getApiKey();
const segment = await ensureSegment(apiKey, SEGMENT_NAME);

// Resend rejects contact writes that reference a property key it doesn't know
// about (422 "One or more properties do not exist"). Declare them up front.
const newProps = await ensureContactProperties(apiKey);
if (newProps.length) console.log(`Created contact properties: ${newProps.join(', ')}`);
console.log(`\nSegment "${segment.name}" (${segment.id})${segment.created ? ' — created' : ''}`);

const existing = await listContacts(apiKey, segment.id);
const existingSet = new Set(existing.map((c) => c.email));
const unsubCount = existing.filter((c) => c.unsubscribed).length;
console.log(`Already in segment: ${existing.length} (${unsubCount} unsubscribed — these are never re-added).`);

const toAdd = [...seen.entries()].filter(([email]) => !existingSet.has(email));
console.log(`To add: ${toAdd.length}\n`);

if (DRY) {
  for (const [email, meta] of toAdd.slice(0, 30)) console.log(`  + ${email}${meta.source ? `  [${meta.source}]` : ''}`);
  if (toAdd.length > 30) console.log(`  …and ${toAdd.length - 30} more`);
  console.log('\nDry run — nothing was written. Re-run without --dry-run to import.');
  process.exit(0);
}

let added = 0, failed = 0;
for (const [email, meta] of toAdd) {
  try {
    const res = await createContact(apiKey, segment.id, {
      email,
      unsubscribed: false,
      properties: {
        signup_source: meta.source || 'waitlist',
        signup_date: meta.ts || '',
        consent_basis: 'waitlist signup (traxent.io)',
      },
    });
    markSynced(email, { synced: true, contactId: res?.id ?? null });
    added++;
    if (added % 25 === 0) console.log(`  …${added}/${toAdd.length}`);
  } catch (e) {
    const msg = e.message.split('\n')[0];
    try { markSynced(email, { synced: false, error: msg }); } catch {}
    failed++;
    console.error(`  ! ${email}: ${msg}`);
  }
  // Resend rate-limits at 2 req/s by default; stay comfortably under it.
  await new Promise((r) => setTimeout(r, 550));
}

console.log(`\nDone. Added ${added}, failed ${failed}, skipped ${seen.size - toAdd.length} already present.`);
console.log(`Segment ID for the broadcast: ${segment.id}`);
