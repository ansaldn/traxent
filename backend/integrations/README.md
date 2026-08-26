# Traxent broker/platform integrations — backend spec

Read-only ingestion of a user's real trades so the readiness score runs on real fills
instead of self-reported sim data (strategic brief, Priority 1). This folder is the
**architecture + scaffolding**; live connectors need provider credentials (see
`Traxent_Membership_and_Integrations_Plan.docx`, §8) before they can be switched on.

## Principle
**Read-only, always.** Traxent reads closed trades + equity history to score them. It never
places orders or moves funds. This keeps provider approval simple and is the right user promise.

## Data model (extends the existing `TraxentUserData` DynamoDB table — no new table)
Single-table design, partition key `userId`, sort key `sk`:

> **This table reflects what the FIRST shipped connector (cTrader) actually
> writes — corrected 2026-08-26 (WB-026). The earlier draft proposed
> `TRADE#<connId>#<tradeId>` / `EQUITY#…`, which no shipped code uses; building a
> second connector against that draft would have produced an incompatible store.
> Match the keys below.**

| sk pattern | Item | Notes |
|---|---|---|
| `CONNECTION#<provider>` | a linked account | e.g. `CONNECTION#ctrader`. `{ accessToken, refreshToken, expiresAt, scope, updatedAt, lastSyncAt, lastSyncCount }`. Tokens ARE stored here (SSE-encrypted at rest); never returned by any GET. |
| `RTRADE#<dealId>` | one synced closed trade (a real fill, distinct from the sim journal's `TRADE#`) | `{ source, accountId, data: <normalised trade>, createdAt }`. See shape below. |
| _EQUITY# — not yet implemented._ | end-of-day balance/equity | Planned for trailing-vs-EOD drawdown maths; the cTrader sync does not write these yet. Add under a namespaced key (e.g. `REQUITY#<accountId>#<yyyy-mm-dd>`) when built. |

NOTE the deliberate split: `TRADE#` = the user's SIM journal (manual practice trades); `RTRADE#` = real synced fills from a connected platform. Keep them separate — they feed different views and must never be conflated.

### Normalised trade shape (provider-agnostic)
```json
{
  "tradeId": "string", "connId": "string", "symbol": "ES", "side": "long|short",
  "openedAt": "ISO", "closedAt": "ISO", "qty": 2,
  "entry": 5234.25, "exit": 5240.00, "pnl": 230.0, "fees": 4.2,
  "balanceAfter": 51230.0
}
```
Every provider adapter maps its raw fills into this shape (`adapters/<provider>.mjs`).

## Components (to build per provider, phase order in the Plan doc)
1. **OAuth/connect** — `GET /integrations/:provider/connect` → provider auth → callback stores a
   `CONNECTION#` item (tokens in SSM/Secrets Manager, never in DynamoDB).
2. **Ingest Lambda** — pulls new closed trades, normalises via the adapter, writes
   `RTRADE#<dealId>` items, updates `lastSyncAt`/`lastSyncCount` on the `CONNECTION#` row.
   Triggered on a schedule (EventBridge, every 6h) + on-demand `POST /user/<provider>/sync`.
   (Reference implementation: `backend/user-data/functions/ctrader-sync/index.mjs`.)
3. **Scoring** — the server-side readiness engine (move it off the client — see the IP doc) reads
   `RTRADE#` and runs each firm's exact drawdown maths, including retroactive
   "would your last 90 days have passed?".

## Plan limits (enforce server-side too, not just in the UI)
`observer:0 · challenger:1 · funded_ready:3 · enterprise:unlimited`. Reject a new `CONNECTION#`
when the user is at their tier limit.

## Provider rollout
Phase 1: cTrader (Open API, OAuth) · MetaTrader 4/5 (investor password or MetaApi-style connector).
Phase 2: Tradovate (REST + OAuth) · NinjaTrader.
Phase 3: Rithmic (R|API+, requires onboarding).

## SAM wiring (when phase 1 credentials exist)
Add a `TradeIngestFunction` + the `/integrations/*` routes to `backend/user-data/template.yaml`
(same HTTP API, same table via `DynamoDBCrudPolicy`), plus an EventBridge schedule. Keep provider
secrets in SSM under `/traxent/integrations/<provider>/*` and grant `ssm:GetParameter` on that path.
The frontend `integrations.html` already calls `/api/integrations/<provider>/connect` and flips a
per-provider `live` flag to `true` as each one is approved.
