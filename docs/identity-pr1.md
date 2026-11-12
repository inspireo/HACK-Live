# PR1: permanent sign-in and reusable registration

## User journey and decisions

Anyone can create a permanent Firebase account and a minimal social profile, independently of joining an event. Google and verified email/password are supported. An anonymous Firebase session is **not** a registered member. Verification uses Firebase's delivered email; users explicitly refresh verification before proceeding. Password reset and resend-verification are available. Google linking preserves an existing anonymous Auth identity when possible, but **does not prove ownership of historical participant rows**.

The destination URL, including its query, stays in the address bar during sign-in and profile setup. There is no user-supplied redirect target or open redirect. Firebase persistence restores sign-in after reload. Another device signs into the same permanent account and finds the same event registration through a trusted pointer, independent of localStorage. Account creation never automatically registers for an event. A user confirms their reusable descriptor/proficiency at each new event; their name is prefilled from their profile, not asked twice. Workshop name snapshots may differ from later profile edits.

Community profiles contain only a name. `/members` and `/members/:memberId` are registered-account-only. Workshop/community reads now require verified registered Firebase authentication too. `/display/:sessionId` still renders the existing projector screen with no account navigation and no social-profile prerequisite; the projector signs in once to access member-visible workshop data. Existing administrators do not need a social profile to use `/admin` or `/admin/:sessionId`.

Legacy name/phone passcodes, historical `uid`, and localStorage IDs are untrusted: the old rules allowed passcode-based UID replacement. An organizer independently verifies the person and target account ID, then uses **Participants → Link a legacy registration**. Only an event owner, private configured co-administrator, or existing platform administrator may link. Linking preserves the participant document ID and team/workshop references. A linked row or existing account registration causes a conflict; no blind merge/overwrite occurs. A matching historical UID blocks ordinary re-registration and asks for organizer reconciliation. Legacy records with a different old UID cannot reliably be recognized as the same human automatically; the join screen tells returning users to request linking before creating a new registration. No name/phone matching or auto-backfill of ownership occurs.

**Delete profile** removes social identity/reusable information, personal welcome answers and votes, and scrubs known proposal attribution and team references. Shared workshop content remains anonymized, with deleted-member participant tombstones. Auth login, platform `users` role, private event admin configuration, and event ownership remain. A fresh social profile may be created later, without reviving previous personal data. A recent sign-in (five minutes) is required; interrupted deletion is retryable from its durable `deleting` state.

## Schema and compatibility

| Collection | Contract |
| --- | --- |
| `profiles/{uid}` | Exactly `{name, state:'active'}` for a live minimal public profile. Owner can create/update only these fields. Trusted deletion writes `{state:'deleting'}` then `{state:'deleted'}`; non-active profiles are private to owner. No platform role or contacts. |
| `registrationDefaults/{uid}` | Owner-private reusable `{adjective, designThinkingProficiency}`. No contacts. |
| `registrations/{sessionId}~{uid}` | Trusted-only unique pointer `{uid, sessionId, participantId, linkedBy?}`. Readable only by owning member. Transaction serialization prevents concurrent duplicates. |
| `participants/{existingOrNewId}` | Existing session/workshop fields retained; new trusted `memberId` equals permanent `uid`. Client cannot create rows or change either identity. Legacy IDs survive approved linking. No contact/passcode fields on new/migrated rows. Deletion clears uid/memberId, scrubs personal fields and writes `identityState:'deleted'`; tombstones cannot be linked. |
| `sessionAccess/{sessionId}` | Private `{ownerEmail, adminEmails}` moved out of community-readable sessions. Existing administrator model and platform roles remain authoritative. Only session administrators can read/manage. |
| `legacyParticipantSecrets/{participantId}` | Server-only migrated contact fields and untrusted `historicalUid`. Passcodes are discarded, never archived. No browser reads, even for owner/admin. Removed for linked member's profile deletion. |
| `users/{uid}` | Existing platform access-control role, unchanged by social profile editing/deletion. |

Firestore rules deny unauthenticated, anonymous and unverified workshop/profile reads. Profiles are minimal allowlisted documents. Participant identity/pointer writes require the trusted API. Existing owner and workshop phase restrictions remain; team naming resolves a member through the registration pointer rather than assuming participant document ID equals Auth UID. Forming-team joins/removals must change only the caller's own membership; leader identity is immutable. Team finalization is trusted so a leader can finalize consenting members without gaining arbitrary edit access to others' participant rows.

No composite indexes are added; equality queries use Firestore's single-field index merging. `firestore.indexes.json` is explicit and empty. Existing unrelated production indexes must be preserved by a future deployment; do not replace production index configuration blindly.

### Migration and rollout (not executed against production)

This is a coordinated compatibility change, not a zero-downtime mixed-client rollout. Use a maintenance window: stop old writes, export/backup using approved operator tooling, dry-run and apply `scripts/migrate-identity.ts` to move participant contacts/session admin emails, then activate the matching server, client, and rules together. Existing old clients and public passcode recovery intentionally cease to work. Existing participant/team IDs and workshop content remain; no ownership is automatically inferred. The script is repeatable, does not log personal values, and supports dry-run by default. Review counts and private access configuration before reopening. Keep this branch's default-database emulator configuration separate from the existing named production database.

Only synthetic emulator migration commands are used in this PR:

```sh
GCLOUD_PROJECT=demo-hack-live FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run migrate:identity
GCLOUD_PROJECT=demo-hack-live FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run migrate:identity -- --apply
```

No production credentials, production data, migration, deployment, or real email delivery were used. Production readiness requires enabling Google and email/password in the existing Firebase project, approved authorized domains/email action settings, and a server service identity with least-privilege Auth/Firestore access via Application Default Credentials. The server uses the existing project/named database config, with explicit `GCLOUD_PROJECT`/`FIRESTORE_DATABASE_ID` overrides. Never expose Admin credentials in `VITE_` variables.

## Architecture/trust boundaries

`src/identity.tsx` owns auth/profile UI and exports `isRegisteredMember`, `useProfile`, and `identityRequest`. Firebase client Auth persists the permanent identity. The browser edits only allowlisted owner profile/default fields and permitted workshop actions under real Firestore rules. The existing Express server mounts `/api/identity/*` from `server/identity.ts`, verifies Firebase bearer tokens (including revocation), rejects anonymous/unverified callers, and uses Admin SDK transactions for registration, organizer-authorized linking, and consenting team finalization. The browser never supplies the registering member ID. Deletion derives owner identity from the token and applies a durable deletion state before cleanup. No service key is stored in the repository.

API contracts:

- `POST /api/identity/register` with `{sessionId, adjective?, designThinkingProficiency?}` → `{participantId}`. Existing pointer is idempotent; conflicting/legacy ownership returns 409.
- `POST /api/identity/link-legacy` with `{participantId, memberUid}` → `{linked:true}`. Only authorized organizer, target verified active profile, no existing link/registration. Independent human verification is required.
- `POST /api/identity/finalize-team` with `{kind:'solution'|'discovery', formingId}` → `{teamId}`. Only registered forming leader, open workshop phase, valid consenting linked participants; writes all assignments atomically.
- `POST /api/identity/delete-profile` → `{deleted:true}`. Recent owner sign-in; login/admin identity retained.

## Repeatable verification and demo

Prerequisites: Node 24, Java 21, npm, Chromium downloaded by Playwright. `npm ci`; `npx playwright install chromium` (`--with-deps` on Linux); `npm run typecheck`; `npm run build`; `npm run test:emulators`.

`test:emulators` starts Auth (9099) and Firestore (8080) using **demo-hack-live**, then `scripts/emulator-suite.mjs` starts the app (3000), runs the rules/trusted-operation tests and Playwright sequentially, and stops everything. Tests refuse to run without emulator hosts. `IDENTITY_EMULATORS=true` requires both emulator hosts and a `demo-` project; client emulator mode is localhost-only and uses a synthetic API key. No test bypass is compiled into production auth. Use free local ports 3000/8080/9099/9150.

`tests/fixtures.ts` is the reusable synthetic fixture contract for later slices: `clearFixtures`, `createFixtureUser`, `seedEvents`, `signInFixture`, `callIdentity`, plus `fixtureDb`/`fixtureAuth` for administrator setup/assertions. `event-one`/`event-two` use codes DEMO1/DEMO2 and a published challenge each; organizer UID is `organizer`, coadmin email is `coadmin@example.test`. All passwords are synthetic. Test files live in `tests/browser`; one worker avoids cross-test fixture races. Security tests use real Firestore rules and actual Auth tokens/trusted HTTP operations. Browser auth, profile, registration and participant actions are real; Admin SDK is used only for deterministic fixtures and facilitator phase changes. Delivered email verification uses the Auth emulator outbox and real verification endpoint; no production email/provider claim is made.

Videos are recorded automatically in `test-results/**/video.webm`, including successful journeys. Failures retain screenshot/trace. CI uploads `test-results` plus `playwright-report` as `pr1-emulator-browser-evidence` for 14 days. The modest canonical recording in `docs/evidence/` is actual Chromium/emulator browser evidence and remains available through the PR repository. It is not real-device/mobile evidence. Reproduce it with the full emulator suite; the first test records signup → verification → profile → event registration → second-event prefill → fresh browser login → member view → profile deletion.

Limitations: Google OAuth is implemented using Firebase popup/linking and must be enabled/configured for the production domain. Email verification is exercised against the Auth emulator. The PR does not claim a live Google consent-screen run or real-device testing. Deletion cannot recognize personal information users typed inside free-form shared workshop prose; those shared contributions remain, while known structured personal attribution is scrubbed. A future operator rollout must resolve ambiguous historical records with organizer verification; public passcodes can never resolve them safely.
