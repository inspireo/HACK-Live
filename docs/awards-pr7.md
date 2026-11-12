# PR7 preparation: official awards and historical achievements

HACKLIVE-9. Preparation base: immutable PR5 `a7e9fb7204305d844663d29d106d58f4aa03e25f` (PR1 ancestor `31be92c`). Branch: `bb/prepare-pr7-historical-awards-and-wins-thr_6exdqasrz3`. This is a local prepared slice, not a publishable release. Root must supply the validated final PR6 base before rebase, cumulative tests, recording, push or actual PR7 creation.

## Behavior and audiences

An award category describes an individual or team distinction. Each result has one individual or one final solution/discovery team recipient; multiple results in one category support multiple winners. These are awards, not judging scores, tournament placements, attendance or a participation ledger. Missing awards never imply competed-and-lost. `randomizer.hasPresented`, profile claims and historical mutable `uid`/passcode fields have no authority to confer credit.

Staff create categories, save staff-only drafts, publish explicitly, discard drafts, finalize an event's results, correct a published category, revoke an award, and reopen finalized results for deliberate backfill. Closed/past events can be backfilled. Finalization refuses unresolved drafts and blocks new categories, drafts and publication until reopened; audited category corrections and revocations remain possible. Revocation is terminal. A wrong recipient is corrected by revoking and issuing a replacement, rather than rewriting an issued roster. Categories themselves are immutable; creating a corrected category and moving a result preserves the published historical distinction until the explicit correction.

* Event owner, private `sessionAccess.adminEmails` coadmins and existing platform administrators manage relevant drafts and audits. `officialRoles` (including judge, mentor and organizer labels), team labels and actual team leadership never grant publishing power.
* Owners see their own published, safely attributed achievements, including records hidden from their profile. New records default to `visibleOnProfile:false`; each owner explicitly selects profile records. Staff cannot select somebody else's profile visibility.
* Other verified, nonanonymous signed-in members see only selected profile achievements. Independently, official published event results are available to verified signed-in community members and can name verified recipients even when a recipient hides their profile achievement. This audience distinction is explained in both interfaces.
* Signed-out, anonymous and unverified identities cannot use any award API or view profiles/results. A deleting/deleted recipient profile cannot be read as a member achievement. Safe event summaries anonymize unavailable identities immediately; source cleanup removes attribution durably during integration.

The admin component is isolated in `src/pages/admin/AwardsTab.tsx`; one tab is added to AdminSession. `Achievements` appends to existing account/member pages without replacing profile editing/history. The event view lives at `/results/:sessionId`, linked from the participant header, admin tab and achievement cards. Views refresh on explicit request; profile achievements also refresh on window focus. API reads rejoin authoritative published sources rather than trusting stale copied summaries.

## Stable schema and names

All new collections are server-only in Firestore rules, including staff reads/writes; API responses enforce the audience and allowlists. No modification of `profiles/{uid}`'s exact `{name,state}` contract. No new registration or participant row. Existing `participants/{participantId}` and `registrations/{sessionId}~{uid}` are reused. PR2 `memberDetails` and PR6 attendance remain independent.

| Path | Contract |
| --- | --- |
| `eventAwardCategories/{categoryId}` | `{sessionId,name,kind:'individual'|'team'}`. Category name up to 100 characters; immutable, event-scoped. |
| `eventResults/{sessionId}` | `{revision:number,finalized:boolean,updatedAt:ISO}`. Missing means revision 0, open. Every staff mutation updates revision transactionally; caller must supply exact expectedRevision. |
| `awardResults/{resultId}` | `{sessionId,categoryId,kind,target,status:'draft'|'published'|'revoked',updatedAt,updatedBy}` plus published `{snapshot,publishedAt,subjectUids:string[],participantIds:string[]}`. Target is `{participantId}` or `{collectionName:'teams'|'discoveryTeams',teamId}`. No forming team awards. Updated actor may be null after deletion. An anonymized individual target may be null. |
| `awardResults.snapshot` | `{eventName,eventDate:string|null,categoryName,team:{collectionName,teamId,name}|null,recipients:[{participantId:string|null,memberId:string|null,name,credit:'verified'|'unlinked'|'deleted'|'ineligible'}]}`. Issue-time metadata and eligible credited membership freeze at first publication. |
| `memberAchievements/{uid}/awards/{resultId}` | `{sessionId,resultId,visibleOnProfile:boolean}`. Verified credit only; no duplicated summary/name/contact data. Read API rejoins the current published source. Corrections retain visibility; revocation deletes projections. |
| `awardAudits/{auditId}` | `{sessionId,resultId:string|null,action,revision,actorUid:string|null,reason:string|null,at:ISO,subjectUids:string[]}`. Authorized staff only. Correction/revocation/reopen require a private reason up to 100 characters. Social deletion scrubs actor/subject attribution and associated reason while retaining action, revision, event/result references and timestamp. |

`shared/awards.ts` exports category, target, snapshot, recipient and safe summary types, input validators and the summary allowlist. Public summary fields are exactly `{id,sessionId,eventName,eventDate,categoryName,teamName,publishedAt,recipientNames}`. No contact, participant/member identifiers, arbitrary profile fields, actor or audit reason flows into community summaries. An unlinked/ineligible historical recipient is represented explicitly as uncredited rather than silently assigned to an account. Its unverified name is not projected. A team aggregate remains published with other members' credit intact when a recipient is deleted.

## Publication and concurrency trust boundaries

`server/awards.ts` installs after PR1's verified nonanonymous bearer middleware in `server/identity.ts`. Every mutation checks event/staff authority inside a transaction; labels are never consulted for permission. Cross-event category/result/team/participant references are rejected, including draft recipients. Draft recipient relationships are revalidated on publication.

Team membership is discovered from the existing participant aliases (`teamId`/`solutioning_team_id`, `discoveryTeamId`/`discovery_team_id`), scoped to the same event. Both aliases are queried and deduplicated; conflicting nonempty aliases reject publication. `allocationEligible` controls team personal-credit eligibility. All current recorded members are represented in the snapshot; staff-only/inactive members are explicitly ineligible. Individual recognition does not require the participant allocation role (e.g. a mentor can receive recognition). A historical final team with no remaining recorded members can receive an explicitly team-only award with no personal credit. There is a deliberate limit of 80 recorded members per team award to keep transactions bounded; no partial roster is silently credited.

Personal credit requires BOTH matching participant `memberId`/`uid`, the trusted exact event registration pointer and its matching `uid`/`sessionId`, an active profile and an enabled verified nonanonymous Auth account. Canonical name comes from the minimal profile. Old mutable uid/name/passcode alone cannot credit anything. No later legacy linking retroactively confers credit; staff must revoke and reissue after independent organizer linking if credit needs to change.

Membership, team metadata, source participant, registration pointer, profile, category, authority and results revision are read in the publication transaction. Concurrent source edits cause retry. The first successful publication stores the snapshot; later team rename/move/removal or profile rename cannot rewrite it. Correction reads that stored snapshot. The event-wide revision serializes staff operations and finalization; stale requests receive 409 and UI refreshes. Reads for event/member views and visibility changes are transactional with source/profile checks, preventing a mixed revoked/visible source response.

Award writes read actor and credited profiles transactionally. An inactive/deleting recipient cannot acquire new personal references/projections; team publication uses an anonymized recipient, individual drafting/publication rejects unavailable profiles, and correction anonymizes unavailable recipients. Deleting staff retain their existing authority but later actions carry null social actor/reason attribution. This prevents new award/audit references from appearing after a deletion manifest was captured.

## API (POST, `/api/identity` prefix)

| Route | Request and response |
| --- | --- |
| `/awards/manage` | `{sessionId,action,expectedRevision,...}` -> `{revision,id}`. `category:{name,kind}`; `draft:{categoryId,target,resultId?}` creates/replaces a draft; `publish/discard:{resultId}`; `correct:{resultId,categoryId,reason}` same recipient kind only; `revoke:{resultId,reason}`; `finalize:{}`; `reopen:{reason}`. No direct client writes. |
| `/awards/staff` | `{sessionId}` -> `{state,categories,results,audits}` relevant authorized staff only. |
| `/awards/event` | `{sessionId}` -> `{finalized,awards:AwardSummary[]}` published summaries only, regardless of recipient profile selection. |
| `/awards/member` | `{memberId?}` defaults to bearer UID -> `{own,awards}`. Own records include `visibleOnProfile`; another member's response filters to selected records and contains no visibility control. |
| `/awards/visibility` | `{resultId,visibleOnProfile:boolean}` -> `{updated:true}` bearer owner of that verified published credit only. Arbitrary memberUid/claims cannot select another member. |

## PR1 durable deletion integration seam — required before publication

The checkpoint contains the old state-only BulkWriter cleanup, while root is replacing it with the durable generation fence. This preparation deliberately does **not** wire award writes into that obsolete helper. `server/award-cleanup.ts` is the adapter for the final PR1 helper; final PR6 rebase must wire it and extend the actual `/delete-profile` end-to-end regression. This is an outstanding release gate, not claimed deletion completion.

1. During PR1's fenced planning phase, pass its immutable manifest participant IDs to `planAwardCleanup(database, transaction, uid, participantIds)`. Persist the returned `AwardCleanupPlan` (`resultIds`, `auditIds`, `achievementIds`, `participantIds`) in the SAME durable generation manifest **before** any source/participant/UID scrubbing. Merge IDs with any saved plan on recovery; never replace recovery IDs with rediscovery after partial cleanup.
2. For each saved result/audit/achievement ID, call `scrubAwardRecord(database, uid, savedPlan, type, recordId, assertGeneration)`. The injected callback MUST read and assert the final active generation and deleting lifecycle within that same transaction. The adapter does no raw BulkWriter work, rejects IDs outside the plan, updates current source state transactionally and is idempotent. Use the parent's checkpoint/progress and retry machinery; each record is a bounded transaction.
3. Results remove matching subject/participant IDs and individual target attribution; unresolved individual drafts become revoked. Snapshot recipient name/IDs become the explicit deleted-recipient marker. Team/category/event snapshots and all other recipients remain. Audit personal references/reason are scrubbed; action/revision/time remain. Only the deleted member's projection subcollection is removed. No Auth user, users/platform role, event owner, other member projection or shared team award is deleted.
4. Finish profile deletion only after every saved award cleanup ID is acknowledged through the parent fence. Run failure-after-partial-scrub and old-generation resumption against the actual integrated route. Returning/new social profiles must not regain old award credit.

Current helper tests cover real Firestore transactions, a saved manifest surviving a real failing SDK update, stale generation rejection and preserved aggregate/peer credit. They are authored but unexecuted during preparation. They do not substitute for final end-to-end PR1 deletion integration.

## Indexes, migration, backfill and compatibility

Additive collection/schema rollout. Missing eventResults means no finalization and no awards. Existing participant rows without official roles follow PR5 defaults; no attendance fields are read/written. No new contact/profile fields or registration defaults. Category/team/event names freeze at publication; updates do not require live historical source teams to survive. Revocations remove projections transactionally while retaining the private source/audit.

`firestore.indexes.json` adds `awardResults(sessionId,status)` and `participants(sessionId,<each final membership alias>)` ascending composite indexes. All single-field equality/array discovery indexes use Firestore's defaults. Merge these with final PR6 indexes rather than replacing them. Deploy indexes before enabling the routes/client; deploy rules, trusted API, cleanup integration and UI together. No automated historical migration/backfill exists or runs. Only staff explicit UI/API issuance with reviewed event/recipient relationships backfills history. Presentation history is never transformed into wins.

## Repeatable validation and actual results

Executed in this managed worktree without starting/stopping services or touching shared fixtures:

* `rtk npm ci` — success. Existing lockfile dependency audit reports 34 vulnerabilities and current Node 26 engine/deprecation warnings; no dependency changes made.
* `rtk npm run typecheck` — passed (rerun after final preparation changes).
* `rtk npm run build` — passed; Vite reports existing large bundle warning.
* `rtk proxy node --import tsx --test tests/awards-pure.test.ts` — 2/2 pass (input boundaries and summary allowlist).
* `rtk git diff --check` — passed.

Auth/rules/API regressions are in `tests/awards.test.ts`, use existing `tests/fixtures.ts`, and run sequentially after identity in `scripts/emulator-suite.mjs`. They cover real unauthorized API/rule reads/writes; coadmin/platform authorization and label non-authority; cross-event and forged recipients; draft hiding; publication; invalid legacy attribution/missing pointer/disabled identity; multiple winners; profile privacy; coherent concurrent team edits and later membership changes; optimistic conflicts; draft discard/finalize/reopen/correct/revoke; deletion manifests, real partial failure/retry and stale fencing with preserved peer credit.

`tests/browser/awards-journey.spec.ts` uses real Auth/API/rules and the existing browser harness: staff create and publish individual/team awards, finalize, member views and selects profile credit, other member verifies profile/event audiences, staff removes a member through the existing Collaboration UI, credit survives, staff corrects/revokes, projections update. Synthetic initial team fixtures use Admin SDK only for setup. Video is configured for staff/member/viewer contexts. No auth/security mocks prove anything.

**Not executed yet:** `rtk npm run test:emulators` (includes browser suite), actual browser recording, final PR6 rebase/cumulative regression, integrated durable deletion route tests. Parent owns app3000/Firestore8080/Auth9099/demo-hack-live; run only after root grants an exclusive window. Extend cumulative suite with final PR5/PR6 tests without losing their ordering. After passing, record the synthetic journey and upload actual video to a reviewer-accessible location with a tested link in actual PR7. No video/media exists yet and no local path is claimed as reviewer-accessible evidence. Do not publish until these gates pass.
