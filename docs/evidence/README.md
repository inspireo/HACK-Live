# PR1 actual browser evidence

These are actual Playwright Chromium recordings against deterministic synthetic Firebase Auth/Firestore emulators, recorded 2026-11-12. They contain no production data, live Google consent, or real-device/mobile claims. The primary videos are paced at one-quarter speed (timestamps scaled 4x) for review: signup/reuse is 25.48 seconds and team/display is 21.64 seconds. Stream-copy retiming preserves every original encoded frame and step; no new frames or fabricated interactions are added. Fast originals remain in the successful Playwright test-results/CI artifact.

- [Sign in once and reuse registration](pr1-sign-in-reuse.webm): delivered-emulator email verification, destination retained, minimal profile, first event, rejoin, prefilled second event, another member's profile, own name edit, social-profile deletion. The separate fresh-browser login runs while the first context stays open.
- [Fresh device context](pr1-fresh-device.webm): independent empty browser storage signs into the same permanent account and resumes its existing event registration, with no second participant record.
- [Workshop regression](pr1-workshop-team-display.webm): event-code join, actual challenge selection, actual team formation/finalization/naming writes, existing projector screen, and social-profile deletion retaining organizer access.

All recordings are committed so repository reviewers can use GitHub's **View raw / Download** to play them. CI also uploads successful videos in `pr1-emulator-browser-evidence` for 14 days. The fourth browser journey (single/bulk publishing and attribution deletion) is included in CI recordings.

Reproduce: `npm ci`, `npx playwright install chromium`, `npm run typecheck`, `npm run build`, `npm run test:emulators`, then `node scripts/collect-demo.mjs`. The collection script refuses a failed browser run, locates Playwright's bundled ffmpeg (or FFMPEG_PATH), and stream-copies the original recordings with 4x timestamps without starting app/emulators. Local result: **15 emulator authorization/integrity tests and four Chromium browser journeys passed**. Test source and fixture details: [identity-pr1.md](../identity-pr1.md).

## Verified attendance and history (PR6)

[Actual paced staff → member → viewer video](pr6-attendance-history.webm) · [full recordings, screenshots and provenance](attendance-pr6.md). The real synthetic Firebase journey covers staff verification, owner history, Show on profile selection, protected community summaries, correction/private audit and revocation. The capture run passed21 pure/48 real API-rules/12 Chromium journeys; a later backend-only audit follow-up adds six shared-content races for54 real API/rules tests. UI/video capture bytes and provenance remain unchanged. Event rosters/results may independently show participation; this control selects the new profile history only.

## Official awards and historical achievements (PR7)

[Actual paced staff → member → viewer video](pr7-official-awards.webm) · [full recordings, 18 screenshots and source/timestamp provenance](awards-pr7.md). Final normal cumulative validation passed **23 pure / 67 real API-rules / 13 Chromium**; the evidence-only actual awards journey passed1/1. The real synthetic Firebase journey covers individual/team draft/publish/finalize, private owner records/profile selection versus official event results, later team removal preserving credit, correction and revocation. No authentication/security mocks or production data.
