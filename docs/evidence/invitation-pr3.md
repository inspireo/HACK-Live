# PR3 actual invitation journey evidence

These recordings show actual Playwright Chromium UI at a **390 × 844 mobile
viewport**, using synthetic Firebase Auth/Firestore emulators (`demo-hack-live`)
and the real identity server. People, credentials and events are synthetic.
Only `navigator.share` and clipboard contracts are mocked. This is **not a
physical phone or OS share-sheet recording**, and does not establish native OS
presentation, Google consent or production deployment behavior.

- [Mobile sender invitation journey](pr3-invitation-mobile.webm) (51.76 seconds, 2.00 MB): real sender
  email sign-in, Share event on the join screen, existing event registration,
  dashboard copy fallback when native share is absent/fails, selectable manual
  copy when clipboard is denied, quiet cancellation, and Opening onboarding.
  The sender recording waits naturally while the independent recipient is used.
- [Recipient sign-in and event return](pr3-invitation-recipient.webm) (20.24 seconds, 0.78 MB): fresh
  browser storage opens the exact canonical shared URL, passes through actual
  Firebase email sign-in, retains the event destination, registers through the
  existing form and reloads into the same registration.
- [Manual invitation copy screenshot](pr3-invitation-manual-copy.png) and
  [recipient return screenshot](pr3-invitation-recipient-return.png) provide
  readable snapshots from the same real journey.
- [Share contract evidence](pr3-invitation-contract.json) records the exact
  mocked-OS payload and real browser `userActivation.isActive` assertion, full
  copy string, and explicit evidence limitations. The video does not show an OS
  chooser; the live-region confirmation represents the tested contract result.

Use GitHub **View raw / Download** on committed video files to view them with
repository access. The PR description links immutable commit versions. CI also
retains the complete test-results/Playwright report artifact for 14 days.

## Reproduction and results

Use Node 24, Java 21, Playwright Chromium and exclusive free ports
3000/8080/9099/9150. The inherited test files reset fixtures serially.

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env INVITATION_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-invitation-demo.mjs
```

`INVITATION_DEMO=true` adds 3.5-second reading holds only to the invitation
journey; normal regressions have no added holds. The collector requires both a
passing cumulative browser run and the paced manifest, then copies original
recordings/screenshots directly. No frames are synthesized or retimed.

Cumulative normal and paced suites: **3 profile pure + 9 invitation logic +
18 real API/rules + 7 Chromium tests pass**. Typecheck and build pass. Native
gesture, exact payload, URL nonduplication, copy/manual/cancellation feedback,
Draft/Closed/unknown gating, safe-title fallback and real recipient sign-in
return are asserted. Parent profile/privacy/workshop regressions remain intact.
See [architecture/schema/compatibility](../invitation-pr3.md).
