// ── Instant invite email ────────────────────────────────────────────────────
// Sent the moment somebody enters their address on the site during prelaunch.
//
// This is TRANSACTIONAL, not marketing, and the distinction matters:
//   · it is the direct, expected response to an action they just took
//   · it goes to one person, triggered by them, within seconds
//   · it carries no promotional content beyond what they just asked for
// So it does not need the unsubscribe machinery a broadcast does. It still
// carries sender identity, because that costs nothing and inbox providers
// reward it.
//
// It is deliberately different from the prelaunch broadcast in
// backend/marketing/: that one goes to people who joined the old waitlist and
// have been waiting. This one goes to someone who is on the site *right now*
// and whose next click should be creating an account. Short, one link, no
// pricing table, no reintroduction of a product they are already looking at.

const BRAND = {
  green: '#0a6e4f', greenBright: '#1a9e72', ink: '#0e0e0c',
  cream: '#f7f6f2', muted: '#6b7280', line: '#eceae3',
};

const SITE = 'https://traxent.io';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Signup link, tagged so Plausible can attribute account creations to this email. */
export function signupLink(source) {
  const u = new URL('/signup', SITE);
  u.searchParams.set('utm_source', 'email');
  u.searchParams.set('utm_medium', 'transactional');
  u.searchParams.set('utm_campaign', 'instant-invite');
  if (source) u.searchParams.set('utm_content', source);
  return u.toString();
}

export const SUBJECT = 'Your Traxent invite — create your account';

export function renderInvite({ source, postalAddress } = {}) {
  const href = esc(signupLink(source));
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Your Traxent invite</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Create your account and lock in today's price — takes about a minute.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};padding:32px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.line};">

   <tr><td style="background:${BRAND.ink};padding:22px 28px;">
     <span style="font-family:'Courier New',Courier,monospace;font-size:20px;color:#ffffff;letter-spacing:-0.5px;">trax<span style="color:${BRAND.greenBright};">ent</span></span>
   </td></tr>

   <tr><td style="padding:32px 28px;font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;font-size:15px;line-height:1.65;">
     <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.2;margin:0 0 14px;color:${BRAND.ink};">You're in.</h1>

     <p style="margin:0 0 14px;">Thanks for joining. One step left — create your account and you're set up.</p>

     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${BRAND.green};">
       <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Create your free account</a>
     </td></tr></table>

     <p style="margin:0 0 14px;">It's free, there's no card, and it takes about a minute. Whatever a plan costs the day you subscribe is the price you keep, for as long as you stay subscribed.</p>

     <p style="margin:0 0 6px;color:${BRAND.muted};font-size:13px;">If the button doesn't work, paste this into your browser:</p>
     <p style="margin:0 0 20px;font-size:12.5px;word-break:break-all;"><a href="${href}" style="color:${BRAND.green};">${href}</a></p>

     <p style="margin:0;color:${BRAND.muted};font-size:13px;">Not ready yet? <a href="${SITE}/learn-101" style="color:${BRAND.green};">Trading 101 is free and needs no account</a> — start there and come back whenever.</p>
   </td></tr>

   <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.65;">
     <p style="margin:0 0 8px;">You're getting this because you asked for an invite at traxent.io. If that wasn't you, just ignore it — no account has been created.</p>
     <p style="margin:0;">
       © ${year} Traxent™ is provided and licensed by Akpan Holdings Limited, registered in England &amp; Wales.${postalAddress ? `<br>${esc(postalAddress)}` : ''}<br>
       <span style="color:#9aa0a6;">Educational platform. Nothing here is financial advice. Trading involves risk.</span>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

export function renderInviteText({ source, postalAddress } = {}) {
  const href = signupLink(source);
  return `YOU'RE IN.

Thanks for joining. One step left — create your account and you're set up.

Create your free account:
${href}

It's free, there's no card, and it takes about a minute. Whatever a plan
costs the day you subscribe is the price you keep, for as long as you
stay subscribed.

Not ready yet? Trading 101 is free and needs no account — start there
and come back whenever: ${SITE}/learn-101

────────────────────────────────────────

You're getting this because you asked for an invite at traxent.io.
If that wasn't you, just ignore it — no account has been created.

© ${new Date().getFullYear()} Traxent is provided and licensed by Akpan
Holdings Limited, registered in England & Wales.${postalAddress ? `\n${postalAddress}` : ''}

Educational platform. Nothing here is financial advice.
Trading involves risk.
`;
}

/**
 * Send the invite. Never throws — the signup is already saved, and failing to
 * send a follow-up email must not turn a successful signup into an error the
 * person sees.
 */
export async function sendInvite(apiKey, { to, from, replyTo, source, postalAddress }) {
  if (!apiKey || !to) return { sent: false, reason: 'no key or recipient' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from || 'Traxent <hello@traxent.io>',
        to: [to],
        subject: SUBJECT,
        html: renderInvite({ source, postalAddress }),
        text: renderInviteText({ source, postalAddress }),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = await res.json();
    return { sent: true, id: body?.id ?? null };
  } catch (e) {
    return { sent: false, reason: String(e?.message ?? e).slice(0, 200) };
  }
}
