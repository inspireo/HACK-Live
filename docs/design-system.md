# HACK Live UI foundations

This UI slice follows the full functional stack at `b5dd048`. It preserves the dark zinc/emerald identity and the light member badge. It changes presentation only: labels, validation errors, choice meanings, API requests, authorization, privacy projections and schemas are unchanged.

## Tokens

`src/index.css` defines semantic CSS variables for canvas, surface, controls, text, muted text, borders, accent, accent text, focus, danger and radius. Spacing uses 4/8/12/16/24/32 px steps; body/caption/title sizes are 16/14/24 px. `.ui-light` overrides surfaces and contrast for white badge cards. Existing Tailwind layouts remain supported. Focus uses a visible 2 px emerald outline with a 3 px offset.

## Shared components

- `InfoHelp` is the single supplemental-help interaction. Give each use a short, purpose-specific `label`. It produces a named button (`Help: …`) and labelled dialog, with expanded state and a named close button. Keep it a **sibling** of a field label, checkbox label or action; never nest interactive elements.
- `Field` pairs an explicit `htmlFor` label and control, with optional sibling help. It preserves the exact field label.
- `Section` provides a labelled section, consistent spacing and an optional help button beside its heading.
- `Button` defaults to `type="button"`; forms must explicitly request `type="submit"`. Primary, secondary and danger styles use semantic tokens.
- `controlClass` applies shared form sizing, borders, surface and text colors. Native controls, fieldsets, labels and checkboxes retain their semantics.

`InfoHelp` uses exact dependency `@radix-ui/react-popover@1.3.1` (lockfile committed), verified against the [official Popover documentation](https://www.radix-ui.com/primitives/docs/components/popover) on 2026-11-17. Radix supplies keyboard activation, Escape, dismissal, focus management, expanded state and collision positioning. Content portals to the document body so overflow containers do not clip it. CSS constrains width and height to the available viewport and scrolls long text. Trigger and close targets are 44 × 44 px. No hover is required. Focus returns to the trigger on Escape/close; outside interactions retain their natural destination.

## Help versus primary content

Move examples, repeated mechanics, technical formats, optional explanations and coaching into help. Keep visible:

- Field labels, errors, status and required next steps; all primary buttons and consent choices.
- Event, challenge and resource content; questions and answer options; selection limits and eligibility.
- A concise privacy/visibility summary. Profile contacts state **one selection for ALL current and future approved connections**. WhatsApp states that sharing exposes its registered phone number. Connection confirmation still lists the exact fields shared after acceptance.
- Consequences of revocation and destructive actions, attendance verification/evidence requirements, and public publication scope.

Keep primary profile/contact data and the user's current choices visible. Rare organizer-support identifiers (such as the account UID used for legacy linking) may appear in clearly named support help with a selectable, copyable value. Help does not save, select, toggle a checkbox, grant access or alter form payloads. Use click/tap/Enter/Space; support Escape, close, outside pointer/focus dismissal. Avoid custom global event handlers or mirrored open state when the primitive already owns them.

## Inventory applied

Priority surfaces: profile photo, skills, mobile number, Telegram, WhatsApp, profile/contact visibility; connection overview and block mechanics. Secondary surfaces: event publication field formats; account and legacy-linking explanations; team and official role mechanics; onboarding section guidance; achievement/history visibility detail; light badge profile visibility; resource link defaults; admin discovery, collaboration, configuration, projector and onboarding-pack coaching. Actual question help describing response visibility, attendance verification requirements, event/award states, destructive confirmation text, publication privacy and primary content remain visible.

## Verification

`tests/browser/contextual-help.spec.ts` exercises the real app with Auth/Firestore emulator fixtures. It covers profile consent/value preservation and no accidental save, mobile/keyboard/outside/Escape/focus behavior, 320/390 px layout, light badge help, and public/admin field help with primary actions preserved. Run together with the complete existing emulator suite via `npm run test:emulators`, plus typecheck and build. Evidence is actual Chromium app UI with synthetic fixtures; no production or physical-device claim. Media recording belongs to the separate recording task after source freeze and acceptance.

### Validated checkpoint (2026-11-17)

Typecheck and production build pass. Full cumulative emulator validation passes **171 tests: 130 unit/API/rules + 41 browser**, including all 165 baseline cases and six new contextual-help cases; no skipped tests. The named QR-image selector replaces a global single-SVG assumption while retaining real pixel decoding and the same exact profile URL assertion. Browser tests also retain the existing 96 px profile and 56 px badge loading/revocation coverage.

Reviewer37 passed committed source `3556e0b4f796ed303d2c5e96c94dbbf38863391e`; final source cleanup removes whitespace from one blank line only. The complete functional parent `072ceb91b08bf8eac42739a78cfbf7b1a6bec114` is merged normally, with no source conflicts. [Verification manifest](evidence/ui8-verification.json) lists exact screenshot paths, hashes and fixture limitations. All nine screenshots were inspected after the final run. Tests shut down the app and emulators, and ports 3000/8080/9099/9150 were confirmed free.

Representative evidence: [320 px profile help](evidence/ui8-profile-mobile-help-320.png), [390 px global sharing](evidence/ui8-profile-sharing-390.png), [connections](evidence/ui8-connections-320.png), [admin field help](evidence/ui8-admin-field-help.png), [light badge](evidence/ui8-light-badge-help-320.png), and [public primary content](evidence/ui8-public-content-320.png). These are actual app screenshots with synthetic test data. Recording all review videos remains a separate task after root acceptance.
