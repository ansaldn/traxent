// ── Traxent branded MARKETING email layout ──────────────────────────────────
// Shares the visual language of the transactional layout in
// backend/functions/stripe-webhook/email.mjs, but adds the two things a
// marketing email legally needs and a transactional one does not:
//
//   1. An unsubscribe link  — Resend injects {{{RESEND_UNSUBSCRIBE_URL}}}
//                             when the HTML is sent as a Broadcast.
//   2. The sender's postal address (PECR / CAN-SPAM / UK GDPR identity).
//
// Table-based with inline CSS so it renders in Outlook / Gmail / Apple Mail.
// No dependencies — this file is plain ESM and runs on Node 18+.

export const BRAND = {
  green: '#0a6e4f',
  greenBright: '#1a9e72',
  ink: '#0e0e0c',
  cream: '#f7f6f2',
  muted: '#6b7280',
  line: '#eceae3',
};

// Resend replaces this token with a per-recipient unsubscribe URL at send time.
// It MUST survive into the final HTML untouched (do not run it through esc()).
export const UNSUB_TOKEN = '{{{RESEND_UNSUBSCRIBE_URL}}}';

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the branded marketing shell.
 *
 * @param {object}  o
 * @param {string}  o.title          <title> and accessible document name
 * @param {string}  o.bodyHtml       pre-rendered inner HTML
 * @param {string}  o.preheader      inbox preview text (hidden in the body)
 * @param {string}  o.postalAddress  registered address of the sender — REQUIRED
 * @param {string} [o.unsubHref]     override the unsubscribe href (for previews)
 */
export function marketingLayout({ title, bodyHtml, preheader = '', postalAddress, unsubHref = UNSUB_TOKEN }) {
  if (!postalAddress || /REPLACE|TODO/i.test(postalAddress)) {
    throw new Error(
      'postalAddress is required and must be a real registered address. ' +
      'Set POSTAL_ADDRESS in backend/marketing/campaign.config.mjs before rendering.'
    );
  }
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</span>
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};padding:32px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.line};">

   <tr><td style="background:${BRAND.ink};padding:22px 28px;">
     <span style="font-family:'Courier New',Courier,monospace;font-size:20px;color:#ffffff;letter-spacing:-0.5px;">trax<span style="color:${BRAND.greenBright};">ent</span></span>
   </td></tr>

   <tr><td style="padding:34px 28px;font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>

   <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.65;">
     <p style="margin:0 0 10px;">
       <a href="https://traxent.io" style="color:${BRAND.green};text-decoration:none;">traxent.io</a>
       &nbsp;·&nbsp; <a href="https://traxent.io/privacy" style="color:${BRAND.green};text-decoration:none;">Privacy</a>
       &nbsp;·&nbsp; <a href="https://traxent.io/terms" style="color:${BRAND.green};text-decoration:none;">Terms</a>
       &nbsp;·&nbsp; <a href="https://traxent.io/security" style="color:${BRAND.green};text-decoration:none;">Security</a>
     </p>
     <p style="margin:0 0 10px;">
       You're receiving this because you joined the Traxent waitlist.
       <a href="${unsubHref}" style="color:${BRAND.green};text-decoration:underline;">Unsubscribe</a> at any time — one click, no questions.
     </p>
     <p style="margin:0;">
       © ${year} Traxent™ is provided and licensed by Akpan Holdings Limited, registered in England &amp; Wales.<br>
       ${esc(postalAddress)}<br>
       <span style="color:#9aa0a6;">Traxent is an educational platform. Nothing here is financial advice. Trading involves risk.</span>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body>
</html>`;
}

export function headline(html) {
  return `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;margin:0 0 16px;color:${BRAND.ink};">${html}</h1>`;
}

export function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;"><tr><td style="border-radius:10px;background:${BRAND.green};">
  <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
 </td></tr></table>`;
}

export function rule() {
  return `<div style="height:1px;line-height:1px;font-size:0;background:${BRAND.line};margin:28px 0;">&nbsp;</div>`;
}

/** A single pricing row: name, price, one-line description. */
export function priceRow(name, price, note) {
  return `<tr>
   <td style="padding:9px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1c1c1a;border-bottom:1px solid ${BRAND.line};">
     <strong style="color:${BRAND.ink};">${esc(name)}</strong><br>
     <span style="color:${BRAND.muted};font-size:13px;">${esc(note)}</span>
   </td>
   <td align="right" style="padding:9px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BRAND.green};white-space:nowrap;border-bottom:1px solid ${BRAND.line};">${esc(price)}</td>
  </tr>`;
}
