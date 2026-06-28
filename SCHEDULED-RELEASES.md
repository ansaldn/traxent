# Scheduled releases & feature flags

Two ways to make content appear at a specific time on the Traxent static site.

| Use this when... | Mechanism | Is the content live before the time? |
| --- | --- | --- |
| The content must NOT exist publicly until launch (embargo, dated drop, page swap) | **Scheduled publish** (cron + `staged/`) | No — it sits in `staged/`, outside `src/`, so it never deploys early |
| The content can ship in source but should only *reveal* at a time (banner, promo, soft launch) | **Client-side feature flag** (`src/flags.json` + `src/flags.js`) | Yes — the markup/JS is public; only the toggle is timed |

Both rely on the existing deploy: any push to `main` runs `.github/workflows/deploy.yml`, which syncs `src/` to S3 and invalidates CloudFront. Anything in `src/` is live after a push; anything outside `src/` is not deployed.

---

## 1. Scheduled publish (truly not live until due)

**Pieces:**
- `staged/` — staging area, **outside `src/`**, so files here are never deployed.
- `scheduled-releases.json` — the queue (an array of entries) at repo root.
- `scripts/scheduled-release.mjs` — copies due files into `src/` and updates the queue.
- `.github/workflows/scheduled-release.yml` — runs the script every 15 min, commits + pushes if anything published.

### Schedule a NEW page to launch

1. **Add the page to `staged/`.** Copy the sample and edit it:
   - File: `staged/my-launch.html`
   - It must be well-formed: end in `</html>` with balanced `<script>...</script>` tags, or `deploy.yml`'s HTML integrity check will fail once it lands in `src/`.
2. **Add a manifest entry** to `scheduled-releases.json`:
   ```json
   {
     "id": "my-launch-2026-07",
     "source": "staged/my-launch.html",
     "dest": "src/my-launch.html",
     "publishAt": "2026-07-01T13:00:00Z",
     "published": false,
     "publishedAt": null,
     "description": "Summer feature launch page."
   }
   ```
   - `publishAt` is **UTC, ISO-8601**. (e.g. 9:00 AM London summer time = `08:00:00Z`.)
   - `id` must be unique; keep `published: false` and `publishedAt: null`.
3. **Commit and push** `staged/my-launch.html` + the manifest to `main`.
   - This push deploys `src/` as usual but your page is in `staged/`, so it stays hidden.
4. **Wait.** At/after `publishAt`, the cron run copies `staged/my-launch.html` → `src/my-launch.html`, flips `published: true`, stamps `publishedAt`, and the bot pushes that commit. That push triggers `deploy.yml`, which ships the page. Live at `https://traxent.io/my-launch.html`.

### Schedule a SWAP of an existing page

Same as above, but point `dest` at the path you want to overwrite:

```json
{
  "id": "homepage-refresh-2026-07",
  "source": "staged/index-v2.html",
  "dest": "src/index.html",
  "publishAt": "2026-07-01T13:00:00Z",
  "published": false,
  "publishedAt": null,
  "description": "Swap homepage to the v2 design at launch."
}
```

Stage the **new** version under `staged/` and set `dest` to the existing `src/` file. When due, the script overwrites `src/index.html` and the deploy ships it. (Want a rollback? Keep the old file staged too, with a later/no `publishAt`, and publish it manually via `workflow_dispatch` if needed — or just revert the bot's commit.)

### Publish immediately / test

Run the **Scheduled Release** workflow manually from the Actions tab (`workflow_dispatch`). Any entry whose `publishAt` is already in the past publishes on that run. To dry-run locally (no commit): `node scripts/scheduled-release.mjs` from the repo root.

### Timing & cadence

- The cron is `*/15 * * * *` (every 15 minutes, UTC). So `publishAt` effectively **rounds up to the next quarter hour**, and GitHub may add a few minutes of delay under load. Treat `publishAt` as "no earlier than", not exact.
- To change cadence, edit the `cron:` line in `.github/workflows/scheduled-release.yml` (e.g. `*/5 * * * *` for every 5 min). Finer crons cost more Actions minutes and GitHub still throttles very frequent schedules.

### Good to know

- The script is **idempotent and defensive**: already-published and not-yet-due entries are skipped; a single malformed entry is warned-and-skipped, never fatal; it always exits 0 so the cron never goes red over a content typo.
- If nothing is due, **no commit is made** (no empty-commit noise).
- Published entries stay in the manifest as an audit log (`published: true`, `publishedAt` set). Leave them; the script ignores them.

---

## 2. Client-side feature flag (soft reveal)

Use for content that can live in `src/` but should only *appear* at a time — banners, promos, soft launches. **Public by design:** `flags.json` ships to the browser, so never gate anything secret on it.

**Pieces:** `src/flags.json` (the toggles) and `src/flags.js` (the helper). Both deploy normally.

### Define a flag

Edit `src/flags.json`:

```json
{
  "summerPromo": { "enabled": false, "launchAt": "2026-07-01T13:00:00Z" }
}
```

A flag is ON when `enabled === true` **or** when `launchAt` is set and that UTC time has passed. Set `enabled: true` to force-on immediately; set `launchAt` for a timed reveal; both `false`/`null` keeps it off.

### Use it on a page

```html
<script src="/flags.js"></script>
<script>
  (async () => {
    await TraxentFlags.load();              // fetch + cache /flags.json
    if (TraxentFlags.isEnabled('summerPromo')) {
      // reveal the gated UI
    }
  })();
</script>
```

If `flags.json` fails to load, every flag is treated as **off** (fail-closed) and `load()` won't throw.

### Flip a flag

Edit `src/flags.json`, commit, push. `deploy.yml` ships it. Because `flags.json` is uploaded `no-cache`-free but the page reads it client-side, set a reasonable cache expectation: it syncs with a long cache in pass 1 of `deploy.yml`, so for a precise timed reveal prefer `launchAt` (evaluated live in the browser against the client clock) over flipping `enabled` and relying on cache expiry. The CloudFront invalidation on each deploy clears the edge cache.

> Note: because the reveal is evaluated against the **visitor's clock**, a wrong client time can reveal early/late. For hard embargoes use the **scheduled publish** mechanism instead.
