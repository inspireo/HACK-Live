# PR2 photo upload and searchable skills evidence

The revised owner/other-member recordings are actual Playwright Chromium interactions with synthetic Firebase Auth/Firestore emulators (`demo-hack-live`). They use real generated PNG file bytes, the trusted server decoder/storage/read path and actual sharing rules. No Firebase/Auth substitute, fabricated UI or production data is involved. `PROFILE_DEMO=true` adds four-second reading holds at key screens.

The recordings use the final validated source `6460ab4bf2c888d49488f66b89e83b4fb1e7e93c`, including both independent-review fixes; source/tests are byte-identical to published checkpoint `60255e59ab1439e917c22f4397732558d1b28b62`. The root uploaded these two files through GitHub's native composer with the friendly filenames below. Local originals remain ignored and uncommitted. Attachment byte verification through the published PR description remains a separate publication check; the checksums below describe the local original recordings.

## Owner: optional file upload, searchable skills and draft privacy

https://github.com/user-attachments/assets/02e6c608-ee7a-459e-a282-79289c86f2db

Uploaded as `profile-photo-and-skills.webm`, from local `docs/evidence/pr2-profile-owner.webm` (59.76 seconds, 4,169,236 bytes). Shows searchable predefined terms, keyboard selection, dropdown multiselect, removable chips, custom skill add/persistence; invalid-file feedback; chosen PNG preview; private save/reload; selected community preview; contacts staying private; sharing/replacing/revoking/removing photo; mobile viewport; profile deletion.

## Other member: selected professional details and live photo revocation

https://github.com/user-attachments/assets/c875f511-4c5e-438a-926e-02797b61738f

Uploaded as `profile-privacy-and-revocation.webm`, from local `docs/evidence/pr2-profile-other-member.webm` (37.60 seconds, 824,557 bytes). Independent signed-in context initially sees selected title, skills and GitHub, while private photo/bio/company/contacts remain absent. Explicit photo consent makes the uploaded image visible; replacement updates it. Revocation removes it, including when a real authenticated image response is delayed. Title revocation and profile deletion update the view live.

Local original video SHA-256:

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

No live Google consent, production deployment or real-device testing is represented here. Architecture, schema, exact teaming integration evidence and rollback/storage configuration: [profile-pr2.md](../profile-pr2.md). Parent PR1 browser regressions remain included.

## Recording policy

The two videos above replace the earlier URL-only revision's evidence; they demonstrate actual file upload and searchable skills. Earlier assets are retained unchanged on GitHub, but their URL-input behavior is not presented as current evidence.

Recording collectors write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload recordings directly into the PR description under separate contextual headings. Do not commit or force-add videos. CI also retains complete successful browser artifacts for 14 days.
