# traxentApp — Setup Guide

## 1. Prerequisites

- Apple Silicon Mac (M1+), macOS 26 Tahoe
- Xcode 26.3+ — App Store or https://developer.apple.com/xcode/
- Apple Developer account ($99/yr — required for TestFlight/App Store)
- Claude Pro/Max/Team plan (for Claude in Xcode)
- Git + a GitHub account

## 2. Enable the Claude agent in Xcode

1. Xcode → **Settings → Intelligence**
2. Select **Claude** → **Sign In** (opens browser, log in with your Anthropic account)
3. Approve the connection — green status dot means it's live
4. You now have the full Claude agent in Xcode: chat with your codebase, agentic
   edits, subagents, background tasks. Open it via the Coding Assistant sidebar.

## 3. Create the Xcode project

1. Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Settings:
   - Product Name: `Traxent`
   - Organization Identifier: e.g. `com.traxent` (bundle ID becomes `com.traxent.Traxent`)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Testing: Swift Testing
   - Storage: None (pick later — SwiftData if you want local persistence)
4. Save location: this repo's `ios/` folder
5. **Uncheck** "Create Git repository" — the repo root is `traxentApp/`, not `ios/`
6. Target both iPhone and iPad: project settings → General → Supported Destinations

## 4. Initialize Git and push to GitHub

From the `traxentApp/` folder:

```bash
git init
git add .
git commit -m "Initial scaffold: traxentApp iOS"
```

Create the GitHub repo (either on github.com → New repository → `traxentApp`,
private, no README since we have one), then:

```bash
git remote add origin git@github.com:<your-username>/traxentApp.git
git branch -M main
git push -u origin main
git checkout -b develop
git push -u origin develop
```

(If you have GitHub CLI: `gh repo create traxentApp --private --source=. --push`)

## 5. Xcode ↔ Git

Xcode has Git built in (Integrate menu / Source Control navigator) — commit,
branch, push from the IDE. Add your GitHub account under
Xcode → Settings → Accounts for PR/clone integration.

## 6. Deployment pipeline (when ready)

**Easiest: Xcode Cloud** — built into Xcode, connects to your GitHub repo,
builds on push, auto-delivers to TestFlight. Free tier: 25 compute hrs/month.
Set up: Xcode → Integrate → Xcode Cloud → Create Workflow.

Alternative: GitHub Actions + fastlane (more control, more setup).

Release flow: merge to `main` → build → TestFlight (beta testers) → App Store review.

## 7. Suggested first milestones

1. App shell: tab navigation, theming to match Traxent web
2. Auth against the existing Traxent backend
3. Core training features (read-only first)
4. Charts (Swift Charts is excellent for trading-style data)
5. Push notifications, widgets
