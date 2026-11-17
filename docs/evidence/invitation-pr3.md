# Public invitation refinement evidence

These two recordings show the actual application on composed immutable source
`e1cf383f4a1bfb2190b6bdf3e6ea8d4fd55beccb`, using synthetic Firebase Auth/Firestore
emulators and the real identity/invitation server. Only OS Web Share and clipboard
adapters are substituted. No physical-phone, native OS share-sheet, live Google
consent or production deployment claim is made.

Exactly two invitation clips replace the prior account-gated invitation demos.
The other 21 stack assets and their capture provenance remain unchanged.

| Recording | Viewport | Duration | Original bytes |
| --- | --- | --- | --- |
| Organizer and sender (`pr3-invitation-mobile.webm`) | 1100 × 900 | 30.12 seconds | 2,474,461 |
| Anonymous recipient (`pr3-invitation-recipient.webm`) | 390 × 844 | 22.52 seconds | 988,129 |

The organizer publishes explicit public title, description, venue, viewing link,
start/end and IANA timezone, selects registration plus calendar, reloads the saved
publication, shares the current seven-day link, exercises clipboard/manual
fallback and quiet cancellation, then confirms soft deletion. The final view
states that participation is closed and records/history are retained; assertions
verify the old preview and calendar are unavailable while event/publication
records still exist.

A fresh mobile recipient sees the published preview and both CTAs without an
account, downloads a real calendar file, chooses Register, signs in through real
Firebase email authentication, creates a minimal profile, explicitly submits the
existing event registration form and reloads the same registration. Preview,
calendar, sign-in and profile creation each assert no accidental registration.

Both native WebM files were copied without retiming or synthesized frames, fully
decoded to PNG output and checked against byte counts/SHA256. Twelve extracted
frames were inspected, including full selected manual text, published timezone and
CTA settings, anonymous preview, real sign-in, profile, explicit registration and
soft-deleted historical view. Native videos remain ignored and uncommitted.

[Exact sizes, hashes, dimensions and run provenance](pr3-public-invitation-media.json)
· [share/user-activation contract](pr3-invitation-contract.json)
· [manual copy](pr3-invitation-manual-copy.png)
· [anonymous preview](pr3-invitation-public-preview.png)
· [recipient registration return](pr3-invitation-recipient-return.png)
· [soft-deleted retained-history view](pr3-invitation-soft-deleted.png).

## Validation and reproduction

The clean composed source passed **165 tests: 37 pure, 93 API/rules and 35
Chromium browser tests**, with Node 24 typecheck/build. The focused recording run
passed 2/2. This local composed run does not claim that each lower layer ran the
same local cumulative suite. Final remote head CI is reported separately in the
pull requests. Existing large-chunk build advisory remains.

Use Node 24, Java 21, Playwright Chromium and exclusive free ports
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

Run the full combined suite first; record-only mode then repeats exactly the two
invitation journeys with natural 2.8-second reading holds. No unrelated feature
rerecording is required. Read [schema, API and lifecycle](../invitation-pr3.md).
