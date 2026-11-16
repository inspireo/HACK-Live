# PR2 photo upload and searchable skills evidence

The revised owner/other-member recordings are actual Playwright Chromium interactions with synthetic Firebase Auth/Firestore emulators (`demo-hack-live`). They use real generated PNG file bytes, the trusted server decoder/storage/read path and actual sharing rules. No Firebase/Auth substitute, fabricated UI or production data is involved. `PROFILE_DEMO=true` adds four-second reading holds at key screens.

The final validated source is `6460ab4bf2c888d49488f66b89e83b4fb1e7e93c` (including both independent-review fixes). Current videos are staged locally for the root's direct native-UI upload to the PR description after checkpoint acceptance. They are ignored, not committed. New public attachment URLs must be verified and inserted by the publishing owner; no upload/publication is claimed by this implementation checkpoint.

## Owner: optional file upload, searchable skills and draft privacy

Staged video: `docs/evidence/pr2-profile-owner.webm` (59.76 seconds, 4,169,236 bytes). Shows searchable predefined terms, keyboard selection, dropdown multiselect, removable chips, custom skill add/persistence; invalid-file feedback; chosen PNG preview; private save/reload; selected community preview; contacts staying private; sharing/replacing/revoking/removing photo; mobile viewport; profile deletion.

## Other member: selected professional details and live photo revocation

Staged video: `docs/evidence/pr2-profile-other-member.webm` (37.60 seconds, 824,557 bytes). Independent signed-in context initially sees selected title, skills and GitHub, while private photo/bio/company/contacts remain absent. Explicit photo consent makes the uploaded image visible; replacement updates it. Revocation removes it, including when a real authenticated image response is delayed. Title revocation and profile deletion update the view live.

Final staged video SHA-256:

- Owner: `cc3b84c9da6dd13d8b1cfe1fc34350d3fe073e1cbac41316818ffbfd57995100`.
- Other member: `3d32fc580f5a9843329f79b3e79eaf3a835df422c1d637f3301271d4ad6ddad9`.

## Screenshots

[Owner form](pr2-profile-owner-form.png), [community preview](pr2-profile-community-preview.png), [other-member view](pr2-profile-other-member.png), [mobile viewport preview](pr2-profile-mobile-preview.png) are captured from the passing revised journey. The 390×844 case is resized desktop Chromium, not a real phone.

## Reproduce and limits

Use Node 24, Java 21 and exclusive local ports 3000/8080/9099/9150:

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk proxy env PROFILE_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-profile-demo.mjs
```

The final paced cumulative run passed all 35 tests: 5 isolated validation/image tests, all 18 parent/PR2 authorization/integrity tests, 5 photo API/rules tests and 7 Chromium journeys. Typecheck and production build also passed (existing bundle-size advisory). Screenshots and decoded video frames were visually inspected; photo preview and selected member image are visible, and the narrow layout wraps without horizontal overflow. Test fixtures run serially. A strengthened stale-photo precondition required the older API reset fixture to send the current photo reference and explicit removal; the product correctly returned 409 for the obsolete implicit-clear request. The updated fixture and full rerun validate the deliberate new contract. Independent review additionally found missing active-caller authorization and legacy-skill removal validation that blocked correction; both are fixed with API/browser regressions in the final cumulative run.

No live Google consent, production deployment, real-device testing or GitHub publication is represented here. Architecture, schema, exact teaming integration evidence and rollback/storage configuration: [profile-pr2.md](../profile-pr2.md). Parent PR1 browser regressions remain included.

## Earlier URL-only revision (historical attachments)

[Previous owner recording](https://github.com/user-attachments/assets/edcfa56a-1d5c-4988-b7f6-229cecd7a73c) and [previous other-member recording](https://github.com/user-attachments/assets/8ee26e41-acd7-4562-8a70-4731b4f81e8d) cover the prior URL-input implementation only. They are retained as historical provenance and do not demonstrate the new upload/combobox behavior.

Recording collectors write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload files directly into the PR description with top-level contextual titles for each video, verify the resulting GitHub attachments, and replace the staged-file references with those links. Do not commit or force-add videos. CI also retains complete successful browser artifacts for 14 days.
