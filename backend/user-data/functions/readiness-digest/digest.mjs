// ── Weekly readiness digest — shaping and rendering ─────────────────────────
// Pure functions, no AWS, so the interesting logic can be tested directly.
//
// The product decision this file encodes: a weekly email that only ever says
// "well done, keep going" gets ignored within a month. The whole reason someone
// pays for readiness scoring is to be told what is going wrong while there is
// still time to fix it. So the digest leads with the single most useful thing
// it can find, and if the honest answer is "you did nothing this week", it says
// that plainly rather than dressing it up.

const BRAND = {
  green: '#0a6e4f', greenBright: '#1a9e72', ink: '#0e0e0c',
  cream: '#f7f6f2', muted: '#6b7280', line: '#eceae3',
  warn: '#b06000', bad: '#9e1a1a',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pct = (n) => `${Math.round(n)}%`;

/**
 * Reduce a week of raw rows into the handful of facts worth emailing.
 *
 * @param {object[]} items  TraxentUserData rows for one user
 * @param {Date} now
 */
export function summarise(items, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 864e5).toISOString();

  const trades = items.filter((i) => String(i.sk ?? '').startsWith('TRADE#'));
  const thisWeek = trades.filter((t) => (t.closedAt ?? t.createdAt ?? '') >= weekAgo);
  const lastWeek = trades.filter((t) => {
    const d = t.closedAt ?? t.createdAt ?? '';
    return d >= twoWeeksAgo && d < weekAgo;
  });

  const progress = items.find((i) => i.sk === 'PROGRESS')?.data ?? {};
  const lessonsDone = Object.values(progress).filter(Boolean).length;

  const wins = thisWeek.filter((t) => Number(t.pnl ?? 0) > 0).length;
  const losses = thisWeek.filter((t) => Number(t.pnl ?? 0) < 0).length;
  const net = thisWeek.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const winRate = thisWeek.length ? (wins / thisWeek.length) * 100 : null;
  const lastWinRate = lastWeek.length
    ? (lastWeek.filter((t) => Number(t.pnl ?? 0) > 0).length / lastWeek.length) * 100
    : null;

  // Worst single day — the number that predicts a blown drawdown rule better
  // than a weekly total does, because prop firms measure daily.
  const byDay = {};
  for (const t of thisWeek) {
    const d = String(t.closedAt ?? t.createdAt ?? '').slice(0, 10);
    if (d) byDay[d] = (byDay[d] ?? 0) + Number(t.pnl ?? 0);
  }
  const worstDay = Object.entries(byDay).sort((a, b) => a[1] - b[1])[0] ?? null;

  return {
    tradeCount: thisWeek.length,
    lastWeekCount: lastWeek.length,
    wins, losses, net,
    winRate,
    winRateDelta: winRate !== null && lastWinRate !== null ? winRate - lastWinRate : null,
    worstDay: worstDay ? { date: worstDay[0], pnl: worstDay[1] } : null,
    tradingDays: Object.keys(byDay).length,
    lessonsDone,
    active: thisWeek.length > 0,
  };
}

/**
 * The one thing worth saying this week.
 *
 * Ordered by what actually helps, not by what flatters. A quiet week is called
 * a quiet week — pretending otherwise is how these emails lose credibility and
 * start getting filtered.
 */
export function headline(s) {
  if (!s.active && s.lastWeekCount === 0) {
    return {
      tone: 'quiet',
      title: 'A quiet week',
      body: 'No trades logged in the last seven days. That is completely fine — but the readiness score only means something once it has trades to read. Even a handful of sim trades this week would give you a number worth looking at.',
    };
  }
  if (!s.active) {
    return {
      tone: 'quiet',
      title: 'Nothing logged this week',
      body: `You logged ${s.lastWeekCount} trade${s.lastWeekCount === 1 ? '' : 's'} the week before and none this week. Consistency is one of the things prop firms actually measure, so it is worth getting back to it.`,
    };
  }
  // "One bad day did the damage" means the worst day's loss is at least as big
  // as the whole week's result — i.e. without that day you'd be flat or ahead.
  //
  // The first version compared |worstDay| to |net| * 1.5, which can essentially
  // never be true: when one day IS the damage, |worstDay| ≈ |net|, so the ratio
  // sits near 1. It silently never fired. Needs two or more trading days, or a
  // single-day week satisfies it trivially.
  if (s.worstDay && s.worstDay.pnl < 0 && s.tradingDays > 1
      && Math.abs(s.worstDay.pnl) >= Math.abs(s.net)) {
    return {
      tone: 'warn',
      title: 'One bad day did most of the damage',
      body: `Your worst day was ${s.worstDay.date}, at ${s.worstDay.pnl.toFixed(2)}. That single day outweighs the rest of the week combined. Daily drawdown is the rule most challenges fail on — it is worth looking at what was different about that session.`,
    };
  }
  if (s.winRateDelta !== null && s.winRateDelta <= -15) {
    return {
      tone: 'warn',
      title: 'Your win rate dropped this week',
      body: `Down ${pct(Math.abs(s.winRateDelta))} on last week, to ${pct(s.winRate)}. One week is not a trend, but it is worth a look before it becomes one.`,
    };
  }
  if (s.winRateDelta !== null && s.winRateDelta >= 15) {
    return {
      tone: 'good',
      title: 'Your win rate improved',
      body: `Up ${pct(s.winRateDelta)} on last week, to ${pct(s.winRate)}. Worth noting what you did differently, while it is still fresh.`,
    };
  }
  return {
    tone: 'neutral',
    title: `${s.tradeCount} trade${s.tradeCount === 1 ? '' : 's'} logged`,
    body: `A steady week: ${s.wins} up, ${s.losses} down${s.winRate !== null ? `, a ${pct(s.winRate)} win rate` : ''}. Consistency like this is what challenges are actually testing for.`,
  };
}

export const subjectFor = (s, h) =>
  s.active ? `Your week: ${s.tradeCount} trade${s.tradeCount === 1 ? '' : 's'} — ${h.title}`
           : 'Your Traxent week';

export function renderDigest({ summary, head, unsubHref, postalAddress }) {
  const toneColour = { warn: BRAND.warn, bad: BRAND.bad, good: BRAND.green, quiet: BRAND.muted, neutral: BRAND.ink }[head.tone] ?? BRAND.ink;
  const year = new Date().getFullYear();

  const stat = (label, value, colour) => `
    <td style="padding:12px 8px;text-align:center;border:1px solid ${BRAND.line};border-radius:8px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:600;color:${colour ?? BRAND.ink};">${esc(value)}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${BRAND.muted};margin-top:2px;">${esc(label)}</div>
    </td>`;

  const statsRow = summary.active ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0" style="margin:4px 0 20px;">
      <tr>
        ${stat('Trades', summary.tradeCount)}
        ${stat('Win rate', summary.winRate === null ? '—' : pct(summary.winRate))}
        ${stat('Net', summary.net.toFixed(2), summary.net >= 0 ? BRAND.green : BRAND.bad)}
      </tr>
    </table>` : '';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Your Traxent week</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(head.title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};padding:32px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.line};">
   <tr><td style="background:${BRAND.ink};padding:22px 28px;">
     <span style="font-family:'Courier New',Courier,monospace;font-size:20px;color:#fff;">trax<span style="color:${BRAND.greenBright};">ent</span></span>
   </td></tr>
   <tr><td style="padding:30px 28px;font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;font-size:15px;line-height:1.65;">
     <div style="font-family:'Courier New',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:12px;">Your week</div>
     <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:25px;line-height:1.25;margin:0 0 12px;color:${toneColour};">${esc(head.title)}</h1>
     <p style="margin:0 0 20px;">${esc(head.body)}</p>
     ${statsRow}
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr><td style="border-radius:10px;background:${BRAND.green};">
       <a href="https://traxent.io/tracker" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px;">See your readiness score</a>
     </td></tr></table>
     <p style="margin:0;color:${BRAND.muted};font-size:13px;">${summary.lessonsDone} lesson${summary.lessonsDone === 1 ? '' : 's'} completed so far. <a href="https://traxent.io/learn" style="color:${BRAND.green};">Pick up where you left off</a>.</p>
   </td></tr>
   <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.65;">
     <p style="margin:0 0 8px;">You're getting this because it's included with your plan. <a href="${esc(unsubHref)}" style="color:${BRAND.green};text-decoration:underline;">Turn it off</a> any time — your account and billing emails aren't affected.</p>
     <p style="margin:0;">© ${year} Traxent™ is provided and licensed by Akpan Holdings Limited, registered in England &amp; Wales.${postalAddress ? `<br>${esc(postalAddress)}` : ''}<br>
       <span style="color:#9aa0a6;">Educational platform. Nothing here is financial advice. Sim results do not guarantee real performance.</span></p>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

export function renderDigestText({ summary, head, unsubHref }) {
  return `YOUR TRAXENT WEEK

${head.title.toUpperCase()}

${head.body}
${summary.active ? `
  Trades:   ${summary.tradeCount}
  Win rate: ${summary.winRate === null ? '—' : pct(summary.winRate)}
  Net:      ${summary.net.toFixed(2)}
` : ''}
See your readiness score: https://traxent.io/tracker

${summary.lessonsDone} lesson${summary.lessonsDone === 1 ? '' : 's'} completed so far.
Pick up where you left off: https://traxent.io/learn

────────────────────────────────────────

You're getting this because it's included with your plan.
Turn it off any time — account and billing emails aren't affected:
${unsubHref}
`;
}
