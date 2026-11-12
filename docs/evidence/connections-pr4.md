# PR4 actual approved-contact journey evidence

These are original Playwright Chromium recordings against real synthetic Firebase Auth/Firestore emulators (`demo-hack-live`) and the actual identity server. The two people, emails and phone values are synthetic. No connection UI, Auth, Firestore, API or security rules are mocked. This demonstrates desktop Chromium, not a physical device, production deployment or Google OAuth consent.

- [Sender journey](pr4-connections-sender.webm) (41.12 seconds, 2.48 MB): real email sign-in, member-profile request confirmation, request/acceptance indicator, approved contacts, mark acceptance read, REAL profile editor global selection change, unfriend with contacts gone, decline/cancel and block result after reload.
- [Recipient journey](pr4-connections-recipient.webm) (39.12 seconds, 1.64 MB): independent signed-in account sees incoming request and selected-field explanations without contact values, accepts, sees approved phone, watches the phone disappear and contact email appear live after the sender saves their global selection, then loses contact access after unfriend and blocks a new request.
- Screenshots from those exact journeys: [request confirmation](pr4-connections-request.png), [acceptance explanation](pr4-connections-acceptance.png), [approved phone](pr4-connections-approved.png), [global editor selection](pr4-connections-global-selection.png), [live changed selection](pr4-connections-updated.png), [unfriended](pr4-connections-unfriended.png), [declined](pr4-connections-declined.png), [cancelled](pr4-connections-cancelled.png), [blocked](pr4-connections-blocked.png).
- [Capture manifest](pr4-connections-contract.json) explicitly records the real-emulator mode, synthetic accounts, real editor selection step and limitations.

Use GitHub **View raw / Download** on committed video files with repository access. The PR body links immutable commit versions. The videos are independent, original recordings; each naturally waits while the other account is used. No frames are synthesized, spliced or retimed. CI additionally retains the full cumulative browser artifact for 14 days.

## Reproduction

Use Node 24, Java 21, installed Playwright Chromium and exclusive ports 3000/8080/9099/9150. Fixture-reset suites run sequentially.

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env CONNECTIONS_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-connections-demo.mjs
```

`CONNECTIONS_DEMO=true` adds 3.5-second reading holds only at connection evidence screens. Normal regression runs have no added holds. The collector requires a passing cumulative browser result and the paced real-emulator manifest, then copies original video/screenshots directly.

## Validation scope

Normal AND paced cumulative suites pass **3 profile pure + 9 invitation logic + 3 connection pure + 27 real API/rules + 8 Chromium tests**. Node 24 typecheck/build and diff check pass. Both videos were decoded for metadata and an actual recorded frame was visually checked, alongside acceptance, global-selection and updated-contact screenshots. The passing normal browser run took 42.9 seconds; the paced cumulative browser run took 1.2 minutes.

Real connection tests establish recipient-only acceptance, sender-only cancellation, duplicate/opposite requests, current generation checks, canonical/mirror integrity, global field/value changes with multiple approved peers, empty selections, unrelated/admin/anonymous/unverified denies, forged-write denies, block/unfriend/lifecycle revocation, accept/cancel/block/delete/save races, bounded partial failure and independent retry discovery. The stale-worker test recreates source/contact/professional projections, the SAME pair with a new generation, both views and own safety preference after deletion takeover, then proves early and late stale cleanup cannot erase them. Another member's opaque safety preference survives target recreation.

Browser coverage retains parent registration/profile/invitation regressions and exercises the real two-person connection journey. The first integration run exposed a local-pending profile activation starting child listeners too soon; the gate now waits for committed snapshot metadata and the real signup-to-event regression passes. Architecture, schema/index, migration/compatibility, deletion fencing and safety-retention notes are in [connections-pr4.md](../connections-pr4.md). Existing [PR3](https://github.com/inspireo/HACK-Live/pull/3) behavior remains included. Inherited invitation tests mock native-share/clipboard OS contracts only; that does not substitute for any connection authorization test.
