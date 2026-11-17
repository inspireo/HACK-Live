# Integrated-stack review recordings

All **24 actual app videos** are privately frozen: the existing workflow slots plus a new shared-design-system/help walkthrough. Every delivered slot traces to a complete, individually passed capture, successful full-frame decode, visual inspection and exact bytes/SHA256. Videos are ignored and uncommitted; native attachments are published in the linked feature descriptions after upload authorization.

These workflows were re-recorded on the integrated stack with the later **shared UI and contextual help**. Earlier feature source heads retain their own architecture, schema and validation history; these recordings do not imply that earlier heads contain later UI.

The recordings use actual React/Express application routes with **synthetic accounts/events and synthetic raster photo fixtures**, real Auth/Firestore emulators, application APIs/rules, calendar download and explicit registration. There is no generated or isolated demo UI. Email verification applies a real emulator OOB code rather than showing an email inbox. Some workshop fixtures advance facilitator phases through Admin SDK setup; participant selections, teaming and naming use actual UI writes. No production, physical-phone, native phone share-sheet, Google-consent or message-send claim is made.

Recorded copy paths use actual Chromium clipboard-write permission and app success feedback; **clipboard contents are never read**. WebShare is disabled by a browser feature setting. Denied/manual/cancel/native OS edges remain covered by the unchanged platform-contract regressions and are not presented as recorded native UX. Photo delays hold actual protected responses and actual image-decode completion without replacing their data.

## Capture acceptance

[Normal recording-source CI](https://github.com/inspireo/HACK-Live/actions/runs/44087020753) passed **173 business checks**: 130 pure/API/rules checks and 43 browser journeys. This retains the earlier business baseline and adds the final populated-connection layout checks. Three capture-only additions are skipped separately in normal runs. [Current leaf validation](https://github.com/inspireo/HACK-Live/pull/9/checks) tracks the published head.

The primary paced batch passed every business case and the shared-UI walkthrough, but **two capture-only permission-denial helpers failed**; that batch is not called globally passed. Its complete individually passed footage was preserved read-only. Both affected copy journeys were then captured successfully in a focused batch after removing the optional OS-denial step from footage. The original denied/manual/native contract tests remain intact. Every final asset uses only passed complete journeys; the [detailed provenance](evidence/review-demos-provenance.json) records exact source/run/status/hash evidence per input.

Playback remains at native speed. Attendance/award overviews honestly cut between actual staff/member/viewer clips. The mobile badge joins two actual synthetic actors’ role/QR and photo-privacy journeys, explicitly recorded in its source ledger. Two startup trims remove blank browser/setup prefixes: 1.44 seconds from the connection-recipient clip and 3.158 seconds from the staff-attendance clip. Raw sources and exact edit intervals are retained. There is no timestamp scaling, time stretching or generated motion.

## Workflow index

Native video links are maintained in each feature description, so this source index remains stable after upload.

| Workflow | Video | Duration | Dimensions |
| --- | --- | ---: | --- |
| [Identity and registration](https://github.com/inspireo/HACK-Live/pull/1) | Sign in and reuse registration | 19.00s | 1100×760 |
| [Identity and registration](https://github.com/inspireo/HACK-Live/pull/1) | Resume from a fresh browser | 4.60s | 1100×760 |
| [Identity and registration](https://github.com/inspireo/HACK-Live/pull/1) | Event code, team and projector | 11.08s | 1100×760 |
| [Profiles and privacy](https://github.com/inspireo/HACK-Live/pull/2) | Profile photo loading and decode | 15.24s | 1100×760 |
| [Profiles and privacy](https://github.com/inspireo/HACK-Live/pull/2) | Edit professional profile and skills | 69.12s | 1100×760 |
| [Profiles and privacy](https://github.com/inspireo/HACK-Live/pull/2) | Another member’s privacy view | 37.56s | 1100×760 |
| [Profiles and privacy](https://github.com/inspireo/HACK-Live/pull/2) | Country codes and WhatsApp | 26.84s | 1100×760 |
| [Public invitations](https://github.com/inspireo/HACK-Live/pull/3) | Publish, copy and close an invitation | 21.36s | 1100×900 |
| [Public invitations](https://github.com/inspireo/HACK-Live/pull/3) | Public preview, calendar and registration | 23.16s | 390×844 |
| [Connections](https://github.com/inspireo/HACK-Live/pull/4) | Request connections and update sharing | 45.88s | 1100×760 |
| [Connections](https://github.com/inspireo/HACK-Live/pull/4) | Accept connections and revoke contact access | 42.40s | 1100×760 |
| [Roles and badges](https://github.com/inspireo/HACK-Live/pull/5) | Role badge, QR and photo privacy | 50.40s | 390×844 |
| [Roles and badges](https://github.com/inspireo/HACK-Live/pull/5) | Clear legacy team aliases | 6.64s | 1100×760 |
| [Roles and badges](https://github.com/inspireo/HACK-Live/pull/5) | Participant and mentor team label | 8.44s | 1100×760 |
| [Roles and badges](https://github.com/inspireo/HACK-Live/pull/5) | Assign official event roles | 39.48s | 1100×760 |
| [Attendance and history](https://github.com/inspireo/HACK-Live/pull/6) | Attendance and history overview | 39.04s | 1100×760 |
| [Attendance and history](https://github.com/inspireo/HACK-Live/pull/6) | Member attendance history and selection | 37.16s | 1100×760 |
| [Attendance and history](https://github.com/inspireo/HACK-Live/pull/6) | Staff attendance verification and correction | 45.72s | 1100×760 |
| [Attendance and history](https://github.com/inspireo/HACK-Live/pull/6) | Viewer attendance privacy | 32.44s | 1100×760 |
| [Awards and historical achievements](https://github.com/inspireo/HACK-Live/pull/7) | Awards and historical credit overview | 64.04s | 1100×760 |
| [Awards and historical achievements](https://github.com/inspireo/HACK-Live/pull/7) | Member achievement selection and history | 69.00s | 1100×760 |
| [Awards and historical achievements](https://github.com/inspireo/HACK-Live/pull/7) | Publish, correct and revoke awards | 80.00s | 1100×760 |
| [Awards and historical achievements](https://github.com/inspireo/HACK-Live/pull/7) | Viewer achievements and official results | 55.12s | 1100×760 |
| [Shared UI and contextual help](https://github.com/inspireo/HACK-Live/pull/9) | Shared design system and contextual help | 45.76s | 1100×760 |

## Current actual app screenshots

- [390px profile and compact sharing controls](evidence/ui8-profile-builder-390.png)
- [Populated 390px connections](evidence/ui8-connections-populated-390.png)
- [Mobile contextual help](evidence/ui8-profile-mobile-help-390.png)
- [Light badge help](evidence/ui8-light-badge-help-320.png)
- [Real protected photo loading](evidence/review-photo-loading.png) and [decoded owner preview](evidence/review-photo-decoded-preview.png)
- [Decoded compact badge photo and QR](evidence/review-badge-photo-loaded.png)
- [Actual browser copy success feedback](evidence/review-real-copy-feedback.png)

The four video-derived stills retain native pixels, with exact movie hashes/timestamps in the provenance file. No UI is painted or fabricated.

## Reproduce

Use Node 24, Java 21, Chromium and a full ffmpeg build. Run `npm ci`, `npx playwright install chromium`, `npm run typecheck`, `npm run build`, and `npm run test:emulators` normally first. Emulator fixtures are reset by tests; assign an exclusive app/Auth/Firestore runtime window and support ports before capture.

Enable `REVIEW_RECORDINGS=true PROFILE_DEMO=true INVITATION_DEMO=true CONNECTIONS_DEMO=true PARTICIPATION_DEMO=true ATTENDANCE_DEMO=true AWARDS_DEMO=true` for a paced cumulative `npm run test:emulators`. Set `PARTICIPATION_SOURCE_REVISION`, `ATTENDANCE_SOURCE_REVISION` and `AWARDS_SOURCE_REVISION` to the immutable capture checkout. A bounded `REVIEW_CAPTURE_ONLY=true` with recording mode selects the two actual-copy paths for focused recapture, leaving normal business execution unchanged.

`scripts/review-demo-catalog.json` defines the 24 slots. The reporter records per-test source, status and actual video paths. Preserve each batch before another Playwright run clears `test-results`. `node scripts/collect-review-demos.mjs --output <new ignored directory> --inputs <archived run> [<newer run>...]` requires normal validation evidence, unchanged accepted production UI and individually passed complete sources. Set `FFMPEG_PATH`. Collection retains raw bytes and edit provenance, decodes every frame, records hashes/dimensions/durations/frame counts and exports visual QA frames. Actual visual inspection and immutable manifest freeze precede upload. The historical retiming collector is not used.

The frozen set contains **37,691,056 bytes and 22,223 decoded frames**. Detailed per-file SHA256, source commits, batch timestamps, complete passed-case status, cuts, OS seams and screenshot provenance live in the [machine-readable manifest](evidence/review-demos-provenance.json).

Schema, rules, authorization and API handlers are unchanged by this leaf. The frontend adds pinned Radix Popover, semantic tokens and shared controls/help; see the [design system](design-system.md).
