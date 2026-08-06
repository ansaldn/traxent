#!/usr/bin/env node
// ── Render the prelaunch email to disk so you can open it in a browser ──────
//
//   node preview.mjs            → writes preview.html + preview.txt here
//
// Needs no API key and sends nothing. The unsubscribe link is swapped for a
// dummy so the preview is clickable; the real send uses Resend's token.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderPrelaunchHtml, renderPrelaunchText, SUBJECT, PREHEADER } from './prelaunch-email.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const unsubHref = 'https://example.com/unsubscribe-preview';

let html, text;
try {
  html = renderPrelaunchHtml({ unsubHref });
  text = renderPrelaunchText({ unsubHref });
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}

writeFileSync(join(here, 'preview.html'), html);
writeFileSync(join(here, 'preview.txt'), text);

console.log(`Subject:   ${SUBJECT}`);
console.log(`Preheader: ${PREHEADER}`);
console.log(`\nHTML  ${(html.length / 1024).toFixed(1)} KB → ${join(here, 'preview.html')}`);
console.log(`Text  ${(text.length / 1024).toFixed(1)} KB → ${join(here, 'preview.txt')}`);
if (html.length > 102400) {
  console.warn('\n⚠️  Over 102 KB — Gmail will clip this email. Trim the body.');
}
