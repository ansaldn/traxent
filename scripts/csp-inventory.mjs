#!/usr/bin/env node
// CSP Phase 1 — read-only inventory of what stands between us and dropping
// 'unsafe-inline'. Reports, per page: inline <script> blocks, inline event
// handlers, and hazard patterns that hash-based CSP can NOT cover (these need
// hand-fixing before that page is enforced).
//
// Usage: node scripts/csp-inventory.mjs [srcDir]   (default: src)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'src';
const HANDLER_RE = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi;
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const HAZARDS = [
  ['eval', /\beval\s*\(/],
  ['new-function', /new\s+Function\s*\(/],
  ['document-write', /document\.write/],
  ['string-timer', /set(?:Timeout|Interval)\s*\(\s*['"]/],
  ['javascript-url', /href\s*=\s*["']javascript:/i],
];

const pages = readdirSync(dir).filter(f => f.endsWith('.html')).sort();
const out = {};
let totalBlocks = 0, totalHandlers = 0, hazardPages = 0;

for (const f of pages) {
  const html = readFileSync(join(dir, f), 'utf8');
  const blocks = [...html.matchAll(INLINE_SCRIPT_RE)].length;
  const handlers = [...html.matchAll(HANDLER_RE)].length;
  const hazards = HAZARDS.filter(([, re]) => re.test(html)).map(([id]) => id);
  out[f] = { inlineScriptBlocks: blocks, inlineHandlers: handlers, hazards };
  totalBlocks += blocks; totalHandlers += handlers;
  if (hazards.length) hazardPages++;
}

writeFileSync(join(dir, '..', 'csp-inventory.json'), JSON.stringify(out, null, 2));
console.log('page                              blocks  handlers  hazards');
for (const [f, v] of Object.entries(out)) {
  console.log(`${f.padEnd(34)}${String(v.inlineScriptBlocks).padEnd(8)}${String(v.inlineHandlers).padEnd(10)}${v.hazards.join(',') || '-'}`);
}
console.log(`\nTOTALS: ${pages.length} pages, ${totalBlocks} inline blocks, ${totalHandlers} inline handlers, ${hazardPages} pages with hazards`);
console.log('Written: csp-inventory.json');
