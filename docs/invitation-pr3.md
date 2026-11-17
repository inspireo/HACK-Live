# Public event invitations (PR3 refinement)

All invitation previews are public. Existing member, profile, event management,
participant and display routes keep their account protection. A public preview
never loads workshop challenges, teams, demos, members or registration records.

Organizers use **Public invitation** in event administration to explicitly publish
public title, description, venue, HTTPS viewing URL and optional local start/end
with an explicit IANA timezone. Publication is independent of workshop stage and
starts unpublished. `registrationRequired` defaults true; `calendarEnabled` defaults
false. Publish requires Register, Add to calendar, or both. Calendar requires
valid, unambiguous start/end times in the named zone, with end after start.
Creation timestamps are never event dates.

Register enters the existing account/profile gate at `/invite/:token/register`.
After authentication, the server checks invitation validity again and resolves the
existing `/session/:sessionId` destination. Only explicit submission of the existing
registration form creates a registration. Its idempotent reuse and legacy linking
remain unchanged. Direct authenticated event URLs retain their existing behavior.
Calendar download requires neither an account nor event registration.

## Server contract

Server-only Firestore collections (all SDK reads/writes denied, including admins):

- `eventPublications/{sessionId}`: validated public fields, local start/end, UTC
  instants and IANA zone, registrationRequired/calendarEnabled, published,
  revision, currentToken, updatedAt, opaque stable calendarUid, sessionCreatedAt.
- `eventInvitations/{32-byte base64url token}`: sessionId, server createdAt,
  immutable expiresAt exactly 604800000 ms later, revoked, sessionCreatedAt.

Existing ownerId, users.role admin, platform-owner verified email and
sessionAccess.adminEmails authority are checked in the same transaction as each
management read/write. No role or credential is added. Mutations require the
current revision (409 on stale saves), and all server writes are atomic.

Public endpoints outside identity middleware:

- `GET /api/invitations/:token`: whitelisted public title, description, venue,
  viewingUrl, startsAt/endsAt/timeZone if explicitly supplied, registrationRequired,
  calendarEnabled and expiresAt. No private event ID, contact, admin, join code,
  profile, participant or registration data.
- `GET /api/invitations/:token/calendar.ics`: same validity checks, calendar opt-in.

Verified-account endpoints beneath `/api/identity`:

- `GET /events/:sessionId/invitation`: read-only current token and public projection.
- `GET /events/:sessionId/publication`: organizer fields, revision, status/current link.
- `POST /events/:sessionId/publication/{publish,renew,revoke,unpublish}` with
  `{revision, fields?}`. Publish full-replaces validated fields and reuses a valid
  current token. Renew revokes the old token and creates seven days of validity.
  Revoke clears the current pointer; unpublish also removes public availability.
  Republish/renew never resurrects an earlier token. calendarUid stays event-stable.
- `POST /invitations/:token/destination` after auth: fresh validity/required-flag
  check, returns sessionId; no registration or profile writes.

Every public preview/calendar/authenticated handoff checks session existence,
publication, exact current token, revoked and fixed server expiry. The sessionCreatedAt binding comes from the authoritative Firestore
document createTime (seconds/nanoseconds), never a client field. Deleting and
recreating the same event ID cannot revive old invitations; the replacement starts
unpublished with a fresh UID and token when explicitly published. The UID stays
stable across renew/unpublish/republish only within the same event incarnation. Reads never mint
or extend links. Responses and invite HTML are no-store and no-referrer. Unavailable
links fail closed with generic errors. No migration, backfill or production write
is needed: legacy events remain unpublished and their registration flow is intact.

## Sharing and calendars

Share event prefetches the existing current link using a read-only request. It is
disabled while loading or unavailable/expired. The click synchronously calls native
Web Share, retaining user activation, with published safe title and date when
present. Clipboard/manual text fallback and quiet cancellation remain supported.
An organizer must publish or renew an unavailable link; rendering never creates it.

Calendar uses [RFC5545](https://www.rfc-editor.org/rfc/rfc5545) CRLF, escaped TEXT,
75-octet UTF8-safe folding, a stable opaque UID, UTC DTSTART/DTEND and DTSTAMP.
No attendee or organizer contacts are included. Named-zone conversion uses pinned
`@js-temporal/polyfill@0.5.1`, with overflow/disambiguation reject, following
[Temporal documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).
This avoids browser-default timezone/DST ambiguity. Downloaded files are copies;
revocation prevents future downloads, and cannot retract previously saved files.

## Verification

Pure validation/calendar/share tests, real Firebase-emulator API/rules tests and
Chromium browser journeys run in `npm run test:emulators`, using Node24/Java21.
Typecheck/build are separate. Media is recorded from the actual application with
synthetic fixture accounts/events; only OS sharing/clipboard is substituted, not
API/auth/rules/calendar. Native physical-device share sheets are not demonstrated.


## Event soft deletion

Events can only be deleted through the verified organizer API:
`POST /api/identity/events/:sessionId/soft-delete` with `{}`. Current event owner,
platform administrator, or sessionAccess coadmin authority is required, without a
social profile dependency. The transaction sets server timestamp `deletedAt` and
actor UID `deletedBy` once. Repeated authorized requests succeed without changing
that original marker. Missing/null deletedAt means legacy active; no migration is
needed. Clients cannot set/remove lifecycle fields or physically delete events.

Deletion retains the original session and every related record/subcollection.
Active admin/code-join lists exclude the event; direct participant and live
display routes show unavailable. The direct admin route closes participation. In
the composed attendance/award layers it retains authorized historical read,
attendance correction and award correction/revocation controls, with new
check-in, role/team activity and award issuance closed. Every invitation read, calendar, registration
handoff, publication/renewal, canonical registration/reuse, legacy linking, team
finalization and normal client workshop write rejects a deleted event. The session
check shares the invitation transaction, so a concurrent/stale publish cannot
reopen it. The exact Firestore createTime incarnation guard remains in force for
out-of-band physical deletion/recreation. Existing authorized historical reads
retain their rules. There is no purge or restore operation.

## Final composed verification

The immutable composed source `e1cf383f4a1bfb2190b6bdf3e6ea8d4fd55beccb` passed Node24 typecheck/build and **165 tests (37 pure, 93 API/rules, 35 Chromium browser)**. The two focused paced recordings passed2/2 on that same source. Product bytes match the independently audited invitation, soft-deletion and downstream guard implementation; subsequent documentation/evidence and parent merges do not claim lower-layer local full-suite execution. Each final remote head has its own CI result. [Current recording provenance, hashes and actual UI screenshots](evidence/invitation-pr3.md) describe only the two invitation replacements; the other21 feature recordings remain at their original capture provenance.
