# PR2 country selector evidence

Current recordings are actual Playwright Chromium interactions with synthetic Firebase Auth/Firestore emulators (`demo-hack-live`). File selection uses real generated PNG bytes, native FileReader, the trusted image decoder and authenticated API/rules. No fabricated UI, production data or live messaging is involved. `PROFILE_DEMO=true` adds four-second reading holds.

Validated product/test source: `fd214e4dcba79fef3422c570622709a2e8a71012`. The final paced cumulative run passed **47 tests**: 10 pure/image/parser tests, 24 API/rules tests (19 identity and 5 photo), and 13 Chromium journeys. Node **24.22.2** typecheck and production build passed with Java 21.0.1; the existing large-bundle advisory remains. A later evidence commit changes documentation/screenshots only.

The three current WebMs were uploaded through the official GitHub CLI attachment capability after root acceptance. The publication worker verified the private rendered native players and downloaded bytes against the frozen SHA-256 values below; the root independently copied and hash-verified the clips. Local WebMs remain ignored and uncommitted. These assets replace the earlier contact-editor recordings. CI for the final metadata head is pending at publication; the PR body records the exact-head result when available.

## Owner: current profile editor

https://github.com/user-attachments/assets/0acc3f53-262c-4dba-ae43-f8442d985df8

Local file: `docs/evidence/pr2-profile-owner.webm`. Duration **00:01:09.84**, **5,252,684 bytes**. SHA-256 `5382d5a32c8c023b594b70fcd23dab38779b0db732b9a5b725ef3d9507b0a5cc`.

Shows real photo selection, searchable/custom skills, private contacts and independent consent, community preview, save/reload, photo replacement/revocation/removal, mobile viewport and deletion. The country selector visibly changes from United Kingdom (+44) to Singapore (+65) while national digits stay unchanged (readable holds around 14 and 24 seconds). WhatsApp linking is explicit; Telegram preview remains owner-only.

## Other member: selected projection and revocation

https://github.com/user-attachments/assets/c320170e-09e5-424c-8fa4-8d5cc821f97c

Local file: `docs/evidence/pr2-profile-other-member.webm`. Duration **00:00:38.44**, **832,338 bytes**. SHA-256 `c5879377a31d4a5d5ef4f50df3864c7bee2deb64ebc1602ced14576f7e4d4ae9`.

An independent real signed-in member sees selected professional fields and an uploaded photo only after consent; replacement/revocation and deletion update the view. Private contacts and WhatsApp mode stay absent. Decoded frames around 8 and 15 seconds show the selected photo present and later revoked.

## Owner: focused country selector journey

https://github.com/user-attachments/assets/d1fa6db2-80c4-445f-aadf-5763a99ed5eb

Local file: `docs/evidence/pr2-profile-country-selectors.webm`. Duration **00:00:27.00**, **3,942,378 bytes**. SHA-256 `9ecf138d33b94b049687bb73e09bafcf11850ca6ae8d99e6e81b45ea7ed69ee3`.

Focused changed UI: Singapore national input, linked disabled Mobile/WhatsApp controls, +1 paste, explicit US/Canada choice preserving digits, independent UK WhatsApp with national trunk zero, save/reload, Italy significant zero, optional clear and a narrow keyboard-driven selector. Holds around 4, 9 and 15 seconds show linked Singapore, linked Canada and separate UK WhatsApp. The 390×844 resized desktop viewport is letterboxed inside the fixed recording canvas; it is not real-device evidence.

## Regression proof and limits

Pure and real-browser regressions cover no default country, complete maintained country options, national input, code changes preserving digits, paste without double prefix, shared calling codes, GB trunk-zero removal, Italian significant-zero retention, legacy invalid/unknown values, optional clear/country-only drafts and linked/separate WhatsApp persistence. Rejected IDD/foreign-prefix, explicit-country/unknown-prefix and reloaded shared-code edits leave stored source unchanged; selecting the country or pasting a full international number corrects them. New dropdowns contain country choices only; only the current loaded/pasted shared fallback appears, remains enabled and disappears when a specific country is chosen.

A deterministic real-auth test delayed delivery of actual FileReader bytes across A→B sign-out/sign-in; another deleted and recreated A with the same UID before releasing the old reader. Both failed on the prior source by replacing the current target name with A’s pending name. The final owner/lifetime fence tests pass with zero save requests and unchanged target name/private details/photo. Creation/recreation also reach the private editor with no permission alert or reload after the committed-profile gate backport. No server, rules, schema or migration changes were needed for these fixes.

Decoded recording frames and screenshots were visually inspected: country changes, disabled linked controls, independent UK WhatsApp, selected member photo and revocation are visible. Browser assertions verify the narrow layout has no horizontal overflow. Full-page screenshot capture can briefly rescale a frame in the continuous owner recording; the focused selector clip supplies readable contact holds. These are synthetic desktop Chromium recordings, not live OAuth, production or real-device evidence.

## Screenshots

[Owner form](pr2-profile-owner-form.png), [community preview](pr2-profile-community-preview.png), [other-member view](pr2-profile-other-member.png), [mobile preview](pr2-profile-mobile-preview.png), [country controls](pr2-profile-country-selectors.png), [mobile country controls](pr2-profile-country-selectors-mobile.png).

## Reproduce

Activate Node 24 and Java 21, reserve ports 3000/8080/9099/9150, then run:

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk proxy env PROFILE_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-profile-demo.mjs
```

The collector requires a passing browser run and stages three recordings plus six screenshots. `docs/evidence/*.webm` stays ignored; do not force-add videos. All granted services were shut down and ports 3000/8080/9099/9150 verified free after the final run. Publication changes only this branch and its pull-request description. No merge, deployment, migration, production operation or reviewer message occurred. Architecture/backward compatibility and the unchanged data contract are documented in [profile-pr2.md](../profile-pr2.md).
