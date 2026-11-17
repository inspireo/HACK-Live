# Integrated-stack review recordings

The shared design system and contextual help live in this new leaf above the functional stack. Earlier PR source heads remain unchanged. Refreshed parent-workflow videos show the integrated stack's later shared UI; they do not claim that the earlier PR heads contain that UI.

The refresh covers 23 existing slots plus one new shared-UI/help walkthrough. **Capture and visual verification are pending.** Final source, hashes, sizes, durations, cut provenance and selected current screenshots will be recorded here before upload release. Native video attachments will be linked from each PR description; no videos are committed.

| Feature PR | Slots | Coverage |
| --- | ---: | --- |
| [Identity and registration](https://github.com/inspireo/HACK-Live/pull/1) | 3 | Sign-up/verification, reuse, fresh browser, event join, team/projector, deletion compatibility |
| [Profiles and privacy](https://github.com/inspireo/HACK-Live/pull/2) | 4 | Owner/shared photos, skills, private contacts, country codes, real protected loading/decode |
| [Public invitations](https://github.com/inspireo/HACK-Live/pull/3) | 2 | Publication, copy/manual fallback, anonymous public content, real calendar download, auth and explicit registration, soft deletion |
| [Connections](https://github.com/inspireo/HACK-Live/pull/4) | 2 | Request/accept, exact shared fields, contact changes, unfriend/decline/cancel/block |
| [Roles and badges](https://github.com/inspireo/HACK-Live/pull/5) | 4 | Staff roles, real QR, narrow badge, photo loading/revocation, mixed team roles and legacy aliases |
| [Attendance](https://github.com/inspireo/HACK-Live/pull/6) | 4 | Real staff/member/viewer clips and honestly cut overview; verification, opt-in history, corrections and privacy |
| [Awards](https://github.com/inspireo/HACK-Live/pull/7) | 4 | Real staff/member/viewer clips and honestly cut overview; publication, selection, historical credit, correction/revocation |
| Shared UI/help (this leaf) | 1 | Actual account, populated connections, badge and admin routes; desktop/narrow layouts and keyboard help |

Recordings use synthetic accounts/events and synthetic photo fixtures in the actual React/Express app with Auth/Firestore emulators and real application APIs/rules. Calendar download and explicit registration are real. There is no production, physical-phone, native phone share-sheet, Google-consent or message-send claim. Email verification uses an Auth-emulator OOB code. Some legacy workshop fixtures advance facilitator stages through Admin SDK setup; that does not simulate participant UI writes.

The original native-share and mocked-clipboard contract regressions remain intact. Separate recorded paths use Chromium with WebShare disabled by its browser feature setting, actual clipboard-write permission and app success feedback; permission denial reveals the app's manual fallback. Clipboard content is never read. Any remaining OS seam is disclosed for the individual clip. Loading visibility holds actual protected responses and actual image-decode completion without replacing data. Playback stays at native speed; multi-actor cuts retain raw sources and an edit ledger.

## Reproduce

Use Node 24, Java 21, Chromium and a full ffmpeg build. Run `npm ci`, `npx playwright install chromium`, `npm run typecheck`, `npm run build`, and `npm run test:emulators` normally first. Capture only in an exclusively assigned runtime window, because emulator fixtures are reset by the tests. Required app/Auth/Firestore ports are 3000/9099/8080 (plus emulator support ports).

After normal validation, enable `REVIEW_RECORDINGS=true PROFILE_DEMO=true INVITATION_DEMO=true CONNECTIONS_DEMO=true PARTICIPATION_DEMO=true ATTENDANCE_DEMO=true AWARDS_DEMO=true` for a paced cumulative `npm run test:emulators`. Set `PARTICIPATION_SOURCE_REVISION`, `ATTENDANCE_SOURCE_REVISION` and `AWARDS_SOURCE_REVISION` to the immutable recording checkout's full commit SHA. `scripts/review-demo-catalog.json` defines exactly 24 slots. The recording reporter captures per-test source/status and actual video paths; the normal suite does not enable recording-only journeys.

`scripts/collect-review-demos.mjs --output <new ignored directory>` requires a successful normal-validation record and a successful paced run on the same clean source. Set `FFMPEG_PATH`. It retains raw sources, produces native-speed outputs, decodes every frame, records bytes/hash/duration/dimensions/frame counts and exports QA frames. Actual visual inspection and immutable final manifest freeze are separate acceptance gates. The historical `collect-demo.mjs` retiming path is not used for this refresh.

Schema, rules, authorization and API handlers are unchanged by the shared-UI/recording slice. The frontend adds pinned Radix Popover, semantic tokens and shared controls/help; see [design-system documentation](design-system.md). Final validation and screenshot/provenance links will replace the pending status before upload release.
