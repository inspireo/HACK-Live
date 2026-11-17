# PR6 actual attendance/history evidence

Immutable product: `a15d38a9d37cd3cc94a63caedc3713c29b7a62fc`; exact final PR5 parent `370b46eac0a17e381e9c1d9491436c622eeaa8b6`.

[Watch the actual paced journey](https://github.com/user-attachments/assets/9382d954-4290-4840-861e-efd2a76a3a75). The composite joins the following captured intervals from real staff/member/viewer browser contexts. It cuts inactive waits between stages; it does not fabricate screens, auth or server results. Full recordings below retain the actual interactions.

| Chapter start | Role | Actual UI stage |
| --- | --- | --- |
| 0.0s | staff | registered not attended |
| 3.5s | staff | staff verified |
| 7.1s | member | current event status |
| 10.6s | member | private owner history |
| 14.1s | viewer | unselected hidden |
| 17.6s | member | show on profile selected |
| 21.2s | viewer | selected safe summary |
| 24.7s | staff | staff correction |
| 28.2s | member | owner private correction audit |
| 31.8s | viewer | corrected safe summary |
| 35.3s | viewer | visibility revoked |

Composite duration is 38.84 seconds; captured stage intervals total approximately 38.8 seconds. Full attendance test duration: 49.2 seconds in paced mode (about four seconds normally).

[Staff full recording](https://github.com/user-attachments/assets/7512bd81-a95c-4e1d-9030-f5fb9b93d539) · [Member full recording](https://github.com/user-attachments/assets/75bf20af-112e-435f-b2df-848317175fcf) · [Viewer full recording](https://github.com/user-attachments/assets/62030ee0-1819-4402-8da8-4e9eef541cdb) · [Captured source/timing contract](pr6-browser-contract.json)

The owner sees registered versus verified attendance, unknown event date, actual occurrence and server recording times, and a private correction audit. The Show on profile control explains that existing event rosters/official results may independently show participation. The separate member sees no history before selection, only a safe selected summary afterward, correction status without staff/reason/evidence, and no history after revocation. No connection is created by viewing history.

All users and content are synthetic. Auth, authorization, registration, check-in/correction and visibility writes use actual local Firebase Auth/Firestore and the existing app API. Nothing in this journey mocks authentication or security. This is Chromium desktop browser evidence, not a physical-device or production deployment claim.

Capture: Node `v24.22.2`, Chromium `158.0.8127.18`, 1100×760 CSS viewport. The collector requires a successful cumulative browser result. Run the same Node24/Java21 emulator suite with ATTENDANCE_DEMO=true and ATTENDANCE_SOURCE_REVISION set to the immutable product SHA; use scripts/collect-attendance-demo.mjs with FFMPEG_PATH if ffmpeg is not on PATH.

Validation: typecheck/build pass; normal and paced cumulative suites retain all earlier slices. New real coverage includes concurrent check-in, correction revisions/evidence, actor/event boundaries, active mentors/volunteers, selected-summary privacy, date/metadata retention, real optional backfill and whole delete-profile partial/stale recovery across contacts/source/attendance/audit/verifier plans.

Backend-only audit follow-up: PR6 later adds current-record conditional shared-content cleanup and six deterministic real Firestore race tests (54 real API/rules tests cumulatively). UI source, video bytes and the original a15d capture contract remain unchanged. The original paced run's48 real tests remain the provenance for this video; later shared cleanup validation is documented in docs/attendance-pr6.md and the PR body, not retroactively claimed in the capture.

Recording collectors continue to write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload those files directly into the PR description, verify the resulting GitHub attachments, and update these links. Do not commit or force-add videos. Screenshots and capture contracts remain tracked; original recording revisions, filenames and timings are historical capture provenance.

## Capture filename to attachment mapping

The unchanged capture contract records the original local filenames and source revision. The recordings are now hosted at these verified attachments.

| Capture filename | Attachment |
| --- | --- |
| `pr6-attendance-history.webm` | [Verified recording](https://github.com/user-attachments/assets/9382d954-4290-4840-861e-efd2a76a3a75) |
| `pr6-member-full.webm` | [Verified recording](https://github.com/user-attachments/assets/75bf20af-112e-435f-b2df-848317175fcf) |
| `pr6-staff-full.webm` | [Verified recording](https://github.com/user-attachments/assets/7512bd81-a95c-4e1d-9030-f5fb9b93d539) |
| `pr6-viewer-full.webm` | [Verified recording](https://github.com/user-attachments/assets/62030ee0-1819-4402-8da8-4e9eef541cdb) |
