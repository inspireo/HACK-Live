# PR5 compact badge photo loading evidence

Validated composed product/test checkpoint: `d05e4fdb6a8bfb048d48f9558ef1a4fc760a2474`. The clean full cumulative run passed **141/141**: 34 pure, 78 API/rules and 29 browser tests (27 real browser journeys plus two existing cross-account component regressions). The focused paced badge test then passed **1/1** using the same source. Later final-parent merges and evidence commits preserve these executed product/test bytes.

The badge always reserves a **56 × 56** slot beside the member name, including the initial selected-details read, neutral no-photo state, protected byte fetch, image decode, loaded image and failure/revocation fallback. Only selected `memberDetails` supplies the URL/title. An unselected owner photo makes no photo request; selected bytes use the real bearer-authenticated API and a blob URL. No owner-private fallback or new API/auth/rules/schema is introduced.

[Current 320px badge loading recording](https://github.com/user-attachments/assets/066c76d8-1f5a-4e30-a675-1314523549b7) replaces only the previous main badge recording in PR5. Other staff/team/legacy-alias clips, all unrelated screenshots/contracts and invitation/connections/attendance/awards evidence remain unchanged. The previous selected-photo capture retains its original provenance in participation-pr5.md.

## Actual capture

- Continuous **23.40-second**, **320 × 740**, 25 fps Chromium recording; **703,066 bytes**.
- SHA-256: `831ff5d13b040b7b7fdf9bb040abe3c948e96e69426df9fa69c7ab797f2e9ced`.
- Full decode passed: **585 frames**. Actual frames at 3/7/11/15/19 seconds were inspected: startup, neutral slot, visible spinner, loaded synthetic raster and revoked neutral slot. Name, title, role chip and profile QR stay fixed through the photo states.
- Auth, Firestore, selected projection changes, trusted saves, photo bytes and browser image decode are real synthetic emulator interactions. The owner changes sharing in another signed-in editor tab while this clip continuously records the badge tab. A real authenticated response is held for the readable loading state; a replacement response is released only after sharing is revoked. The browser assertions compare the complete slot/name/header/QR geometry and reject horizontal overflow at 320px.
- The complete existing role/resource/event-selector/QR-decode/team/alias/deletion tests still pass in the normal cumulative suite. This focused movie demonstrates the changed photo behavior; it does not claim to contain those additional interactions.
- No production data, physical phone, live OAuth, fabricated frames or security mocks. This focused test does not exercise or mock native sharing/clipboard adapters.

## Stills and capture contract

[Loading](pr5-badge-photo-loading-320.png) · [Loaded](pr5-badge-photo-loaded-320.png) · [Revoked](pr5-badge-photo-revoked-320.png) · [Machine-readable contract](pr5-photo-loading-browser-contract.json).

The frozen WebM stays ignored and uncommitted. Official CLI publication rendered four native PR5 players, preserved the other three URLs, and downloaded private rendered bytes matching the frozen file/hash. All ports 3000/8080/9099/9150 were verified free after orderly shutdown and explicitly released. Normal and paced logs are retained in this worker's task memory; no additional local runtime is required.

## Repeat

After a normal cumulative pass, run the existing `participation-journey.spec.ts` test matching `badge reserves compact photo geometry` with `PARTICIPATION_DEMO=true`, a 320×740 page/video viewport and the same real app/emulator environment. Use a separate Playwright output directory; collect only the badge page's recording (not the editor tab). Preserve the unrelated historical collector outputs and source contracts.
