# Public invitation refinement evidence

The new local recordings show the actual application in Playwright Chromium,
backed by the real local identity/invitation server and Firebase Auth/Firestore
emulators (`demo-hack-live`). Accounts, people and events are synthetic fixtures.
Only OS Web Share and clipboard contracts are substituted. These are not mock UI
animations, production user data, physical phones or native OS share-sheet captures.

Exactly two replacement videos are generated, ignored and left uncommitted for
native CLI upload after root acceptance:

- `docs/evidence/pr3-invitation-mobile.webm`: organizer/sender at 1100×900,
  explicit public fields and action settings, publish/reload of the selected
  IANA timezone, current seven-day status, synchronous native-share contract,
  clipboard/manual fallback, quiet cancellation and confirmed soft deletion closing the public link/calendar while retaining the event.
- `docs/evidence/pr3-invitation-recipient.webm`: fresh mobile context at 390×844,
  anonymous published event preview and real calendar download, Register CTA,
  actual Firebase email sign-in, profile creation, existing explicit event form,
  registration submission and reload reuse.

`test-results/invitation-media-manifest.json` records immutable source SHA, video
sizes, SHA256 hashes, dimensions, duration and provenance. Both source videos are
copied without retiming or synthesized frames. The paced tests insert natural
2.8-second reading holds. Screenshots of public preview, calendar-only mode,
manual copy and recipient return remain in ignored `test-results/`.

The previously published PR3 clips and tracked screenshots/contract JSON describe
the superseded account-gated invitation. They are historical evidence, not proof
of this refinement. No new attachment or PR-body publication is performed here.
The root integration owns replacing those two assets while preserving the other
21 stack assets.

## Reproduce

Use Node24, Java21, Playwright Chromium and exclusive free ports
3000/8080/9099/9150. The serial harness resets emulator fixtures.

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env INVITATION_DEMO=true INVITATION_RECORD_ONLY=true npm run test:emulators
rtk proxy node scripts/collect-invitation-demo.mjs
```

Run the full combined suite first; the record-only mode then repeats only the two invitation journeys. The collector requires passing recording tests and a paced actual-app manifest showing soft deletion.
Read [schema/API and compatibility](../invitation-pr3.md) for trust boundaries.
Tests cover all three CTA combinations, no accidental registrations, real
post-auth expiry/revocation checks, fixed expiry/read-only share preparation,
renew/unpublish/stale revision handling, field privacy, direct SDK denial,
replacement-session isolation, calendar time/DST/escaping/folding, native
activation and copy/manual/cancellation. Inherited member/profile/workshop tests
remain in the same harness. Build retains its existing large-chunk advisory.
