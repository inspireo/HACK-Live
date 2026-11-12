# PR2 actual profile journey evidence

These are actual Playwright Chromium recordings against synthetic Firebase Auth and Firestore emulators (`demo-hack-live`). Optional data and people are synthetic. The paced run uses `PROFILE_DEMO=true`, which adds four-second reading holds at key screens while keeping normal regression runs fast. No Firebase/Auth mocks, fabricated UI or production data are used.

- [Owner edits and community preview](pr2-profile-owner.webm): optional professional fields and private contacts; per-field community choices; one global future-connection selection; preview excluding private fields/contacts; save and reload; invalid link rejection; revoke title visibility; change global selection; clear photo URL; 390×844 viewport preview; deletion.
- [Other member's live view](pr2-profile-other-member.webm): independent signed-in member sees only selected title, skills and GitHub link. Private bio, company, photo and every contact remain absent. Revoked title disappears live; deletion makes the profile unavailable.
- [Owner form](pr2-profile-owner-form.png), [community preview](pr2-profile-community-preview.png), [other-member view](pr2-profile-other-member.png), [mobile viewport preview](pr2-profile-mobile-preview.png): screenshots from the same real journey, for closer inspection.

Use GitHub **View raw / Download** on these committed files to view them with repository access. CI additionally retains the complete cumulative browser artifact for 14 days. The profile videos are recorded independently; the owner recording naturally waits while the second member context is inspected.

Reproduce with Node 24, Java 21 and free exclusive ports3000/8080/9099/9150:

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env PROFILE_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-profile-demo.mjs
```

The cumulative suite passes 3 isolated validation/projection tests, 18 real-rules/server tests and 5 Chromium journeys. Test fixtures run serially. First integrated browser run exposed a textarea label lookup failure after reload; independent explicit labels fixed it before recording the passing run. Architecture/schema/deletion/compatibility details: [profile-pr2.md](../profile-pr2.md). Parent [PR1](https://github.com/inspireo/HACK-Live/pull/1) regressions remain included.

Limits: external example.test photo URLs demonstrate storage/privacy/deletion, not remote image delivery or upload support. Photo input is an HTTPS image URL, with no upload service or owned blob storage. The narrow viewport is desktop Chromium resizing, not a real phone. Google consent and production deployment are not represented.
