# PR5 actual event-role and mobile badge evidence

Recorded 2026-11-12 against synthetic real Auth/Firestore emulators in the exclusive local window. Immutable product/test source: `6c73699b633e42acdc1ebe65c4cdfee732f2795c`. Parent: [PR4](https://github.com/inspireo/HACK-Live/pull/4), exact `37fca8cc9907add4ce39227535b4b49f2325757b`.

Normal and paced cumulative runs both passed: **19 pure tests, 34 real API/rules tests, 11 Chromium journeys**. Node **24.22.2**, Chromium **158.0.8127.18**. Existing PR1–PR4 suites remain sequential in the cumulative runner.

## Current compact photo loading update

The main badge recording now demonstrates the fixed 56px neutral/loading/loaded/revoked photo slot beside the name at 320px. [Current recording and verified capture details](badge-photo-loading.md) records the full 141-test composed pass, focused 1/1 real browser pass, immutable source, complete decode and unchanged role/QR geometry. Other staff/team/alias clips and all historical screenshots/contracts below retain their original provenance.

## Historical selected-photo recording update

Recorded 2026-11-16 at composed product/test checkpoint `e21a2591fdecedb3542e0059297704ccc093073c`, with the badge consumer from `d1abb9190be18606f2baad668e8058772bdff8ec`. The full normal cumulative tip suite passed **26 pure + 72 API/rules + 16 Chromium journeys (114 total)**. The focused paced badge recording passed **1/1** afterward. The other staff/team/alias recordings and their original capture revisions remain the historical evidence below.

The updated mobile movie uses a real synthetic raster uploaded through the trusted API and explicitly selected for member visibility; both badge and signed-in active peer render it through authenticated blob URLs. It retains the original role/QR/event-switch/revocation/deletion journey. A separate normal browser regression proves an unselected owner photo creates neither image nor photo request, and live projection revocation removes the image while the badge stays mounted. No credentials or private source fallback are added.

[Selected uploaded photo at 320 CSS px](pr5-badge-selected-photo-320.png) · [full page](pr5-badge-selected-photo-320-full-page.png) · [new immutable capture contract](pr5-selected-photo-browser-contract.json). The 31.76-second, 1,372,760-byte movie has SHA256 `15c80251c5dadf62d9fb60321f91c11c95c9a3854e84ab11af3e9c1854c97edb`; all 794 frames decoded, with frames at 12/20/28 seconds visually inspected. Its [historical selected-photo attachment](https://github.com/user-attachments/assets/cdb45053-7724-4879-bb20-f4434ef4cab6) retains these original bytes and provenance. The current focused loading recording is linked above and in the main mobile row below.

## Videos

| Recording | Actual journey |
| --- | --- |
| [Staff role assignment](https://github.com/user-attachments/assets/bc281e54-4822-4b26-9a48-8eee71c03e3c) | Organizer issues mentor + volunteer to the verified member, with participant unchecked; creates/reuses the existing registration. The staff form pauses after the saved result. |
| [320px mobile badge](https://github.com/user-attachments/assets/066c76d8-1f5a-4e30-a675-1314523549b7) | Real member badge keeps its 56px slot, name/title, role and profile QR fixed through neutral, authenticated loading, decoded photo and revocation before a late replacement response. Owner sharing changes happen in a separate signed-in editor tab. Focused 23.40-second recording at 320 × 740. |
| [Mixed participant and team label](https://github.com/user-attachments/assets/b4bc75b2-23b8-4382-bf85-e94fcfc57c01) | Participant + mentor selects a challenge, creates a forming team, edits the designer label through the UI, finalizes through the real trusted API, and displays official roles and the separate team role on the badge. Tests assert retained actual leaderId and transferred label. |
| [Legacy alias removal](https://github.com/user-attachments/assets/c3f9b895-1adc-4577-8798-e4b1b73f7c3c) | Seeded alias-only legacy membership leaves through the member UI; seeded dual aliases are removed through the actual admin action. Both fields clear and mentor-only role assignment succeeds. |

The historical desktop staff and selected-photo recordings retain their original synthetic journeys. The current mobile movie focuses on the changed photo loading behavior. Supplemental team/alias clips are shorter regression recordings. The recording links open verified GitHub video attachments also published in the PR description.

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

The original mobile video was decoded locally and a frame at 12 seconds was inspected; its badge, roles, QR quiet zone, scan purpose and positive sign-in/approved-contact guidance are readable. The QR test independently rasterizes the actual rendered qrcode.react SVG and decodes those pixels with jsQR. Payload: `http://127.0.0.1:3000/members/badge-browser` — synthetic opaque profile destination only, with no contacts, credentials or check-in tokens.

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

The commands above reproduce the historical full evidence set. To reproduce the updated selected-photo movie, use `PARTICIPATION_SOURCE_REVISION=e21a2591fdecedb3542e0059297704ccc093073c` with the current suite and preserve the new screenshot/contract filenames separately. The original collector names and historical contract remain unchanged.

The collector requires a passed cumulative browser run, a paced evidence manifest, the source revision and all four recordings. It never manufactures screenshots or videos.

Recording collectors continue to write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload those files directly into the PR description, verify the resulting GitHub attachments, and update these links. Do not commit or force-add videos. Screenshots and capture contracts remain tracked; original recording revisions, filenames and timings are historical capture provenance.
