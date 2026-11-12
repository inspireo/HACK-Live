# Event invitations (PR3)

Parent: [PR2 profile details and privacy](https://github.com/inspireo/HACK-Live/pull/2),
immutable target `90322896bbd7c0c8688b73cc862802d429a7f29b`, including PR1
`4e665193`. The invitation commit is rebased on that exact target; all identity,
registration, source/projection and privacy behavior remains inherited.

## Behavior and public details

Share event is available on the existing participant registration screen,
Opening onboarding and ordinary dashboard. It invites friends using the same
participant-visible event title and canonical `/session/:sessionId` destination.
No alternative registration flow is introduced. A fresh recipient reaches PR1's
real sign-in gate, keeps that exact destination through email sign-in, then uses
the existing registration form and idempotent registration mapping.

Only known active stages are invitable. `Draft` is overloaded as both initial
session setup and Challenges Review, so it is conservatively excluded together
with `Closed` and unknown states. Stage gating is a promotion choice, not a new
authorization boundary. Participant access remains controlled by inherited
identity/rules. This can hide sharing during Challenges Review until the model
distinguishes initial unpublished setup from that review stage.

The current session model has no published event date or venue. Neither is
invented from creation timestamps or unrelated fields. Blank, oversized,
markup/link/contact-style titles fall back to `#HACK Live workshop`.

## Architecture and trust boundaries

`buildEventInvitation` accepts only route ID, public title, stage and site origin;
it never receives or serializes a session/profile object. Canonical URLs discard
the current query, hash and credentials and encode the route ID. Contact,
recovery, owner/admin data and join codes are not inputs to the invitation.

`ShareEventButton` is an isolated control with small dashboard insertions. Its
click handler calls native share before any await, preserving transient user
activation. Native data has separate title/text/url and a single URL; clipboard
and selectable manual fallback use the complete deterministic invitation with
one URL. `AbortError` cancellation stays quiet; unsupported or failed sharing
falls back to clipboard, and denied clipboard reveals labelled selectable text.
A polite live region announces feedback. An in-flight guard avoids overlapping
share requests. No AI, network generation or new identity writes are involved.

## Schema, migration and compatibility

- Collections/fields: **NONE** added or changed by PR3.
- Firestore rules/indexes: **NONE** changed by PR3.
- Migration/backfill: **NONE** needed for PR3. PR1/PR2 requirements still apply.
- Dependencies, account/profile/connection behavior: **NONE** changed by PR3.
- Existing session documents and canonical participant URLs remain compatible.
  Unknown stage values suppress promotion until explicitly supported.

## Validation and evidence

The inherited serial harness now also runs nine focused invitation logic tests
and two real Chromium invitation journeys. Cumulative results: **3 profile pure,
9 invitation pure, 18 real API/rules and 7 Chromium tests passed**. Typecheck and
production build pass; Vite retains the existing large-chunk advisory.

Commands and actual recordings: [invitation evidence](evidence/invitation-pr3.md).
Only OS share/clipboard contracts are substituted in browser tests. Real local
Firebase authentication, identity endpoints, registration and Firestore rules run
without mocks. Physical-device OS share-sheet behavior is not established by
these Chromium mobile viewport recordings.
