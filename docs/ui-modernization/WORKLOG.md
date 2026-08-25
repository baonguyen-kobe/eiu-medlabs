# EIU MedLabs UI Modernization Worklog

Append new entries. Do not rewrite or delete historical entries merely because `CURRENT.md` changes.

## 2026-08-25 — Tracking foundation

### Work

- Archived the original UI/UX responsive audit.
- Created `MASTER-PLAN`, `TRACKER`, `CURRENT`, `DECISIONS`, and `QA-MATRIX`.
- Added persistent agent continuity instructions.

### Application source changed

NO

### Current next task

AUTH-01

### Blockers

- BASE-01: protected-route environment/authentication.
- DEC-01 / A11Y-01: signature accessibility business decision.

### Verification

- Audit hash preserved.
- Documentation paths verified.
- Git diff reviewed before commit.
- Foundation commit: `507e08c869049f38882e7129ad47fb319df4ad50`.
- Foundation pushed to `baonguyen-kobe/eiu-medlabs` `main`.
- `ui-modernization` created from the foundation commit and pushed with upstream tracking.

## 2026-08-25 — Canonical continuity promotion

### Work

- Recorded `baonguyen1301/eiu-medlabs` and `origin` as the canonical repository and delivery remote.
- Recorded `ui-modernization` as the development branch based on canonical `main`.
- Recorded local-first verification, manual port, infrastructure-discovery, and runner restraint policies.
- Committed the user-approved removal of obsolete tracked project documentation separately.

### Application source changed

NO

### Current next task

AUTH-01

### Blockers

- BASE-01: protected-route environment/authentication.
- DEC-01 / A11Y-01: signature accessibility business decision.

### Verification

- Tracking foundation commits verified as documentation-only.
- Canonical main promotion and branch topology verified after normal pushes.

## 2026-08-25 — AUTH-01 implementation

### Work

- Reused the approved login image/logo/form-wrap composition for forgot, reset, and forced-change password routes.
- Added semantic password-recovery/change headings, email/new-password autocomplete, explicit submit controls, pending state, and live feedback.
- Preserved existing server actions, field names, recovery reason, and Supabase behavior.

### Application source changed

YES — AUTH-01 auth route, form, shared shell, and scoped login heading styles only.

### Verification

- PASS: Prettier check on touched source and tracking files.
- PASS: targeted ESLint.
- PASS: `npm.cmd run typecheck`.
- PASS: local Supabase Auth health check and `npm.cmd run build` using only runtime-provided local values.
- PASS: existing Playwright login accessibility E2E against `http://localhost:4000`.
- PASS: rendered 375/768/1024/1440 sweep for login, forgot-password, reset-password, and change-password.
- PASS: no horizontal page overflow; approved shell, headings, controls, gutters, desktop composition, and login regression.
- PASS: keyboard focus order, visible focus, pending focus retention, recovery status, and password error alert.
- PASS: local axe scan found no WCAG A/AA violations; automated contrast remains incomplete. Existing login secondary-copy contrast remains `CONTRAST-01`.
- ADVISORY: React Doctor was run; its full audit reported unrelated baseline diagnostics, while the changed-scope invocation emitted no diagnostics.

### User acceptance

PASS — user approved AUTH-01, including the requested 36px action-area rhythm, forgot-password two-action row, and mobile-only white login input background.

### Task state

AUTH-01 is `DONE`. No successor task was started.

### Commits

- `01065037e3e7fe8e90da73a132b4050b782a0ebb` — `fix(AUTH-01): unify password recovery auth shell`
- `cdbcd1e339736cb2476e7b72e5ce2a352b4f6660` — `fix(AUTH-01): preserve focus during pending submits`
- `de471341a192fda6e8a62512be2738101a591128` — `fix(AUTH-01): apply approved auth visual polish`

## 2026-08-25 — AUTH-01 continuity/design-governance reconciliation

### Work

- AUTH-01 remains `DONE`; no successor task was claimed.
- Synchronized the canonical UI Master with approved Authentication Family rules.
- Recorded source-first UI interpretation and the user visual-acceptance gate.
- Recorded UI-only local preview/backend-isolation policy.
- Corrected current continuity so `main` startup directs agents to `ui-modernization`.

### Application source changed

NO

### Evidence

- Final AUTH-01 closure commit: `f570bafddd932149f651b0d689793978b4644323`.

## 2026-08-25 — A11Y-03 keyboard foundation

### Work

- Added input-focused active-descendant keyboard navigation to `SearchableCombobox`.
- Preserved controlled/uncontrolled values, hidden fields, empty options, pointer selection, and current visual selection semantics.

### Verification

- Direct consumer imports: 7.
- PASS: `/schedule-entry/new` at 375/768/1024/1440, keyboard model, local axe scan, targeted format/lint/typecheck.

### Task state

A11Y-03 is `VERIFY`, pending user review. TABLE-01 started next in the approved unattended batch.

## 2026-08-25 — TABLE-01 table scroll foundation

### Work

- Added `TableScrollViewport` and named/focusable local scroll contracts for current responsive table wrappers.
- Preserved existing table classes, DOM layout, widths, local scrolling, and visual shell ownership.

### Verification

- Current responsive-table inventory: 23; 8 already equivalent; 15 migrated/named.
- PASS: `/classes/open`, `/basic-medical/equipment`, and `/admin/equipment` at 375/768/1024/1440, keyboard focus, local scroll, and no page overflow.

### Task state

TABLE-01 is `VERIFY`, pending user review. FORM-01 started next in the approved unattended batch.

## 2026-08-25 — FORM-01 field relationship foundation

### Work

- Added `getFieldAria` for composed description/error relationships.
- Adopted the contract in TimePicker, the existing field-level error reference.

### Verification

- PASS: TimePicker invalid state exposes stable input/error IDs, aria-invalid, aria-describedby, and role alert on `/schedule-entry/new`.

### Task state

FORM-01 is `VERIFY`, pending user review. A11Y-04 started next in the approved unattended batch.

## 2026-08-25 — A11Y-04 control naming foundation

### Work

- Added Vietnamese accessible names to Basic Medical filters and row/item-specific equipment controls.
- Added date/row-specific names to Staff Shift assignee, shift, time, registration, date, removal, and historical-reason controls.

### Verification

- PASS: rendered accessibility trees show meaningful repeated Staff Shift names and named Basic Medical controls.

### Task state

A11Y-04 is `VERIFY`, pending user review. No successor task was claimed.
