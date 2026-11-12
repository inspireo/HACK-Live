# Approved connections (PR4)

Rebased ONLY the prepared PR4 commit after immutable PR2 `8ff5c4f40b31159aa7f8dae29db901cbd81ff846` onto tested PR3 `476eaa1de3cadf7b0b17a6035a04656270b7b082`, then replayed ONLY PR4 onto final PR3 `63df44819f90b42b05a95af93f5cb6799a427fa1` ([PR3](https://github.com/inspireo/HACK-Live/pull/3), branch `bb/prepare-pr3-mobile-event-invitations-thr_edj5aij4t9`), containing exact final PR2 `90322896` and final PR1. No parent WIP replayed or ancestors amended. Root released exclusive app3000/Auth9099/Firestore8080/9150 ownership for this validation/recording window.

## Schema and authorization

`profiles/{uid}` remains EXACT `{name,state}`. `profileDetails` remains the owner-only canonical source defined in `profile-pr2.md`. `memberDetails` remains selected professional values only. No contacts, relationships or notifications enter event, participant, public, session or staff-authority data.

New server-only write surfaces:

| Path | Fields / purpose | Client reads |
| --- | --- | --- |
| `connectionPairs/{sha256(JSON.stringify(sortedPairUids))}` | `members` (two sorted uids), `requester`, `generation` (random UUID per new pending request or block), `state` | None, including admins |
| `connectionViews/{owner}/peers/{peer}` | `pairId`, `peerUid`, `requester`, `generation`, `state`, `unread` | Only active verified owner can get/list their own peers |
| `connectionContacts/{uid}` | ONLY populated globally selected contact key/value pairs, no wrapper or selection metadata | Get only when BOTH profiles active, canonical pair and BOTH mirrors accepted with same generation; no list, even owner/admin |
| `connectionBlocks/{owner}/targets/{sha256(JSON.stringify(['connection-block-v1', targetUid]))}` | Empty document, no raw target uid/name/contact/timestamp | None, including owner/admin |

The existing verified non-anonymous token middleware supplies the actor. The API validates payload keys and peer identity; it never accepts requester/member/owner identities from payload. Every operation reads both lifecycle documents, pair, both block preferences and mirrors inside a Firestore transaction. Pair, mirrors and new block commit atomically. Client rules deny every relation/block/contact write, including forged accepted views. Contact rules check the canonical pair and both mirrors: accepted state, pair id, generation and exact membership must agree. A block atomically changes the blocker's mirror to blocked and the other's mirror to removed, so either direction fails authorization immediately. There is no grant to staff/event permissions, no visitor access, and no inference from team membership or attendance.

Acceptance also initializes both projections from validated canonical sources inside the same transaction, so existing PR2 global selections work without a bulk backfill. Its source reads conflict with concurrent saves/deletion. Inspection derives only the selected populated field keys from that source.

`POST save-profile` now atomically replaces private source, professional projection and selected-only contact projection after reading the active lifecycle. Changes to selected fields or values apply to every existing and future accepted connection. Empty selection yields `{}`. Owner reads private source; no contact data is returned by request inspection. Revocation controls subsequent authorized reads; it cannot recall copied information.

## Transaction and API contract

All endpoints below are `POST /api/identity/connections/{action}`, bearer token required. Body EXACT `{peerUid, generation?}`. Self operations, unknown fields/actions, invalid peer ids are 400. Unverified/anonymous actors are 403; absent/invalid tokens are 401. Unavailable lifecycle, disallowed transition, block or stale generation is 409. Payload actors and attempts to write another person's block are rejected.

| Action | Required state / actor | Result |
| --- | --- | --- |
| `request` | Active peers, neither has blocked; no generation needed | Creates pending with new random generation; existing pending/accepted returns unchanged actor view |
| `accept` / `decline` | Pending, ONLY recipient, matching generation | Accepted / declined |
| `cancel` | Pending, ONLY original sender, matching generation | Cancelled |
| `unfriend` | Accepted, either party, matching generation | Removed |
| `block` | Active peers, either party, no generation needed | Blocked + own empty hashed preference; cannot write peer preference |
| `seen` | Existing, unblocked, matching generation | Clears only actor's unread indicator |
| `inspect` | Active peers | State, own selected populated field KEYS; peer keys only for this pair's pending/accepted request; blocked returns only generic unavailable state |

Mutation responses are the actor view. Canonical pair never leaves the server. The first serialized opposite request stays pending: it does not imply consent. Duplicate request retries preserve the same generation and notification. A later request after decline/cancel/unfriend gets a fresh UUID. Accept/decline/cancel/unfriend/seen require the exact generation plus current state and actor checks: a stale acceptance can neither accept a cancelled generation nor approve a newer request. Request-vs-block, accept-vs-cancel, accept-vs-unfriend/block and lifecycle deletion serialize through common document reads. Block intentionally needs no generation so a safety action always takes effect even from an old screen. No unblock action is provided in this slice.

Incoming pending and newly accepted views set only the other party's `unread`; own action clears own unread. These private views supply incoming/outgoing/accepted lists and in-app indicators. No email, messaging, per-connection selection or separate notification collection exists.

## Deletion / retained safety preference

Mark-deleting immediately denies contacts in both directions through active-profile checks, before cleanup. Accept/request/block and save transactions read lifecycle, conflict/retry against marking, and cannot recreate edges/projections while deleting. Cleanup removes deterministic contact projection, all pairs with `members array-contains uid`, own peer views, incoming peer views (`collectionGroup peers` by `peerUid`), and own block preferences. Incoming views are independently queryable so retries still remove them if an earlier partial run already deleted the pair. All mutations go through final PR1's bounded transaction queue: EVERY batch reads/locks `profileDeletionJobs/{uid}.attemptId` before deleting, extends the lease and fails on takeover. Final tombstone/job removal also checks the attempt. No BulkWriter or raw cleanup writes exist. PR4 adds deterministic `connectionContacts` to the same fenced queue alongside PR2 source/projection, and invokes pair/view/own-block discovery through that queue. The durable parent manifest's participant/proposal recovery keys are preserved; connection cleanup needs no new erased-attribution manifest keys because pair members and view peerUid persist until whole-document deletion, and incoming views are discovered independently of pairs. Failed batches retain deleting; retry owns a new attempt and repeats independent discovery. A stale worker may discover fresh recreated documents, but cannot mutate any of them because every execution batch checks the current attempt.

OTHER members' safety preferences remain as empty server-only target digests. They retain no deleted name, contact, raw target uid, notification, request history or timestamps. This minimal pseudonymous reference is justified to prevent deletion/recreation with the same Auth account bypassing another member's safety choice. It is not claimed anonymous: the server can compare a known Auth uid's digest. Rules never expose or enumerate it, even to its owner. Deleting the blocker’s own profile removes their own preferences as part of their requested cleanup; it never silently erases another person's safety choice. Auth accounts, admin roles and event ownership remain unchanged.

## Index / migration / compatibility

No existing records are backfilled or inferred. Missing contacts/views mean private/unconnected. Existing name-only accounts and registration continue to work. Automatic single-field indexes cover pair `members array-contains` and owner view lists; one explicit `COLLECTION_GROUP` ascending `peers.peerUid` index supports durable cleanup. No composite index is needed. Deploy index and restrictive rules with the trusted server before exposing UI. Existing PR2 global selections materialize at mutual acceptance (or explicit validated save); missing source is empty/private. Never copy legacy participant contacts. Rollback UI first; preserve deletion and revocation rules/server cleanup. Do not revert to an older save implementation leaving a stale projection while contacts are enabled.

## UI integration seams

`src/connections.tsx` exports `ConnectionPanel({peerUid})`, `ConnectionIndicator`, `ConnectionsPage`. The panel is appended after final PR2's `MemberDetails`, the indicator is mounted in member navigation and `/connections` has its own route; final PR3 invitation sharing remains intact. These components own no private-field editor or registration flow. A profile request confirmation explains sender-selected fields; incoming acceptance explains each party's selected field labels and global/later-change behavior. Accepted contacts subscribe to the authorized projection; permission errors clear them. Lifecycle/missing names fall back to “Member unavailable”. Final PR2's actual `src/profile-details.tsx` editor and member presentation remain intact. Contact copy and checkbox labels now explain global sharing with all approved connections, immediate effects of saved value/selection changes, revocation and the limit on recalling copies.

## Repeatable validation and video gate

Use Node 24 and Java 21. Safe checks:

```
rtk npm ci
rtk npm run typecheck
rtk npm run build
rtk proxy node --import tsx --test tests/profile-pure.test.ts tests/eventInvitation.test.ts tests/connections-pure.test.ts
rtk git diff --check
```

Original preparation results (2026-11-12): dependency installation, typecheck, production build and diff whitespace check passed; all 3 connection pure tests passed. Integrated checkpoint safe results are recorded in the author handoff; real service tests remain deferred. Build reports its large-bundle warning. Dependency installation reports existing audit/Node-engine warnings; no dependency or lockfile changes were made. Real Auth/Firestore/API/browser tests have been written but not run while parent owns shared services. No video has been recorded or published.

After reconciliation onto `476eaa1`: typecheck, build and diff check PASS; the combined pure run passes all 15 tests (3 profile, 9 invitation, 3 connection). React checklist checked hook dependencies/subscription cleanup, escaped text rendering, accessible editor labels and preservation of parent UI. These checks do not establish real emulator transaction or browser behavior; those remain release gates.

Final parent `63df448` normal validation (Node 24 / Java 21): typecheck/build PASS, 15 pure + 27 real API/rules + 8 Chromium tests PASS. The first cumulative run exposed profile activation starting child listeners from a local pending write; `MemberGate` now waits for its committed metadata snapshot. The existing real signup/verification/registration regression passes with that fix. Paced capture adds reading holds only under `CONNECTIONS_DEMO=true`, plus a manifest and collector that refuse failed/nonpaced evidence; no Auth, Firestore, API or rule mocks are used for connection evidence.

With exclusive ownership of app3000/Firestore8080/Auth9099 + `demo-hack-live` fixtures:

```
rtk npm run test:emulators
```

Runner retains parent profile pure and invitation tests, adds connection pure tests, executes real identity and connection rules/API tests sequentially (`--test-concurrency=1` to serialize fixture resets), then all parent and new browser journeys. `tests/connections.test.ts` exercises unauthenticated/unverified/anonymous and unrelated/admin reads/writes, spoofing, projection whitelist, duplicate/opposite requests, recipient-only acceptance, stale generations, global selection updates, unfriend/block, deletion races, bounded partial failure/retry and safety retention. Its stale-worker regression discovers connections both before takeover and after recreation, then proves fresh source/contact/professional projections, same-pair new generations, both views, newly chosen own blocks and retained other-member safety preferences all survive both stale finish attempts. No authorization mocks. Pure tests cover identity encoding, projection and transition policy only; they do not establish Firestore concurrency correctness.

`tests/browser/connections.spec.ts` uses two real Auth/Firestore accounts and records request → accept → selected contacts → global selection update → unfriend → no contacts, plus decline/cancel/block. The global selection-change step navigates to the REAL final PR2 profile editor, unchecks Phone, checks Contact email and saves through its UI; there is no save API shortcut for that step. Parent profile/registration/invitation journeys remain, with profile expectations updated for selected-only contact projection and current sharing labels. Existing Playwright config records video for both contexts. Reviewer-accessible upload URL of actual successful journey, exact cumulative suite results, and final parent branch/SHA are required before PR4 publication. A local video path or test definition is not evidence of a passed journey. Actual current results and reviewer-accessible media are recorded in the evidence document linked below.
