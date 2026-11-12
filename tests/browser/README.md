# Event invitation browser integration

`event-invitation.spec.ts.template` is a pending Playwright spec, not an executed test.
Rename it to `.spec.ts` and adapt it to PR1's existing emulator/auth fixtures after
restacking this slice onto PR2. No second harness or dependency setup is included.

The draft uses `HACKLIVE_INVITATION_PATH=/session/<seeded-active-event-id>` and a
390 × 844 viewport. It covers direct-gesture native share, unsupported sharing,
share failure, cancellation, clipboard denial and visible/accessibility feedback.
Replace its environment-driven path with the harness fixture when available.

Before publishing PR3:

- Seed public title plus distinctive owner/admin/contact/recovery fields and
  assert only the expected title/text/canonical URL reaches share and copy.
- Cover registered participant dashboard, Opening onboarding and join screen.
- Seed Draft, Closed and unknown states and assert Share event is absent.
- Follow the shared URL in a fresh recipient context; exercise PR1's actual auth
  mechanism and verify the same event destination survives and uses the existing
  join flow. Do not add another registration form or auth-return implementation.
- Record a reviewer-accessible mobile demo showing native share (real device when
  available), clipboard fallback, quiet cancellation and recipient navigation.
  Browser mocks verify API payload/gesture but cannot prove an OS share sheet.

Focused tests can run before that integration, using existing dependencies:

```sh
rtk npm ci --legacy-peer-deps
rtk proxy npx --no-install tsx --test tests/eventInvitation.test.ts
rtk npm run lint
rtk npm run build
```

The legacy-peer-deps flag is needed for the baseline React 19/react-quill peer
conflict. This slice does not change package files.
