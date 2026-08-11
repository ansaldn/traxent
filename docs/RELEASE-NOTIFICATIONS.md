# Release notifications — design for announcing new features & modules

*Drafted 2026-08-11. Status: design + partial build. The email half can run
today; the push half is dormant until the APNs key exists (Apple account
pending approval).*

## What this is

When Traxent ships something users should hear about — a new learning module,
a new firm, a feature like sim-journal sync on iPhone — one release should
fan out to every channel the user has consented to:

```
                        ┌─ Email (Resend broadcast) ── subscribers with status `subscribed`
release announcement ───┤
                        └─ Push (APNs)              ── devices with pushOptIn=true
                                                       AND (for marketing pushes)
                                                       user marketing status `subscribed`
```

## What already exists (don't rebuild)

| Piece | Where | State |
|---|---|---|
| Subscribers table + consent basis + `locked` bounce flow | `backend/marketing/` + `TraxentSubscribers` | **Live** |
| Broadcast tooling (segmented sends, preview, test-send) | `backend/marketing/resend.mjs` etc. | **Live** |
| Device-token registry `POST /user/device` (`DEVICE#<token>` rows, `pushOptIn`) | user-data Lambda | **Live** (route shipped 2026-08-11; iOS posts tokens on launch) |
| APNs sender Lambda | `backend/user-data/functions/push-sender/` | **Scaffold — NOT deployed.** Blocked on APNs key → SSM `/traxent/apns/key`, `key_id`, `team_id` |
| GDPR purge of device tokens | delete-account Lambda | **Live** (purge removes every row under the userId) |
| Content catalog auto-publish | deploy.yml → `src/content/modules.json` | **Live** — iOS picks up lesson changes on next app launch, no App Store release |

## The release flow (proposed)

1. **Author a release note** in `backend/marketing/releases/<date>-<slug>.json`:
   ```json
   {
     "slug": "trading-101-refresh",
     "title": "New: smarter quizzes across every module",
     "emailSubject": "Your quizzes just got smarter",
     "emailBodyHtml": "…",
     "push": { "title": "New on Traxent", "body": "Every module quiz is now a real test — fresh questions each attempt.", "url": "https://traxent.io/learn" },
     "audience": "subscribed",
     "channels": ["email", "push"]
   }
   ```
2. **Send** with one command (extend the existing marketing CLI):
   `node backend/marketing/send-release.mjs releases/<file>.json`
   - Email: existing Resend broadcast path, segmented to `subscribed`.
   - Push: invoke `push-sender` with `{title, body, url}`. The sender itself
     enforces `pushOptIn`; for `audience: "subscribed"` the caller must join
     device rows to the subscribers table and pass only qualifying users.
3. **Log the send** (slug, timestamp, counts) back into the release file — a
   release can only be sent once unless `--force`.

### Consent rules (non-negotiable)
- **Marketing pushes** (new features, new modules, offers): require BOTH the
  iOS push toggle (`pushOptIn`) AND marketing status `subscribed`. Apple
  rejects marketing pushes without explicit consent (App Review 4.5.4), and
  UK PECR applies to the email side.
- **Transactional pushes** (e.g. "your weekly readiness report is ready"):
  `pushOptIn` alone is enough.
- Unsubscribe/opt-out paths already exist (`/account` marketing toggle → email;
  iOS toggle → push) and must be honoured within one send cycle.
- Dead tokens: APNs `410 Unregistered` responses should delete the DEVICE row
  (the sender scaffold surfaces them; wire the delete when activating).

### When a new module ships, specifically
The deploy pipeline already regenerates `modules.json` automatically, so iOS
users get the CONTENT silently. The ANNOUNCEMENT stays a deliberate, human
action (send the release file) — content deploys are frequent and small; only
genuinely announce-worthy releases should notify. If we ever want automation,
the hook point is the deploy step diffing `modules.json` module count/ids and
drafting (not sending) a release file.

## Activation checklist (in order)
1. David: Apple Developer account approved → Keys → create APNs key →
   `aws ssm put-parameter --name /traxent/apns/key --type SecureString --value "$(cat AuthKey_XXX.p8)" --region eu-west-2`
   (+ `key_id`, `team_id` as String params).
2. Wire `push-sender` into `backend/user-data/template.yaml` (DynamoDB read on
   TraxentUserData + SSM read on `traxent/*`; no API route — invoked directly).
3. Build `send-release.mjs` (join devices ↔ subscribers, call sender, log).
4. Test: sandbox APNs host first (`APNS_HOST=https://api.sandbox.push.apple.com`),
   one real device, then production host.

---

# Appendix: quiz/test policy (adopted 2026-08-11)

Product rule, mirrored on iOS and web — quizzes are TESTS of knowledge, not a
click-through:

- **Pass mark 75%.** A module's quiz key (`lN-quiz`) is only marked complete —
  and the module can only reach 100% — on a score ≥ 75%.
- **Question banks, not fixed papers.** Each module quiz holds a bank of
  10-12 authored questions. Every attempt samples up to 5, shuffles question
  order AND answer positions. A retake generates a fresh paper.
- **Varied answer counts.** Questions deliberately vary between 3, 4 and 5
  options so papers don't feel uniform.
- **In-lesson exercises** offer "Try again" only after a wrong answer;
  authored variants per concept rotate on retry (iOS adopts once any lesson
  ships variants).
- **Formats are frozen for the extractor**: `QUESTIONS` / `QS` arrays in
  modules 1-6, static `.q` markup in the starters. The extractor passes whole
  banks through to `modules.json`; iOS runs the same sample-and-shuffle rules
  against the same banks.
