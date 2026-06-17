# traxentApp

Mobile apps for **Traxent** — Day Trading Training Application.

## Platforms

| Platform | Tech | Status |
|----------|------|--------|
| iOS / iPadOS | Swift / SwiftUI (Xcode) | In development |
| Android | Flutter (planned) | Not started |

## Structure

```
traxentApp/
├── ios/          # Xcode project (Traxent.xcodeproj lives here)
├── android/      # Future Flutter app
├── docs/         # Architecture notes, API contracts
└── SETUP.md      # First-time setup guide
```

## Backend

The mobile apps consume the same API as the Traxent web app. API base URLs and keys
go in `ios/Config/` xcconfig files — never hard-code secrets, never commit
`*.xcconfig.local`.

## Branching

- `main` — release-ready, protected
- `develop` — integration branch
- `feature/<name>` — feature work, PR into develop

## Deployment

iOS ships via TestFlight → App Store (Xcode Cloud or GitHub Actions + fastlane).
See SETUP.md.
