# PR4 actual approved-contact journey evidence

The linked baseline movies below are historical Playwright Chromium recordings against real synthetic Firebase Auth/Firestore emulators (`demo-hack-live`) and the actual identity server. The two people, emails and phone values are synthetic. No connection UI, Auth, Firestore, API or security rules are mocked. This demonstrates desktop Chromium, not a physical device, production deployment or Google OAuth consent.

- [Sender journey](https://github.com/user-attachments/assets/1606e7ce-9de7-442f-be2d-de69a74ffcea) (41.12 seconds, 2.48 MB): real email sign-in, member-profile request confirmation, request/acceptance indicator, approved contacts, mark acceptance read, REAL profile editor global selection change, unfriend with contacts gone, decline/cancel and block result after reload.
- [Recipient journey](https://github.com/user-attachments/assets/eeeea194-480c-40d4-b7ec-d96e693e94ac) (39.12 seconds, 1.64 MB): independent signed-in account sees incoming request and selected-field explanations without contact values, accepts, sees approved phone, watches the phone disappear and contact email appear live after the sender saves their global selection, then loses contact access after unfriend and blocks a new request.
- Current contact-refinement screenshots (superseding the original capture images): [request confirmation](pr4-connections-request.png), [acceptance explanation](pr4-connections-acceptance.png), [approved contact actions](pr4-connections-approved.png), [global editor selection](pr4-connections-global-selection.png), [live changed selection](pr4-connections-updated.png), [unfriended](pr4-connections-unfriended.png), [declined](pr4-connections-declined.png), [cancelled](pr4-connections-cancelled.png), [blocked](pr4-connections-blocked.png).
- [Capture manifest](pr4-connections-contract.json) explicitly records the real-emulator mode, synthetic accounts, real editor selection step and limitations.

Open the verified GitHub video attachments linked above and in the PR description. The videos are independent, original recordings; each naturally waits while the other account is used. No frames are synthesized, spliced or retimed. CI additionally retains the full cumulative browser artifact for 14 days.

## Reproduction

Use Node 24, Java 21, installed Playwright Chromium and exclusive ports 3000/8080/9099/9150. Fixture-reset suites run sequentially.

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env CONNECTIONS_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-connections-demo.mjs
```

`CONNECTIONS_DEMO=true` adds 3.5-second reading holds only at connection evidence screens. Normal regression runs have no added holds. The collector requires a passing cumulative browser result and the paced real-emulator manifest, then copies original video/screenshots directly.

## Historical baseline validation scope

Normal AND paced cumulative suites pass **3 profile pure + 9 invitation logic + 3 connection pure + 27 real API/rules + 8 Chromium tests**. Node 24 typecheck/build and diff check pass. Both videos were decoded for metadata and an actual recorded frame was visually checked, alongside acceptance, global-selection and updated-contact screenshots. The passing normal browser run took 42.9 seconds; the paced cumulative browser run took 1.2 minutes.

Real connection tests establish recipient-only acceptance, sender-only cancellation, duplicate/opposite requests, current generation checks, canonical/mirror integrity, global field/value changes with multiple approved peers, empty selections, unrelated/admin/anonymous/unverified denies, forged-write denies, block/unfriend/lifecycle revocation, accept/cancel/block/delete/save races, bounded partial failure and independent retry discovery. The stale-worker test recreates source/contact/professional projections, the SAME pair with a new generation, both views and own safety preference after deletion takeover, then proves early and late stale cleanup cannot erase them. Another member's opaque safety preference survives target recreation.

Browser coverage retains parent registration/profile/invitation regressions and exercises the real two-person connection journey. The first integration run exposed a local-pending profile activation starting child listeners too soon; the gate now waits for committed snapshot metadata and the real signup-to-event regression passes. Architecture, schema/index, migration/compatibility, deletion fencing and safety-retention notes are in [connections-pr4.md](../connections-pr4.md). Existing [PR3](https://github.com/inspireo/HACK-Live/pull/3) behavior remains included. Inherited invitation tests mock native-share/clipboard OS contracts only; that does not substitute for any connection authorization test.

Recording collectors continue to write local videos to `docs/evidence/`; `docs/evidence/*.webm` is ignored. Upload those files directly into the PR description, verify the resulting GitHub attachments, and update these links. Do not commit or force-add videos. Screenshots and capture contracts remain tracked; original recording revisions, filenames and timings are historical capture provenance.


## Current contact refinement checkpoint

Full composed immutable `dc907e980b37731725252a94be5829b14c2ce1ce` passed **31 pure + 78 real API/rules + 20 Chromium tests (129/129)**, including 18 real journeys and the two unchanged deterministic cross-account component regressions. All 15 PR3–7 typecheck/build/pure checks pass. This is cumulative runtime evidence, not a claim that all descendant tests ran on isolated PR4. Contact implementation matches PR4 source `f7ae116d914c045acdd214d8ddd0037134ad50bb`; surrounding later-layer profile sections can appear in the cumulative recordings.

Two new original paced recordings are staged locally for root-managed attachment publication. The sender recording is **3,188,748 bytes**, **37.96 seconds**, SHA256 `4be7eedcf6f1cea796499d2e9ca6a3d8a08721d7189cebb9b0a54238d3efb2a6`; recipient is **1,655,287 bytes**, **35.88 seconds**, SHA256 `fd83a3ef88f9a29b4a0a8fe879a3fc9583110f7b9751863ca0f67c5060fb3e38`. Both are **1100×760**. All 949/897 frames decoded, and actual recorded frames plus approved-actions/editor screenshots were visually inspected. No frames were synthesized, retimed or spliced. Local WebMs remain ignored. The historical attachment links above do not show the new contact UI and will be replaced only after root verifies the new uploaded bytes.

The updated journey shows the full selected-field explanation before acceptance, all four approved safe contact actions, then a real editor change removing Mobile/Telegram/WhatsApp sharing and retaining Contact email, followed by unfriend/decline/cancel/block. It validates actual mailto/tel/t.me/wa.me hrefs without external navigation or sending messages. New real browser coverage also seeds a mixed retired-Signal projection, observes read denial and immediate value clearing, dry-runs/applies synthetic cleanup, reloads to recover allowed contact access, renders invalid legacy routes as plaintext correction and removes actions on revocation. Real API/rules tests cover deletion/recreation and concurrent new fields/Save/accept; the synthetic CLI itself is exercised in default dry-run, explicit apply and repeat-apply modes. No production migration was performed or enabled.

[Current capture manifest](pr4-contact-refinement-contract.json) preserves immutable source, hashes, dimensions, decode counts, scope and limitations. Existing baseline capture manifest/revisions remain historical provenance. Services were stopped after the passed suite and ports 3000/8080/9099/9150 verified free.
