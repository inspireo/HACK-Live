# PR1 actual browser evidence

These are actual Playwright Chromium recordings against deterministic synthetic Firebase Auth/Firestore emulators, recorded 2026-11-12. They contain no production data, live Google consent, or real-device/mobile claims. They are short automated journeys; pause/replay to inspect each step.

- [Sign in once and reuse registration](pr1-sign-in-reuse.webm): delivered-emulator email verification, destination retained, minimal profile, first event, rejoin, prefilled second event, another member's profile, own name edit, social-profile deletion. The separate fresh-browser login runs while the first context stays open.
- [Fresh device context](pr1-fresh-device.webm): independent empty browser storage signs into the same permanent account and resumes its existing event registration, with no second participant record.
- [Workshop regression](pr1-workshop-team-display.webm): event-code join, actual challenge selection, actual team formation/finalization/naming writes, existing projector screen, and social-profile deletion retaining organizer access.

All recordings are committed so repository reviewers can use GitHub's **View raw / Download** to play them. CI also uploads successful videos in `pr1-emulator-browser-evidence` for 14 days. The fourth browser journey (single/bulk publishing and attribution deletion) is included in CI recordings.

Reproduce: `npm ci`, `npx playwright install chromium`, `npm run typecheck`, `npm run build`, `npm run test:emulators`, then `node scripts/collect-demo.mjs`. The collection script refuses a failed browser run. Local result: **15 emulator authorization/integrity tests and four Chromium browser journeys passed**. Test source and fixture details: [identity-pr1.md](../identity-pr1.md).
