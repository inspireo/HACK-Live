# PR5 actual event-role and mobile badge evidence

Recorded 2026-11-12 against synthetic real Auth/Firestore emulators in the exclusive local window. Immutable product/test source: `6c73699b633e42acdc1ebe65c4cdfee732f2795c`. Parent: [PR4](https://github.com/inspireo/HACK-Live/pull/4), exact `37fca8cc9907add4ce39227535b4b49f2325757b`.

Normal and paced cumulative runs both passed: **19 pure tests, 34 real API/rules tests, 11 Chromium journeys**. Node **24.22.2**, Chromium **158.0.8127.18**. Existing PR1–PR4 suites remain sequential in the cumulative runner.

## Videos

| Recording | Actual journey |
| --- | --- |
| [Staff role assignment](pr5-staff-role-assignment.webm) | Organizer issues mentor + volunteer to the verified member, with participant unchecked; creates/reuses the existing registration. The staff form pauses after the saved result. |
| [320px mobile badge](pr5-mobile-badge.webm) | Real member sign-in, staff-only event resources/detail modal and Share event, large profile QR, multiple official role chips, selected professional title, profile sharing, event selector, live revocation and deletion. The mobile video is 29.36 seconds at 320 × 740. |
| [Mixed participant and team label](pr5-mixed-participant-team-label.webm) | Participant + mentor selects a challenge, creates a forming team, edits the designer label through the UI, finalizes through the real trusted API, and displays official roles and the separate team role on the badge. Tests assert retained actual leaderId and transferred label. |
| [Legacy alias removal](pr5-legacy-alias-removal.webm) | Seeded alias-only legacy membership leaves through the member UI; seeded dual aliases are removed through the actual admin action. Both fields clear and mentor-only role assignment succeeds. |

The desktop staff and mobile recordings capture different signed-in contexts during the same real journey. Supplemental team/alias clips are shorter regression recordings. Files are committed alongside this document so repository reviewers can open or download them with their existing repository access.

## Screenshots

- [Staff assignment saved](pr5-staff-assignment.png)
- [Staff-only resources and invitation access](pr5-staff-resources.png)
- [320 CSS px badge](pr5-badge-320.png), [full page](pr5-badge-320-full-page.png)
- [Second-event selector](pr5-event-selector.png)
- [Signed-out profile destination](pr5-profile-signin-destination.png)
- [Member-visible profile after real sign-in](pr5-member-visible-profile.png)
- [Revoked badge](pr5-badge-revoked.png)
- [Mixed participant + mentor and separate team role](pr5-mixed-participant-team-label.png)
- [Legacy aliases cleared](pr5-legacy-alias-cleared.png)

The actual mobile video was decoded locally and a frame at 12 seconds was inspected; its badge, roles, QR quiet zone, scan purpose and positive sign-in/approved-contact guidance are readable. The QR test independently rasterizes the actual rendered qrcode.react SVG and decodes those pixels with jsQR. Payload: `http://127.0.0.1:3000/members/badge-browser` — synthetic opaque profile destination only, with no contacts, credentials or check-in tokens.

## Trust and evidence limits

Auth, verified identity, staff authorization, registration pointers, profile projection, official role writes, team labels, finalization, rules, live source invalidation and deletion are real local emulator/browser operations. Profile editing/connection/invitation regressions from the parent stack also run unchanged.

Only Web Share and clipboard-rejection adapters are substituted to exercise browser contracts deterministically. **This is Chromium viewport evidence, not a physical phone or native OS share-sheet recording.** No production account/data, real email delivery, production migration, deployment, attendance, awards or automatic connection/check-in claim is made. Private fixture contacts and unselected professional fields are asserted absent.

[Machine-readable capture contract](pr5-browser-contract.json).

## Repeat

Use Node 24, Java 21 and Playwright Chromium with local ports 3000/8080/9099/9150 free and exclusively assigned to this suite:

```sh
npm ci
npm run typecheck
npm run build
npm run test:emulators
PARTICIPATION_DEMO=true PARTICIPATION_SOURCE_REVISION=6c73699b633e42acdc1ebe65c4cdfee732f2795c npm run test:emulators
node scripts/collect-participation-demo.mjs
```

The collector requires a passed cumulative browser run, a paced evidence manifest, the source revision and all four recordings. It never manufactures screenshots or videos.
