# EIU MedLabs UI Modernization Master Plan

## Purpose

Modernize EIU MedLabs incrementally while preserving its approved identity, business behavior, security boundaries, dense desktop productivity, and operational reliability.

Historical evidence: `audits/2026-08-25-ui-ux-responsive-audit.md`.

## Goals

- Preserve current EIU MedLabs identity.
- Improve responsive and mobile operability.
- Fix accessibility blockers.
- Consolidate implementation fragmentation.
- Reduce regression risk.
- Improve shared frontend architecture incrementally.
- Preserve dense desktop productivity layouts.
- Avoid a wholesale rewrite.

## Explicit non-goals

Do not:

- redesign the whole product
- replace Next.js
- replace React
- replace Tailwind
- introduce another UI library
- change Be Vietnam Pro
- replace EIU blue/gold/cream
- replace existing business workflows without a documented decision
- convert every table into cards
- rewrite the entire global stylesheet at once
- combine visual modernization with unrelated database, authorization, security, or workflow changes

## Permanent design authority

Preserve:

- Be Vietnam Pro
- EIU Blue `#144069`
- EIU Gold `#A78656`
- EIU cream/canvas direction
- sidebar gradient
- white logo block
- gold active-navigation marker
- white sticky topbar
- blue page-title hierarchy
- KPI card direction
- dense desktop operational layouts
- existing table appearance
- Calendar Master
- five-step import flow
- numbered form sections
- document-style evidence
- current login visual family
- Heroicons
- `ConfirmDialog` behavior and tone
- existing business, security, and permission logic

`docs/UI_DESIGN_SYSTEM_V2_MASTER.md` remains the canonical detailed UI authority after current business/security requirements and accepted modernization decisions.

## Status model

Use exactly these implementation statuses:

### BACKLOG

Known task, but dependencies or timing make it not yet actionable.

### READY

Dependencies are satisfied and the task is safe to start.

### IN_PROGRESS

Code or work is actively being changed. Normally, no more than one primary implementation batch is `IN_PROGRESS`.

### BLOCKED

Cannot proceed without a specific dependency, environment, business decision, or external input. Every blocked task must state its blocker.

### VERIFY

Implementation exists, but the Definition of Done has not been fully satisfied.

### DONE

Implementation and required verification are complete.

### DEFERRED

Deliberately postponed with a recorded reason.

Never use `almost done`, `80%`, or `mostly finished` as task state.

## Phase order

### Phase 0 — Continuity and regression baseline

Goals:

- establish durable tracking
- preserve audit evidence
- establish an authenticated rendered baseline when the environment becomes available
- establish representative screenshots/evidence before high-blast-radius CSS changes

Tasks:

- `TRACK-01` persistent tracking foundation
- `BASE-01` protected-route authenticated rendered baseline

The tracking foundation is created in this phase. Protected authenticated screens were not rendered during the audit. `BASE-01` remains `BLOCKED` until approved local authentication/environment access exists. Do not manufacture credentials.

### Phase 1 — Blocking fixes

Primary candidates:

- `AUTH-01`
- `DEC-01`
- `A11Y-01` only after `DEC-01` is accepted

`AUTH-01` is the first unblocked implementation task because the affected routes are public, rendered failure evidence exists, and the current login visual is an approved reference.

Do not implement `A11Y-01` until the accessible signature/confirmation business interaction is explicitly decided. Do not invent that decision.

### Phase 2 — Shared accessibility and UI foundations

Include:

- `A11Y-02` overlay focus behavior
- `A11Y-03` `SearchableCombobox` keyboard model
- `A11Y-04` accessible naming
- `TABLE-01` accessible `TableScrollViewport` contract
- `FORM-01` field/error relationship foundation
- `TOUCH-01` touch-target baseline
- shared overlay, form, and table primitives justified by audit evidence

This phase must not create a second UI library. It formalizes the existing MedLabs system.

### Phase 3 — Representative pilot

Pilot scope:

```text
/classes/open
/classes/mine
ClassRegistrationList
```

Validate:

- existing design identity
- responsive toolbar
- `SearchableCombobox`
- table column priority
- local table scrolling
- keyboard behavior
- action hierarchy
- feedback
- pagination
- 375/768/1024/1440

Do not proceed to broad rollout until `PILOT-01` acceptance criteria pass.

### Phase 4 — High-value operational rollout

Prioritize:

- Equipment Requests
- Basic Medical registrations
- Basic Medical equipment
- equipment request forms
- Staff Shifts
- Personnel

Apply an appropriate table strategy to each family. Do not use a universal mobile-table solution.

### Phase 5 — Remaining tables, forms, and screens

Include:

- catalogs
- imports and import history
- email notifications
- audit log
- dashboard
- calendars
- lower-risk operational screens
- `ARCH-01` import-shell consolidation when dependencies are stable
- `INT-01` dead or misleading controls

### Phase 6 — Design-system and CSS debt consolidation

Only begin after regression evidence, shared primitives, and pilot validation exist.

Include:

- `DS-01` token consolidation
- `DS-02` CSS architecture debt
- `TYPE-01`
- `CONTRAST-01`
- `Z-01`
- `INT-02`
- radius/shadow drift
- obsolete selector cleanup

**`DS-02` must NEVER be executed as one giant "clean globals.css" task.**

Required safe sub-batches:

```text
DS-02.1 token aliases
DS-02.2 auth styles
DS-02.3 table styles
DS-02.4 form styles
DS-02.5 overlay styles
DS-02.6 staff-shift local styles
DS-02.7 remaining legacy selector cleanup
```

Every sub-batch requires visual regression evidence. Remove selectors only after verifying computed behavior and representative routes.

### Phase 7 — Async UX and performance

Include:

- `PERF-01`
- `STATE-01`
- `STATE-02`
- loading, error, and empty-state improvements
- `ARCH-02` or smaller client-boundary improvements only where demonstrated and justified

Do not perform general premature optimization.

### Phase 8 — Final accessibility, responsive, and visual QA

Include:

- keyboard sweep
- viewport sweep
- contrast sweep
- typography cleanup
- touch-target sweep
- pressed states
- z-index/layering cleanup
- remaining visual consistency
- complete final route matrix under `QA-01`

## Mobile table strategy

Use the audit strategy codes according to each table's information architecture:

- **A** — horizontal scrolling acceptable
- **B** — hide lower-priority columns
- **C** — transform rows into cards
- **D** — expandable/detail row
- **E** — split summary/detail
- **F** — mobile-specific condensed table

Do not convert every table into cards. Catalog, audit, evidence, and import-preview tables often benefit from horizontal comparison.

## Parent and child tasks

Cross-feature parent tasks remain open until all non-deferred child tasks are `DONE`. Child task IDs use `PARENT.N` and remain stable after creation. Do not silently drop or rename historical audit IDs.

## Definition of Done

A UI implementation task is not complete because it compiles.

Applicable completion flow:

```text
implementation
↓
typecheck
↓
lint
↓
relevant tests
↓
375px verification
↓
768px verification
↓
1024px verification
↓
1440px verification
↓
keyboard verification if interactive
↓
accessibility verification if relevant
↓
MedLabs visual-identity check
↓
git diff review
↓
tracking updated
↓
DONE
```

Before `DONE`, record:

```text
typecheck:
lint:
tests:
375:
768:
1024:
1440:
keyboard:
accessibility:
visual identity:
commit:
```

Allowed evidence states:

```text
PASS
FAIL
BLOCKED(reason)
N/A
```

Rules:

- If a required check cannot run, record `BLOCKED(reason)`.
- Never turn an unavailable check into `PASS`.
- Use `VERIFY` when implementation exists but verification is incomplete.
- Keep known local Supabase/test configuration and line-ending baseline issues distinct from code regressions.
- Compilation does not replace rendered verification for UI changes.
- A screenshot alone does not prove interaction or accessibility.
- Review the final diff for unrelated source, business, security, data, package, or environment changes.
- Update `TRACKER.md`, `CURRENT.md`, `QA-MATRIX.md`, and `WORKLOG.md` as part of the coherent task commit.
