# PR5 preparation: event participation, team labels and personal badge

Prepared against PR1 checkpoint `31be92c`; final PR4 base, cumulative emulator/browser execution and reviewer-accessible video remain integration gates. Nothing is published or deployed by preparation.

## Stable schema and compatibility contract

Fields added ONLY to the existing `participants/{participantId}` row (referenced by the existing unique `registrations/{sessionId}~{uid}` pointer):

| Field | Meaning |
| --- | --- |
| `officialRoles?: EventRole[]` | Nonempty unique subset of `participant`, `mentor`, `volunteer`, `judge`, `challenge owner`, `organizer/facilitator`. Missing means `['participant']` for compatibility. Explicit roles replace the whole set. Multiple roles are allowed. These are labels, never platform/event authority. |
| `roleChallengeId?: string\|null` | Optional reference to a challenge in the SAME event, only with `challenge owner`. No permission grant. |
| `participationState?: 'active'\|'inactive'` | Missing means active. Inactive participation cannot allocate or display a badge. The row/pointer remain, so reenabling reuses identity. |
| `teamRoleLabels?: Record<string,string>` | Key is `collectionName~teamId`; value is `lead`, `developer`, `designer`, `researcher`, or empty (cleared). Collections: `teams`, `discoveryTeams`, `formingTeams`, `formingDiscoveryTeams`. Labels only apply while membership of that exact team exists. Professional title and collaboration archetypes are unrelated. |

`shared/participation.ts` exports `EVENT_ROLES`, `EventRole`, `Participation`, `TEAM_LABELS`, `allocationEligible`, `officialRoles`, `teamMembership`, `profileUrl`, `badgeMemberDetails`.

`allocationEligible(member)` is false for deleted identity, inactive participation, or an explicit role set without participant. Missing roles preserve historical allocation. Mixed participant+mentor remains eligible. This predicate feeds the same admin candidate pool used by AI and normal discovery/solution allocation, and the manual participant list. Rules reject staff-only final assignment and ordinary forming-team participation; trusted finalization rechecks eligibility.

Removing participant or deactivating participation is rejected (409) while ANY final membership alias or forming-team membership exists. Organizer first uses existing remove/leave workflows, then changes roles. No automatic team eviction or leadership transfer is invented. Actual leaderId is retained in finalization for BOTH team kinds. Labels transfer from the forming key to the new final team key; labels do not alter leaderId. Final membership checks resolve `teamId`/`solutioning_team_id` and `discoveryTeamId`/`discovery_team_id`. Stale labels are hidden whenever the team or membership no longer exists. Rejoining the same surviving team can reuse its descriptive label.

No backfill, new index, new registration collection, contacts, attendance, awards or connections. Deploy trusted routes/rules/client together after cumulative integration. Legacy name-only participant behavior defaults unchanged. Existing registered pointer is always reused; an ambiguous historical UID without a trusted pointer requires organizer linking. New staff-only participation creates one row/pointer transactionally using canonical profile name. No registration-default changes or repeated name/profile entry.

## API and trust boundaries

Routes install in `server/participation.ts` AFTER PR1 bearer verification in `server/identity.ts`:

- `POST /api/identity/event-roles` `{sessionId,memberUid,roles,challengeId?:string|null,participationState?:'active'|'inactive'}` → `{participantId}`. Existing session owner, private `sessionAccess.adminEmails`, existing `users.role == admin`, or existing bootstrap platform admin only. Target must be verified, enabled, non-anonymous with active profile. Transaction checks event, profile, pointer identity, challenge event and team consistency. An already-authorized event administrator may assign their own labels through this same authority check; ordinary members cannot self-promote, even if staff previously issued an organizer/facilitator label. No label is used for authorization.
- `POST /api/identity/team-role` `{collectionName,teamId,participantId,label}` → `{updated:true}`. Target must be active/eligible, in this event/team. Member edits own label; actual leader edits any current member; event staff edits any current member. All membership, leader and label reads/writes occur in one transaction. Browser cannot write label or official-role fields directly.
- `POST /api/identity/my-badges` `{}` → `{badges:[{sessionId,eventName,eventDate,name,roles,teams}]}`. Derives UID from bearer token; no arbitrary target member. Uses pointers, current active profile, live participation and existing/non-inactive event; validates final team event. Explicit projection never contains private/contact/admin/credential data. `teams` includes current name, kind, label and identifiers for authorized own label editing.

Badge route `/badge?event=<sessionId>` is inside MemberGate, with account/event access links and an event selector. Source listeners invalidate stale cards on participant/pointer/event/team changes. Profile deletion unmounts the member UI. QR contains ONLY `${origin}/members/${opaqueUid}`; signed-out destination and query remain through PR1 MemberGate. Viewing never connects/checks in. Native Web Share uses the same URL; clipboard and selectable visible link are fallbacks. QR is black on white with a four-module quiet zone, responsive down to 320 CSS px. Browser-mocked sharing is not native OS evidence.

PR2 integration: optional photo/title come exclusively from get-only `memberDetails/{uid}` top-level `avatarUrl`/`title`. Missing/denied document produces name-only badge on preparation base. `badgeMemberDetails` allowlists these keys, permits credential-free HTTPS photos, and cannot carry contacts or canonical private data. Never read another member's `profileDetails`. Professional title renders apart from official event roles and team labels.

## Deletion and PR1 integration seam

Existing participant tombstone update additionally deletes `officialRoles`, `roleChallengeId`, `teamRoleLabels`, and sets `participationState:'inactive'`. No new child collections, shared content or Auth/users/event-owner deletion. Reconcile these FOUR fields into PR1's final durable cleanup manifest rather than replacing its fixes. No badge snapshot is persisted to clean up. Missing pointer/profile/event or inactive participation immediately excludes new badge responses. Profile lifecycle gate hides in-progress deletions.

For PR1's pending organizer `remove-registration` interface, preserve its transactional pointer/team cleanup: deleting the participant row naturally removes these fields; if it keeps a tombstone, add the same four-field scrub to that manifest. Badge reads must keep resolving the pointer, never an independent cached badge record.

Formation rules add eligibility and immutable-leader guards; finalization adds only eligibility, leader retention and label transfer. Rebase onto PR1's transactional assignment/formation/deletion interfaces, preserving its stricter concurrency protections. Attendance/award preparation should reference existing participantId/sessionId/memberId and the fields/helpers above, never infer permissions from roles.

## Regression and evidence gates

Safe preparation commands: `npm ci`, `npm run typecheck`, `npm run build`, `node --import tsx --test tests/participation-pure.test.ts`.

Integration must use the EXISTING `npm run test:emulators`, `tests/fixtures.ts` and `tests/browser` harness. Parent owns 3000/8080/9099; do not run, clear fixtures or start/stop its services before root releases them. New tests will be wired sequentially into its suite; no competing harness. Final PR4 rebase, cumulative tests, actual browser staff→badge journey, mobile viewport/QR decode and reviewer-accessible synthetic-data video are required before PR publication. No actual native-mobile OS sharing evidence is claimed.

Prepared verification (2026-11-12): `npm ci` passed; `npm run typecheck` passed; `npm run build` passed (existing large-bundle warning); `node --import tsx --test tests/participation-pure.test.ts` passed 4/4. Preparation host uses Node 26.13.0; the final harness should use PR1's documented Node 24 environment. No emulator or Playwright journey has been executed in this preparation, and no video is claimed.

`tests/participation.test.ts` uses the existing fixtures/rules setup and runs sequentially after `identity.test.ts` in `scripts/emulator-suite.mjs`. It covers actual bearer/rules authorization, all existing staff authorities, labels not granting authority, challenge event isolation, pointer reuse, staff-only assignment denial in both phases, role-change/team conflicts, self/leader/staff label edits, former-leader denial, naming compatibility, forming→final label/leadership transfer, membership invalidation and deletion cleanup. It clears fixtures only when the released shared harness runs it, never during preparation. Existing PR1 checkpoint tests already reference `remove-registration`, which is absent from that checkpoint's server; reconcile against PR1's final implementation rather than interpreting this WIP as cumulative green.

`tests/browser/participation-journey.spec.ts` prepares the real organizer assignment→staff-only event flow→320 CSS px badge→rasterized QR decode→second-event selector→signed-out decoded destination→real sign-in→live revocation→profile deletion journey. `jsqr` is test-only and decodes actual qrcode.react SVG raster pixels. Auth, role API, pointers, profile reads and badge rendering are not mocked. Only Web Share and clipboard rejection adapters are mocked; these are browser contract checks, not native OS evidence. Existing Playwright video remains enabled; the additional mobile context writes under `test-results/pr5-mobile`. After actual successful execution, publish accessible video with the PR; a local path alone is insufficient.

Test collection only was verified with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:1 node --import tsx node_modules/@playwright/test/cli.js test --list`: 4 journeys in 2 specs. Port 1 is deliberately unreachable; `--list` does not run fixture hooks or connect to emulators. Listing without emulator environment was refused by the existing fixture guard. No shared app or emulator requests were made.
