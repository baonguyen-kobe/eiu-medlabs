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

## 2026-08-25 — Phase-2 foundation batch regression

### Verification

- PASS: consolidated `typecheck`, repository lint, local-Supabase build, and `git diff --check`.
- Local review server remains available at `http://localhost:4000`.

### Task state

A11Y-03, TABLE-01, FORM-01, and A11Y-04 remain `VERIFY` pending user review. No next task was claimed.

## 2026-08-25 — Overnight deferred-review authorization

### Decision

- `DEC-UI-012` authorizes technical completion of this overnight batch while manual user review is deferred.
- No task in the batch is recorded as user-visually-approved tonight.

### Foundation closure

- A11Y-03, TABLE-01, FORM-01, and A11Y-04 moved to `DONE` on existing technical/rendered evidence.
- Manual user review deferred by explicit user authorization for the 2026-08-25 overnight batch.

## 2026-08-25 — TOUCH-01 touch-target baseline

### Work

- Added coarse-pointer/mobile-only 40px event action targets and 44px empty-cell quick actions.
- Preserved compact desktop 24×28px Staff Shift geometry.

### Verification

- PASS: `/staff-shifts` at 375/768/1024/1440; no page overflow.

### Task state

TOUCH-01 is `DONE`; manual user review deferred by explicit overnight authorization. PILOT-01 started next.

## 2026-08-25 — PILOT-01 Classes representative pilot

### Result

- Verification-only: no additional Classes implementation was justified after A11Y-03, TABLE-01, FORM-01, A11Y-04, and TOUCH-01.
- PASS: `/classes/open` and `/classes/mine` at 375/768/1024/1440; toolbar, combobox/TimePicker integration, focusable local scroll, actions, and visual identity retained.

### Task state

PILOT-01 is `DONE`; manual user review deferred by explicit overnight authorization. MOB-01.1 started next.

## 2026-08-25 — MOB-01.1 Classes mobile priority

### Work

- Applied Strategy B only when the current table is fully read-only: hide course code and student count.
- Mixed tables deliberately retain those shared columns because hiding cells per row would break HTML table geometry; editable rows retain all controls and the existing local scroll contract.

### Verification

- PASS: 375/768 narrow strategy gate and 1024/1440 full layout parity.

### Task state

MOB-01.1 is `DONE`; manual user review deferred by explicit overnight authorization. MOB-01.4 started next.

## 2026-08-25 — MOB-01.4 Basic Medical equipment strategies

### Decision matrix

- Catalog: A — local horizontal comparison remains appropriate.
- Rooms: B — narrow view hides commercial name, unit, and good count while preserving room, device, total, damage, and actions.
- Damaged: B — narrow view hides unit, good count, actor, and date while preserving device, room, damage, and actions.
- Logs: A — local horizontal comparison remains appropriate for audit data.

### Task state

MOB-01.4 is `DONE`; manual user review deferred by explicit overnight authorization. ARCH-01 started next.

## 2026-08-25 — ARCH-01 import presentation shell

### Work

- Extracted `ImportPreviewViewport` for the shared accessible preview table and pagination presentation.
- Kept schedule/basic-medical/equipment parsing, validation, actions, result content, and five-step state machines separate.

### Verification

- PASS: `/schedule-entry/import`, `/basic-medical/import`, and `/equipment/import` render initial five-step shells without page overflow.

### Task state

ARCH-01 is `DONE`; manual user review deferred by explicit overnight authorization. PERF-01 started next.

## 2026-08-25 — PERF-01 personnel fan-out reduction

### Result

- Replaced per-row Auth Admin lookup and per-row profile lookup with paginated Auth Admin discovery plus one batched profile query.
- Local 29-row personnel page baseline: 58 row-scoped calls before; 2 batch calls after.

### Verification

- PASS: `/admin/personnel` preserves 29 rows at 375/768/1024/1440.

### Task state

PERF-01 is `DONE`; manual user review deferred by explicit overnight authorization. The fixed overnight queue is complete.

## 2026-08-25 — Recovery and INT-01 login control correction

### Recovery

- The cancelled 30-day remember-login prompt left no uncommitted changes, post-`75a6408` commits, pushed commits, custom cookie lifetime code, or auth persistence policy to revert.
- Preserved valid completed overnight work at `75a6408`; `dd32eab` records the corrected business decisions and tracker reconciliation.

### INT-01

- Removed the non-functional `Ghi nhớ đăng nhập` option.
- Added off-by-default `Hiển thị mật khẩu` state local to `LoginForm`. Toggling changes only the input type and preserves the typed browser value.
- Left all Supabase SSR client/server/proxy/callback files unchanged. No password or display state is written to browser storage or cookies.
- Verified password login, logout, recovery route smoke, the Show Password keyboard toggle, 375/768/1024/1440 layout/no-overflow, and the dashboard lecturer `Link` source target `/classes/open`.

### Task state

INT-01 is `DONE` at `24d9efa`; manual user review deferred by explicit authorization for MEGA RUN A v2. BASE-01 started next.

## 2026-08-25 — BASE-01 authenticated protected baseline

### Evidence

- Used the approved local Supabase runtime and local administrator account only; no production dependency or auth bypass.
- Authenticated password login and the WorkspaceShell/topbar rendered successfully.
- At 375/768/1024/1440, `/dashboard`, `/classes/open`, `/staff-shifts`, `/equipment/requests`, `/basic-medical/registrations`, `/basic-medical/equipment`, and `/admin/personnel` each rendered their expected page heading and representative data surface without page-level horizontal overflow.
- Existing limitations were retained as tracked: pointer-only signature interaction (DEC-UI-013/A11Y-01), incomplete overlay focus contracts (A11Y-02), and route-family-specific mobile/state work.

### Task state

BASE-01 is `DONE`; manual user review deferred by explicit authorization for MEGA RUN A v2. A11Y-02 started next.

## 2026-08-25 — A11Y-02 overlay foundation and mobile sidebar

- Added `useOverlayFocus`: topmost-overlay-only Tab/Shift+Tab containment, Escape guarded by pending state, deterministic initial focus, return focus, and reference-counted body scroll locking for nested overlays.
- Migrated `ConfirmDialog` without changing its visual API or pending controls.
- Migrated the mobile `WorkspaceShell` sidebar. At 375px it enters at the close button, locks body scroll, traps Tab/Shift+Tab, closes on Escape, and returns focus to the menu trigger.

### Task state

A11Y-02 foundation and A11Y-02.1 are `DONE` at `ff6e06f` and `86e89fa`; A11Y-02 remains `IN_PROGRESS` until all family children complete. Manual user review deferred by explicit authorization for MEGA RUN A v2. A11Y-02.2 started next.

## 2026-08-25 — A11Y-02.2 personnel drawer

- The Personnel drawer now uses the shared focus contract, captures the exact Sửa/Xem opener, enters at its close button, contains Tab/Shift+Tab, is Escape/pending-safe, and restores the opener after close.
- Existing dirty-discard and nested `ConfirmDialog` behavior remain unchanged; topmost-overlay handling prevents the drawer from competing for keyboard events.

### Task state

A11Y-02.2 is `DONE` at `0884d75`; manual user review deferred by explicit authorization for MEGA RUN A v2. A11Y-02.3 started next.

## 2026-08-25 — A11Y-02.3 Staff Shift dialogs

- Quick and Edit dialogs use the shared overlay contract; the existing cancellation flow remains on `ConfirmDialog`.
- At 375px the quick dialog enters at Close, locks page scroll, and closes safely by Escape.

### Task state

A11Y-02.3 is `DONE` at `62ba3d3`; manual user review deferred by explicit authorization for MEGA RUN A v2. A11Y-02.4 started next.

## 2026-08-25 — MOB-01.5 Personnel summary/detail

- Added Strategy E mobile summary cards at 375/768 using existing personnel data and the same `open(item)` drawer action; identity, title/email fallback, active status, up to two roles, and Sửa/Xem remain visible.
- The existing accessible drawer retains detailed permissions, scopes, supplementary capabilities, and security metadata. The dense table remains at 1024/1440.
- PASS: 375/768/1024/1440 no page overflow; mobile action opens the existing drawer with close-button focus and scroll lock.

### Task state

MOB-01.5 is `DONE` at `e2856c9`; manual user review deferred by explicit authorization for MEGA RUN A v2. MOB-01.6 started next.

## 2026-08-25 — MOB-01.6 Staff Shift responsive strategy

- Verification-only: current roster retains intentional calendar-local horizontal scrolling and existing TOUCH-01 controls; registration rows intentionally stack below 920px.
- PASS: roster and register routes at 375/768/1024/1440 without page-level horizontal overflow.

### Task state

MOB-01.6 is `DONE`; manual user review deferred by explicit authorization for MEGA RUN A v2. MOB-01.7 started next.

## 2026-08-25 — STATE-02 equipment lifecycle history

- Replaced the unhandled RPC promise with explicit loading, success entries, empty, and error states plus keyboard-accessible retry.
- The active guard prevents state writes after unmount; retry replaces rather than appends entries.
- PASS: Prettier, targeted ESLint, TypeScript. Rendered request-history evidence remains pending local actionable request data.

## 2026-08-26 — User Review Correction Batch 01

### Work

- Preserved the interrupted local correction worktree and applied the requested
  narrow-screen refinements only.
- Personnel dirty-discard actions remain one readable row at 375px.
- Classes preserve their mixed-table/local-scroll contract while reserving
  240px for time controls and 160px for course code.
- Staff Shifts use a list through 920px and retain the desktop calendar;
  invisible accessible quick-create controls remain keyboard-operable and open
  the existing dialog. Cancellation-reason controls have explicit inset.
- Basic Medical equipment catalog actions form a 2×2 375px grid and the
  route-local inventory inputs/selects have corrected internal padding.

### Verification

- PASS: rendered authenticated sweep at 375/768/1024/1440 for the six affected
  review routes; no page-level horizontal overflow observed.
- PASS: Staff Shift desktop keyboard Enter and Space both open the existing
  create-shift dialog. No shift event exists in the retained local dataset, so
  event-click non-interference remains source-verified rather than rendered.
- PASS: Personnel discard confirmation at 375px keeps `Quay lại` and
  `Bỏ thay đổi` on one row without overflow.
- PASS: touched-file Prettier, TypeScript, ESLint, `git diff --check`, and
  `staff-shifts-ui-contract`.
- BLOCKED(local test fixture): `npm test` relies on historical local accounts
  whose passwords are intentionally not changed in this batch; its failures do
  not exercise these UI corrections. A pre-existing ConfirmDialog source
  expectation also fails against the current shared focus implementation.

### Task state

User Review Correction Batch 01 remains `VERIFY` pending user visual review.

## 2026-08-26 — User Review Correction Batch 02A

### Review reconciliation

- USER VISUAL PASS recorded for A11Y-03, TABLE-01, FORM-01, A11Y-04,
  ARCH-01, A11Y-02.4, and STATE-02.
- PILOT-01, MOB-01.1, MOB-01.5, and MOB-01.6 returned to `VERIFY` for
  user-reported corrections. TOUCH-01 is `VERIFY`: the user requested a fix
  without yet identifying the exact defect.
- MOB-01.4 remains `DONE` with USER VISUAL PASS. A11Y-02.5 remains `VERIFY`
  because no local Basic Medical session is legitimately actionable.

### Work

- Rebalanced Personnel mobile metadata into paired role/status columns and made
  drawer Cancel/Save actions equal-height, equal-width mobile controls.
- Reduced editable Classes time geometry to 205px with a 168px paired
  `HH:mm` editor, increased course-code geometry to 190px, and normalized
  editable control heights.
- Replaced the Staff Shift narrow presentation with the existing Skills Lab
  structured-list language through 920px; desktop calendar and its accessible
  quick-create control remain unchanged.
- Extended the shared `PageHeader` with a utility slot so the mobile header
  grid keeps menu left, title/description center, and notification bell right
  while preserving sticky desktop and page-action behavior.

### Verification

- PASS: rendered 375/768 list and 1024/1440 desktop-calendar Staff Shift
  breakpoints; no page overflow.
- PASS: Staff Shift existing calendar event does not open quick-create.
- PASS: Personnel 375px paired metadata and equal 42px drawer actions.
- PASS: TypeScript and Staff Shift UI contract.
- BLOCKED(baseline): `ui-design-system-v2.test.mjs` still expects an obsolete
  ConfirmDialog keyboard implementation unrelated to Batch 02A changes.

### Task state

User Review Correction Batch 02A remains `VERIFY` pending user visual review.

## 2026-08-26 — User Review Correction Batch 02B

### Review reconciliation

- USER VISUAL PASS CONFIRMED for MOB-01.1 and PILOT-01. Their formal status
  remains `VERIFY` while TOUCH-01 remains `VERIFY` awaiting an exact defect.
- MOB-01.5 and MOB-01.6 remain `VERIFY` pending review of the corrected
  mobile presentations. A11Y-02.5 remains untouched and `VERIFY`.

### Work

- Restored the pre-02A Personnel summary sequence: identity, status, and role
  chips now share the vertical content column while the action remains right.
  The approved equal-size drawer controls are unchanged.
- Staff Shift structured mobile days now derive from `days`, retaining every
  week/month date and both Sáng/Chiều slots. The existing toolbar stays visible
  while only the desktop grid hides at narrow widths.
- Replaced shell horizontal `hidden` overflow with `clip`; rendered evidence
  confirms the document scrolls while the shared header remains at viewport top.
- Moved Skills Lab Import/Create actions from dashboard to class schedules with
  dashboard-equivalent role/scope checks and existing hrefs. Mobile class-picker
  create links now precede their selectors.

### Verification

- PASS: 375 mobile week 7 days/14 slots; month 42 days/84 slots; hidden empty
  quick-create is keyboard-visible on focus and opens the existing dialog.
- PASS: desktop event click remains isolated from quick-create.
- PASS: long Basic Medical page scroll reports header `y=0`, two-line
  description limit, and no page overflow.
- PASS: 375 Personnel role/status left edges align; Cancel/Save remain equal.
- PASS: TypeScript, ESLint, touched-file Prettier, diff check, Staff Shift
  contract, and Batch 02B action relocation contract.

### Task state

User Review Correction Batch 02B remains `VERIFY` pending user visual review.
