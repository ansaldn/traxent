// ── "Traxent is open" — prelaunch announcement to the waitlist ──────────────
// Renders both the HTML and the plain-text alternative. Nothing here sends;
// see create-broadcast.mjs and test-send.mjs.

import { marketingLayout, headline, button, rule, priceRow, esc, BRAND, UNSUB_TOKEN } from './email-layout.mjs';
import { POSTAL_ADDRESS, link } from './campaign.config.mjs';

// Inline hrefs must be HTML-escaped (`&` → `&amp;`) — button() already does this
// internally, so this is only for links written directly into body markup.
const href = (path) => esc(link(path));

export const SUBJECT = 'Traxent is open — lock in your founding price';
export const PREHEADER = 'You joined the waitlist. It’s live: join free, no card, and keep today’s price for as long as you stay subscribed.';

const p = (html, extra = '') =>
  `<p style="margin:0 0 15px;${extra}">${html}</p>`;

const muted = (html) =>
  `<p style="margin:0 0 15px;color:${BRAND.muted};font-size:13.5px;line-height:1.6;">${html}</p>`;

export function renderPrelaunchHtml({ unsubHref = UNSUB_TOKEN } = {}) {
  const bodyHtml = [
    headline(`Traxent is <span style="color:${BRAND.green};">open</span>.`),

    p(`You joined the waitlist to hear the moment we opened. This is that email.`),

    p(`Traxent is in <strong>prelaunch</strong> — the platform is live and taking founding members. You can create your account today, free, with no card.`),

    button(link('/signup'), 'Create your free account'),

    rule(),

    `<h2 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:19px;margin:0 0 12px;color:${BRAND.ink};">A quick reminder of what you signed up for</h2>`,

    p(`Most traders pay £100–£500 for a prop firm challenge before they're ready, then fail on a rule they didn't know they were breaking.`),

    p(`Traxent teaches you to trade across <strong>10 modules</strong>, then connects to your real trading account — MetaTrader&nbsp;4 &amp; 5, cTrader or TradingView, <strong>read-only</strong> — and scores your actual trades against the published rules of <strong>at least 16 prop firms</strong>. You find out which challenge you'd pass <em>before</em> you pay the evaluation fee.`),

    rule(),

    `<h2 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:19px;margin:0 0 6px;color:${BRAND.ink};">Your founding price, locked</h2>`,

    p(`Whatever a plan costs the day you subscribe is the price you keep — protected from every future rise, for as long as you stay subscribed to that plan.`),

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border-collapse:collapse;">
      ${priceRow('Observer', '£4.99/mo', 'Delayed data, pattern school, position sizing')}
      ${priceRow('Challenger', '£12.99/mo', 'Live data, full readiness tracker, real-trade sync')}
      ${priceRow('Funded Trader', '£29.99/mo', 'Up to 3 accounts, funded-phase tracking, Go-Live')}
     </table>`,

    muted(`Joining costs nothing and reserves your price — you only pay if and when you choose a paid plan. Full details in the <a href="${href('/founding-terms')}" style="color:${BRAND.green};">price-lock terms</a>.`),

    rule(),

    p(`Not ready to pick a plan? <a href="${href('/learn-101')}" style="color:${BRAND.green};font-weight:600;">Trading 101 is free and needs no account</a> — seven lessons from the very beginning, no prior knowledge assumed.`),

    muted(`One honest note: prelaunch means exactly that. The platform works and we've tested it hard, but you're early — if something breaks or feels wrong, reply to this email and it lands with us directly. That feedback is most of the reason we're opening this way.`),

    `<p style="margin:22px 0 0;">— David<br><span style="color:${BRAND.muted};font-size:13px;">Founder, Traxent</span></p>`,
  ].join('\n');

  return marketingLayout({
    title: 'Traxent is open',
    preheader: PREHEADER,
    postalAddress: POSTAL_ADDRESS,
    bodyHtml,
    unsubHref,
  });
}

export function renderPrelaunchText({ unsubHref = UNSUB_TOKEN } = {}) {
  return `TRAXENT IS OPEN

You joined the waitlist to hear the moment we opened. This is that email.

Traxent is in prelaunch — the platform is live and taking founding
members. You can create your account today, free, with no card.

Create your free account: ${link('/signup')}

────────────────────────────────────────

A QUICK REMINDER OF WHAT YOU SIGNED UP FOR

Most traders pay £100–£500 for a prop firm challenge before they're
ready, then fail on a rule they didn't know they were breaking.

Traxent teaches you to trade across 10 modules, then connects to your
real trading account — MetaTrader 4 & 5, cTrader or TradingView,
read-only — and scores your actual trades against the published rules
of at least 16 prop firms. You find out which challenge you'd pass
before you pay the evaluation fee.

────────────────────────────────────────

YOUR FOUNDING PRICE, LOCKED

Whatever a plan costs the day you subscribe is the price you keep —
protected from every future rise, for as long as you stay subscribed
to that plan.

  Observer       £4.99/mo   Delayed data, pattern school, position sizing
  Challenger    £12.99/mo   Live data, full readiness tracker, real-trade sync
  Funded Trader £29.99/mo   Up to 3 accounts, funded-phase tracking, Go-Live

Joining costs nothing and reserves your price — you only pay if and
when you choose a paid plan.
Price-lock terms: ${link('/founding-terms')}

────────────────────────────────────────

Not ready to pick a plan? Trading 101 is free and needs no account —
seven lessons from the very beginning, no prior knowledge assumed:
${link('/learn-101')}

One honest note: prelaunch means exactly that. The platform works and
we've tested it hard, but you're early — if something breaks or feels
wrong, reply to this email and it lands with us directly. That feedback
is most of the reason we're opening this way.

— David
Founder, Traxent

────────────────────────────────────────

You're receiving this because you joined the Traxent waitlist.
Unsubscribe: ${unsubHref}

© ${new Date().getFullYear()} Traxent is provided and licensed by Akpan
Holdings Limited, registered in England & Wales.
${POSTAL_ADDRESS}

Traxent is an educational platform. Nothing here is financial advice.
Trading involves risk.
`;
}
