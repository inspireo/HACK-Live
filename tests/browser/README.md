# Event invitation regressions

`event-invitation.spec.ts` runs in the inherited serial Playwright suite against
real Firebase Auth/Firestore emulators and the identity server. File-scoped
fixtures reset before the next file; do not run fixture files in parallel.

The 390 × 844 journey signs in, shares from the join screen, registers through the
existing form, tests dashboard copy/manual/cancellation paths, shares from Opening
onboarding, then opens the exact shared URL in a fresh context. That recipient
signs in through real Firebase email auth, retains the event destination,
registers once and reloads into the same registration. A second test verifies live
stage gating and unsafe-title fallback without duplicating registrations.

Only OS share and clipboard contracts are mocked. Tests assert native share is
called with active user activation and exact title/text/url. Auth, identity
operations, session reads and rules are real. This is Chromium mobile viewport
evidence, not a physical phone or an OS share sheet recording.

With Node 24, Java 21, Chromium installed and ports 3000/8080/9099/9150 free:

```sh
rtk npm ci
rtk proxy npx playwright install chromium
rtk npm run typecheck
rtk npm run build
rtk npm run test:emulators
rtk proxy env INVITATION_DEMO=true npm run test:emulators
rtk proxy node scripts/collect-invitation-demo.mjs
```

Normal tests contain no reviewer reading pauses; INVITATION_DEMO=true adds
3.5-second holds. The collector requires a fully passing cumulative suite and the
paced demo manifest. It copies actual recordings, screenshots and contract data
to docs/evidence, without synthesizing or retiming frames. See
[invitation evidence](../../docs/evidence/invitation-pr3.md) for review links and limitations.

The focused nine-test logic suite also runs inside test:emulators. Run alone:

```sh
rtk proxy node --import tsx --test tests/eventInvitation.test.ts
```
