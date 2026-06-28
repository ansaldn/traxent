// Provider-agnostic normalisation helpers. Each provider adapter maps its raw
// closed-trade payload into the common Traxent trade shape (see README.md), so the
// readiness/scoring engine never has to know which broker the data came from.
//
// This is scaffolding: adapters/<provider>.mjs (ctrader, mt, tradovate, ninjatrader,
// rithmic) implement fetch + map against the live provider APIs once credentials exist.

/**
 * @typedef {Object} NormalisedTrade
 * @property {string} tradeId
 * @property {string} connId
 * @property {string} symbol
 * @property {'long'|'short'} side
 * @property {string} openedAt  ISO 8601
 * @property {string} closedAt  ISO 8601
 * @property {number} qty
 * @property {number} entry
 * @property {number} exit
 * @property {number} pnl
 * @property {number} fees
 * @property {number} [balanceAfter]
 */

/** Build a DynamoDB item for a normalised trade. */
export function tradeItem(userId, t) {
  return {
    userId,
    sk: `TRADE#${t.connId}#${t.tradeId}`,
    ...t,
    _type: 'trade',
  };
}

/** Build a DynamoDB item for an end-of-day equity point (drives drawdown maths). */
export function equityItem(userId, connId, date, equity) {
  return {
    userId,
    sk: `EQUITY#${connId}#${date}`,
    connId,
    date,
    equity,
    _type: 'equity',
  };
}

/** Validate a normalised trade before persisting; returns an array of problems (empty = ok). */
export function validateTrade(t) {
  const problems = [];
  const req = ['tradeId', 'connId', 'symbol', 'side', 'openedAt', 'closedAt', 'qty', 'entry', 'exit', 'pnl'];
  for (const k of req) if (t[k] === undefined || t[k] === null) problems.push(`missing ${k}`);
  if (t.side && !['long', 'short'].includes(t.side)) problems.push(`bad side: ${t.side}`);
  return problems;
}

/** Reduce normalised trades into a daily equity curve when the provider only gives per-trade balances. */
export function deriveEquityCurve(trades) {
  const byDay = {};
  for (const t of trades) {
    if (typeof t.balanceAfter !== 'number') continue;
    const day = (t.closedAt || '').slice(0, 10);
    if (!day) continue;
    // last balance of the day wins
    byDay[day] = t.balanceAfter;
  }
  return byDay; // { 'yyyy-mm-dd': equity }
}
