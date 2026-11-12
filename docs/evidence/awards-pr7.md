# PR7 actual official-award evidence

[Actual paced staff → member → viewer walkthrough](pr7-official-awards.webm) — **63.72 seconds**, VP9/WebM, 1100×760. Authorized repository reviewers can use GitHub **View raw / Download** to play the actual movie. These files are committed repository evidence, not local-only paths.

Recorded 2026-11-12 against actual synthetic Firebase Auth/Firestore emulators and the real application/API/rules. Capture product: `a1c5fdc73998e30e061cf48151730d034ef3a0f7`. Node `v24.22.2`, Chromium `158.0.8127.18`, desktop viewport 1100×760. No production data, authentication mocks, security mocks, live Google consent, or physical-device claims.

## Validation and provenance

- Final normal cumulative product validation: **23 pure / 67 real API-rules / 13 Chromium passed**, serial Node files and one browser worker. Node24 typecheck/build and diff checks passed.
- Evidence-only invocation after that full pass: **1/1 actual award browser journey passed**, using the same app/emulator/fixture lifecycle. Normal/CI invocation still runs all cumulative suites; the recording-only switch requires BOTH AWARDS_DEMO=true and AWARDS_RECORD_ONLY=true.
- Earlier corrected full paced run at `4b66c7e` also passed 23/67/13. The final legacy-ID compatibility followup changes only validator/tests; all src UI and complete demo fixture/steps were verified byte-identical. This delivered recording was regenerated at the final `a1c5fdc73998e30e061cf48151730d034ef3a0f7` itself, not relabeled from the prior capture.
- Primary movie SHA-256: `c1ab70a33c1cc07a923fe00fd7bec5f0415ccba9e00a0461dbdbfc47c730da76`. All encoded frames decoded successfully; representative actual movie frames and screenshots were visually checked, including readable official results and removal of revoked team credit.
- Primary movie contains timestamped excerpts from actual browser recordings, held for about 3.5 seconds per stage. No static mock or fabricated interaction replaces the recording. Full recordings retain the complete clicks/navigation/waits.

## Full recordings

- [Staff full recording](pr7-staff-full.webm): drafts/publication/finalization, actual later team removal, correction/revocation and authorized private audit.
- [Member full recording](pr7-member-full.webm): existing professional editor, private-by-default achievements, explicit profile selection, snapshot credit after team removal, correction retaining selection and revoked team award removed.
- [Viewer full recording](pr7-viewer-full.webm): unselected profile hidden, selected safe summary, independently published official event results, correction and revocation; no private contacts/audit reasons.
- [Machine-readable source/timestamp contract](pr7-browser-contract.json).

## Captured stages

| Role | Stage / actual screenshot | Raw recording interval (seconds) |
| --- | --- | --- |
| staff | [individual draft](pr7-individual-draft.png) | 4.17–7.71 |
| staff | [individual published](pr7-individual-published.png) | 8.09–11.62 |
| staff | [team published](pr7-team-published.png) | 12.49–16.03 |
| staff | [results finalized](pr7-results-finalized.png) | 16.42–19.95 |
| member | [private owner achievements](pr7-private-owner-achievements.png) | 1.19–4.73 |
| viewer | [profile unselected hidden](pr7-profile-unselected-hidden.png) | 1.11–4.64 |
| member | [profile selection](pr7-profile-selection.png) | 9.76–13.29 |
| viewer | [selected profile summary](pr7-selected-profile-summary.png) | 9.00–12.52 |
| viewer | [official results independent audience](pr7-official-results-independent-audience.png) | 12.78–16.30 |
| staff | [later team removal](pr7-later-team-removal.png) | 41.87–45.40 |
| member | [snapshot credit preserved](pr7-snapshot-credit-preserved.png) | 25.75–29.28 |
| staff | [category corrected](pr7-category-corrected.png) | 50.17–53.71 |
| member | [correction keeps profile choice](pr7-correction-keeps-profile-choice.png) | 34.04–37.58 |
| viewer | [corrected safe profile](pr7-corrected-safe-profile.png) | 33.32–36.84 |
| staff | [team award revoked](pr7-team-award-revoked.png) | 62.01–65.54 |
| member | [revocation removes team credit](pr7-revocation-removes-team-credit.png) | 45.86–49.40 |
| viewer | [revoked result removed](pr7-revoked-result-removed.png) | 45.20–48.72 |
| staff | [authorized private audit](pr7-authorized-private-audit.png) | 73.89–77.42 |

## Reproduce

Use Node 24 and Java 21. Run `npm ci`, `npx playwright install chromium`, `npm run typecheck`, `npm run build`, then `npm run test:emulators` for the complete cumulative validation. After it passes, run the same harness with `AWARDS_DEMO=true AWARDS_RECORD_ONLY=true AWARDS_SOURCE_REVISION=a1c5fdc73998e30e061cf48151730d034ef3a0f7` for evidence-only capture. Then run `FFMPEG_PATH=/path/to/ffmpeg node scripts/collect-awards-demo.mjs`. Normal mode has no recording holds; demo mode uses 150 ms browser action pacing and actual 3.5-second stage holds. Save/collect media before any further Playwright run resets test-results.

Schema/API/index/migration/backfill/trust contract: [awards-pr7.md](../awards-pr7.md). Parent: [actual PR6](https://github.com/inspireo/HACK-Live/pull/6), `cbe48355cc82c9bdf4d39937bc4c6a09f0290a9d`. No merge/deployment.
