# Reusable profile details (PR2)

## Canonical data and trust boundary

- `profiles/{uid}` remains exactly `{name, state}` for active profiles. Name is canonical here; no second signup or duplicate name source. Tombstones remain owner-only.
- `profileDetails/{uid}` is the owner-only canonical source: `{professional: {avatarUrl?, bio?, title?, company?, work?, skills?, linkedin?, github?, portfolio?}, communityFields: ProfessionalField[], contacts: {contactEmail?, phone?, telegram?, whatsapp?, signal?}, connectionFields: ContactField[]}`. Values are strings. Optional values and both selections default to empty. `title` is free-text professional work information, never an official event/team/platform role.
- `memberDetails/{uid}` contains ONLY selected, populated professional key/value pairs, with no wrapper, name, contacts, sharing selection, or lifecycle field. Verified members can get this document only while its `profiles/{uid}` is active. Lists and all client writes are denied. Member list names still come from `profiles`.
- `connectionFields` is ONE global contact selection for ALL eventual accepted connections. It is private configuration only in PR2. No contact projection is materialized and no connection/request feature exists. `connectionContacts/{uid}` is reserved with deny-all rules. A future slice must build only selected/populated contact values and authorize reads through accepted connections; never copy the entire private source or use per-connection overrides.

`POST /api/identity/save-profile` takes `{name, ...ProfileDetails}`. Verified, non-anonymous identity comes from the checked token, never payload uid. Strict validation rejects unknown top-level and nested keys, bad selections, control characters, oversize strings and unsafe URLs. Server transaction reads active lifecycle then replaces the name document, private source and allowlisted projection atomically. Full replacement removes previously shared values immediately on save. Transactions retry against deletion state so edits cannot resurrect an in-progress deletion. Clients cannot write either new collection, even their own projection. No edits touch `users`, event registration/roles/attendance/awards or uid/lifecycle state.

Name editing reuses the existing profile; initial name-only creation remains unchanged. `registrationDefaults` remains canonical for adjective/design-thinking proficiency. Those event descriptors are not professional title/bio and are not recollected here. Raw workshop answers/archetypes remain event-specific. Login email is never copied into contact email. Contacts are optional and intentionally entered only if desired.

## Photo input/storage/deletion

Working photo support is an optional public HTTPS image URL, with its own private/community selection. The account form explicitly says it does not upload. No Storage bucket, blob, proxy, image fetching server, external service or new cost is introduced. The URL lives only in the private source and, if selected, the member projection. Preview/member pages render an image with no-referrer policy, lazy loading, fixed dimensions and alt text. Remote hosts still receive image requests; use an image URL you control. Private photos render only when selected for community preview. Clear the URL and save to remove it from both documents. Deletion removes both documents and therefore all avatar references; original external assets remain under the owner's control at their host. No locally owned avatar assets require cleanup.

All link/image URLs require HTTPS and no embedded credentials. LinkedIn/GitHub links require their respective hosts. User text renders through React escaping; links use `noopener noreferrer`. External images are not guaranteed to remain available.

## Deletion integration seam

`createProfileCleanup` queues deletion of deterministic `profileDetails/{uid}` and `memberDetails/{uid}` through its existing observed BulkWriter operations. Errors prevent the deleted tombstone; retry repeats deletion. Active-state read rules immediately hide projections during deletion. PR1's durable manifest/reliable cleanup remediation is pending: reconcile this small seam onto the validated final parent implementation, preserving its manifest/retry contract. No parent team/migration cleanup algorithms are modified.

## Schema / migration / compatibility

Additive collections require no backfill. Missing details mean empty/private details; old name-only members remain readable/editable and event registration reuse is unchanged. No historical private contact info is inferred or copied from public legacy participants. Deploy restrictive rules and trusted server together before exposing the new editor; server-only collections have no client-write migration window. Rollback UI first; restrictive rules can remain. Cleanup must retain deletion of new documents even during rollback. Existing minimal-profile direct name writes remain compatible and cannot add optional fields or contacts.

## Regression commands and evidence

Safe first pass: `npm ci`, `npm run typecheck`, `npm run build`, `node --import tsx --test tests/profile-pure.test.ts`. Real emulator/browser coverage is added to the existing suite, but MUST NOT run while parent owns ports 8080/9099/3000 and shared fixtures. After root provides final validated PR1 base and exclusive emulator window: `npm run test:emulators` (cumulative identity + profile rules/server + browser journeys).

Reviewer-accessible video remains an explicit integration gate: capture actual browser journey against synthetic real Auth/Firestore emulators after rebase, upload with reviewer-accessible permissions, then link it and exact cumulative results in the PR. A local video path alone does not satisfy this gate. No video or PR is published in the prepared first pass.
