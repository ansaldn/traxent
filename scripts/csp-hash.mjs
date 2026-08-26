#!/usr/bin/env node
// CSP Phase 2 — deploy-time hash injection. For each PILOT page, computes
// sha256 hashes of (a) every inline <script> block and (b) every inline event
// handler, and appends them to the page's CSP <meta> script-src:
//
//   'sha256-…' per block  +  'unsafe-hashes' 'sha256-…' per handler
//
// Effect (CSP3): once hashes are present, browsers IGNORE 'unsafe-inline' —
// so modern browsers get real enforcement (only these exact scripts run) while
// legacy browsers fall back to 'unsafe-inline' and keep working. Rollback is
// automatic: this runs at deploy time only; nothing is committed to the pages.
//
// IMPORTANT: must run AFTER any step that rewrites HTML (the __BUILD_SHA__
// stamping) — the hash covers the exact final bytes between the script tags.
//
// Pilot rollout: only pages in PILOT are processed. Set PILOT = 'ALL' to cover
// every page once the pilot set has been verified in a browser.
//
// Usage: node scripts/csp-hash.mjs [srcDir]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// ── Pilot set: zero/low-inline pages (verified low-stakes 2026-08) ──────────
const PILOT = [
  'firms.html', 'security.html', 'founding-terms.html',
  'privacy.html', 'terms.html', 'blog.html', 'calendar.html',
  'enterprise.html', 'open.html', 'signup.html',
];
// const PILOT = 'ALL';   // ← flip to this after the pilot verifies clean

const dir = process.argv[2] || 'src';
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const HANDLER_RE = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
const CSP_META_RE = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

// Browsers hash the HTML-DECODED attribute value for event handlers.
const decodeEntities = (s) => s
  .replace(/&quot;/g, '"').replace(/&#0*34;/g, '"')
  .replace(/&#0*39;/g, "'").replace(/&#x0*27;/gi, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const pages = readdirSync(dir).filter(f => f.endsWith('.html'))
  .filter(f => PILOT === 'ALL' || PILOT.includes(f)).sort();

let changed = 0;
for (const f of pages) {
  const p = join(dir, f);
  const html = readFileSync(p, 'utf8');

  const meta = html.match(CSP_META_RE);
  if (!meta) { console.log(`skip  ${f} (no CSP meta)`); continue; }
  if (/script-src[^;]*'sha256-/.test(meta[2])) { console.log(`skip  ${f} (already hashed)`); continue; }

  const blockHashes = [...html.matchAll(INLINE_SCRIPT_RE)].map(m => sha256(m[1]));
  const handlerValues = [...html.matchAll(HANDLER_RE)].map(m => decodeEntities(m[2] ?? m[3] ?? ''));
  const handlerHashes = [...new Set(handlerValues.map(v => sha256(v)))];

  const tokens = [
    ...new Set(blockHashes),
    ...(handlerHashes.length ? ["'unsafe-hashes'", ...handlerHashes] : []),
  ];
  if (!tokens.length) { console.log(`clean ${f} (no inline script at all)`); continue; }

  const newContent = meta[2].replace(/script-src ([^;]*)/, (_, srcs) => `script-src ${srcs.trimEnd()} ${tokens.join(' ')}`);
  writeFileSync(p, html.replace(CSP_META_RE, `$1${newContent}$3`));
  console.log(`hash  ${f}: ${blockHashes.length} block(s), ${handlerHashes.length} handler hash(es)`);
  changed++;
}
console.log(`\nCSP hashes injected into ${changed}/${pages.length} pilot page(s).`);
