# PR2 profile and contact evidence

The owner/other-member recordings are actual Playwright Chromium interactions with synthetic Firebase Auth/Firestore emulators (`demo-hack-live`). They use real generated PNG file bytes, the trusted server decoder/storage/read path and actual sharing rules. No Firebase/Auth substitute, fabricated UI or production data is involved. `PROFILE_DEMO=true` adds four-second reading holds at key screens.

The recordings use validated source `84f31d6feeb9c60366672f985b5e0570a2ad599f`; the publication followup changes documentation only. The passing paced cumulative run passed **39 tests**: 7 pure validation/image tests, 24 API/rules tests (19 identity and 5 photo) and 8 Chromium journeys. Node 24 typecheck and production build passed; the existing large-bundle advisory remains. All local services were shut down and ports 3000/8080/9099/9150 verified free. No production data or deployment was used.

Both native video attachments were uploaded using the official GitHub CLI attachment command with task-local CLI and scoped credentials. Their published native players were checked and downloaded bytes matched the frozen local SHA-256 values below. No Chrome access, real messaging targets, login-provider infrastructure or device permissions were involved. Local WebMs remain ignored and uncommitted.

## Owner: photo, searchable skills and private contact choices

https://github.com/user-attachments/assets/bf959c7c-743c-4151-a830-618814050fbb

Uploaded as `profile-contact-options.webm`, from `docs/evidence/pr2-profile-owner.webm`: **64.48 seconds, 5,008,271 bytes**; SHA-256 `a21465c7928d65a44408870cd3e627497a60e4be9cc3c5d22a52965abb363244`.

Shows searchable predefined/custom skills, keyboard selection, removable chips and persistence; invalid-file feedback, real PNG preview, private save/reload and selected community preview; Telegram link entry with safe owner preview; explicit same-mobile WhatsApp choice, independent sharing selections and registered-number exposure hint; photo sharing/replacement/revocation/removal, mobile viewport and deletion. No Signal field is displayed. The contact area is readable around 12 seconds and again at the narrow viewport hold around 54 seconds. Neither Telegram nor WhatsApp targets are opened or messaged.

## Other member: selected professional details and live photo revocation

https://github.com/user-attachments/assets/aaefd12f-9653-4593-93c7-ff80cb9e0edf

Uploaded as `profile-contact-privacy.webm`, from `docs/evidence/pr2-profile-other-member.webm`: **38.64 seconds, 811,435 bytes**; SHA-256 `2b9663bf2b15aae0169a9eb1b9fc6a28bb3ec9fb8c6cf6be1897560460d8b6df`.

An independent signed-in member initially sees selected title, skills and GitHub, while private photo/bio/company/contacts remain absent. Explicit photo consent makes the uploaded image visible; replacement updates it. Revocation removes it, including when a real authenticated image response is delayed. Title revocation and profile deletion update the view live. Contacts and WhatsApp mode remain owner-private throughout.

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

The paced cumulative run passed all 39 tests: 7 pure/image, 24 API/rules and 8 Chromium journeys. Contact regressions cover private drafts/save/reload, retired Signal removal, invalid legacy Telegram correction/removal, normalized username/profile links including short collectible names, linked mobile edits, separate WhatsApp numbers and independent sharing consent. Typecheck and production build also passed (existing bundle-size advisory). Screenshots and decoded video frames were visually inspected; photo preview and selected member image are visible, and the narrow layout wraps without horizontal overflow. Test fixtures run serially. A strengthened stale-photo precondition required the older API reset fixture to send the current photo reference and explicit removal; the product correctly returned 409 for the obsolete implicit-clear request. The updated fixture and full rerun validate the deliberate new contract. Independent review additionally found missing active-caller authorization and legacy-skill removal validation that blocked correction; both are fixed with API/browser regressions in the final cumulative run.

No live Google consent, production deployment or real-device testing is represented here. Architecture, schema, exact teaming integration evidence and rollback/storage configuration: [profile-pr2.md](../profile-pr2.md). Parent PR1 browser regressions remain included.

## Recording policy

The two videos above replace earlier recordings, including the retired Signal UI. They demonstrate the current contact editor together with actual photo upload and searchable skills. Earlier assets are not presented as current evidence.

Recording collectors write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload recordings directly into the PR description under separate contextual headings. Do not commit or force-add videos. CI also retains complete successful browser artifacts for 14 days.
