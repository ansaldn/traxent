// ── Traxent branded transactional email (Resend) ────────────────────────────
// Sends via Resend's HTTP API using built-in fetch — no SDK dependency. The
// layout is table-based with inline CSS so it renders in Outlook/Gmail/Apple Mail.
// Inert if no API key is passed (so it's a no-op until /traxent/resend/api_key
// exists). Reusable: copy this file into any function that needs to send mail.

const FROM = process.env.EMAIL_FROM || 'Traxent <hello@traxent.io>';
const BRAND = { green: '#0a6e4f', greenBright: '#1a9e72', ink: '#0e0e0c', cream: '#f7f6f2', muted: '#6b7280', line: '#eceae3' };
const PLAN_LABELS = { observer: 'Observer', challenger: 'Challenger', funded_ready: 'Funded Trader' };

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Low-level send. Throws on a non-2xx so callers can log; callers that must not
// fail (e.g. the Stripe webhook) wrap this in their own try/catch.
export async function sendEmail(apiKey, { to, subject, html, replyTo }) {
  if (!apiKey || !to) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Shared branded shell ────────────────────────────────────────────────────
function layout({ title, bodyHtml, preheader = '' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.line};">
   <tr><td style="background:${BRAND.ink};padding:22px 28px;">
     <span style="font-family:'Courier New',monospace;font-size:20px;color:#ffffff;">trax<span style="color:${BRAND.greenBright};">ent</span></span>
   </td></tr>
   <tr><td style="padding:32px 28px;font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
   <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.6;">
     © ${year} Traxent — provided by Akpan Holdings Limited. Educational platform, not financial advice.<br>
     <a href="https://traxent.io" style="color:${BRAND.green};text-decoration:none;">traxent.io</a> · <a href="https://traxent.io/privacy" style="color:${BRAND.green};text-decoration:none;">Privacy</a> · <a href="https://traxent.io/terms" style="color:${BRAND.green};text-decoration:none;">Terms</a>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${BRAND.green};">
   <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr></table>`;
}

function headline(text) {
  return `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.2;margin:0 0 14px;color:${BRAND.ink};">${text}</h1>`;
}

// ── Specific emails ─────────────────────────────────────────────────────────
export function renderWelcome(plan) {
  const label = PLAN_LABELS[plan] || 'your new plan';
  return layout({
    title: 'Welcome to Traxent',
    preheader: `You're on ${label} — here's how to get started.`,
    bodyHtml:
      headline(`You're on <span style="color:${BRAND.green};">${esc(label)}</span>.`) +
      `<p style="margin:0 0 14px;">Thanks for subscribing — your plan is active and your account has been upgraded. Pick up right where you left off.</p>` +
      button('https://traxent.io/dashboard', 'Open your dashboard') +
      `<p style="margin:0;color:${BRAND.muted};font-size:13px;">Manage or cancel anytime from your <a href="https://traxent.io/account" style="color:${BRAND.green};">account page</a>. Questions? Just reply to this email.</p>`,
  });
}

export async function sendWelcomeEmail(apiKey, to, plan) {
  return sendEmail(apiKey, { to, subject: 'Welcome to Traxent', html: renderWelcome(plan), replyTo: 'hello@traxent.io' });
}
