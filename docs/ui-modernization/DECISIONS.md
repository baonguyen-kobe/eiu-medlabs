# EIU MedLabs UI Modernization Decisions

This file records durable accepted and pending decisions. Do not silently rewrite accepted history. Add a new decision or explicitly supersede an existing decision when direction changes.

## DEC-UI-001 — Preserve MedLabs identity

**Status:** ACCEPTED

Keep:

- Be Vietnam Pro
- EIU blue/gold/cream
- existing navigation direction
- existing table/card family
- approved sidebar, topbar, KPI, form, calendar, import, evidence, and login directions

**Reason:** The audit found a coherent, deliberately branded operational product.

## DEC-UI-002 — No major frontend redesign

**Status:** ACCEPTED

**Decision:** Improve and consolidate incrementally. Do not replace the frontend visual language, framework, Tailwind, or component architecture wholesale.

**Reason:** The audit found a functional product that needs consistency, accessibility, responsive refinement, and maintainability work rather than replacement.

## DEC-UI-003 — Mobile tables use per-table strategies

**Status:** ACCEPTED

Do not convert all tables to cards. Use the audit strategy appropriate to the table's information architecture:

- A — horizontal scrolling acceptable
- B — hide lower-priority columns
- C — transform rows into cards
- D — expandable/detail row
- E — split summary/detail
- F — mobile-specific condensed table

Record each family decision in the tracker and QA evidence.

## DEC-UI-004 — No new component or UI library

**Status:** ACCEPTED

Build only evidence-justified structural primitives around existing MedLabs styling. Do not introduce a second visual/component system.

## DEC-UI-005 — ConfirmDialog is the focus-management reference

**Status:** ACCEPTED

Use `ConfirmDialog` behavior as the reference for shared dialog/drawer foundations: initial focus, Escape handling when safe, focus trapping, focus return, pending handling, accessible title/description, and stable actions.

This decision does not require every overlay to use identical visual content or size.

## DEC-UI-006 — Global CSS cleanup must be incremental

**Status:** ACCEPTED

Never perform one giant `globals.css` rewrite. Execute the stable `DS-02.N` batches only after required baseline, foundation, pilot, and visual evidence exist.

## DEC-UI-007 — Accessible signature interaction

**Status:** PENDING

**Question:** What business-approved non-pointer method should satisfy equipment handover/return and Basic Medical confirmation/signature workflows?

Do not invent the answer. `DEC-01` and `A11Y-01` remain blocked until the user/business owner accepts a behavior.

## DEC-UI-008 — Canonical repository and development branch

**Status:** ACCEPTED

**Decision:** `baonguyen1301/eiu-medlabs` is the canonical repository. `origin` is the canonical remote and only delivery push target for EIU MedLabs UI modernization. `ui-modernization` is the development branch and must remain based on current `origin/main`.

Do not use `baonguyen-kobe/eiu-medlabs` for UI modernization delivery.

## DEC-UI-009 — Local-first verification and infrastructure restraint

**Status:** ACCEPTED

**Decision:** Manual UI verification runs locally on `localhost` port `4000`, or the next free port from `4001` upward. Existing automated test infrastructure must be discovered and reused before new infrastructure is considered.

Use:

```text
DISCOVER
→ VERIFY
→ REUSE
→ CREATE only if needed
```

GitHub Actions workflow presence does not require a modernization task to use, change, or trigger workflows. Do not configure or reuse self-hosted runners unless separately approved and explicitly required. Local-first verification remains authoritative until a later documented decision changes this policy.

## DEC-UI-010 — Source-first UI interpretation and user visual acceptance

**Status:** ACCEPTED

Before translating a UI correction into code, inspect the current component, relevant CSS/selectors, actual responsive breakpoint, and shared consumers/blast radius; then consult the UI Master and compare the request or screenshot with that real implementation. Do not infer scope, selector, breakpoint, ownership, or shared impact from a screenshot alone. Use GitNexus for complex shared components when useful; direct inspection is sufficient for localized changes.

For user-visible visual work: implementation → technical/rendered verification → localhost preview → user visual review → final approved polish → quick regression → commit/push → `DONE`. Retain `VERIFY` during active review and do not commit/push iterative visual revisions without user approval unless interruption safety requires a recorded checkpoint.

## DEC-UI-011 — UI-only local preview backend isolation

**Status:** ACCEPTED

Manual UI preview uses `localhost:4000`, or the next free port at or above 4001. Reuse a local Supabase Docker/runtime only when the app needs its contract to render; use local mock or seed data only when a screen needs data.

Do not connect UI modernization preview to production Supabase, obtain production credentials for preview, change business/auth logic to bypass security, or introduce a committed auth-bypass mode. Production auth, email, and reset flows are not required unless a future task explicitly includes them.

Local UI rendering does not satisfy `BASE-01`. It remains a distinct blocked task until an authenticated protected-route baseline is explicitly requested and established.

## DEC-UI-012 — 2026-08-25 overnight deferred manual review

**Status:** ACCEPTED

**Scope:** The explicitly authorized 2026-08-25 unattended batch only.

Technical and rendered verification remain mandatory. The covered user-visible tasks may move to `DONE` when that evidence passes, but no record may state user visual acceptance tonight. Manual review is deferred to the next review session; any regression found then becomes a new correction/regression task linked to its origin. This exception does not weaken the permanent visual-acceptance gate, authorize merging `ui-modernization` into `main`, or apply outside this batch.

## DEC-UI-013 — Retain pointer-drawn signature confirmation

**Status:** ACCEPTED

The business owner explicitly retains the existing drawn canvas signature for Equipment handover/return and Basic Medical session confirmation. No keyboard-only, typed, or alternate non-pointer signature method is approved in this modernization scope. This remains a known accessibility limitation; overlay focus work may improve the surrounding modal but must not reinterpret signature semantics.

## DEC-UI-014 — Local authenticated protected baseline authorized

**Status:** ACCEPTED

The local Supabase runtime and approved local administrator test account are authorized for establishing `BASE-01`. This authorizes local-only rendered baseline evidence; it does not authorize production credentials, production data, auth bypass, or completion of an unrelated production baseline.

## DEC-UI-015 — Supabase default session behavior and show-password control

**Status:** ACCEPTED

Remove the non-functional `Ghi nhớ đăng nhập` control. Retain the current Supabase SSR session/cookie behavior without a custom persistence mode, 30-day lifetime, persistence-policy cookie, or token/password storage. Add an off-by-default `Hiển thị mật khẩu` control that toggles the password input type only in memory and never persists or submits password-display state.

## DEC-UI-016 — 2026-08-25 MEGA RUN A v2 deferred manual review

**Status:** ACCEPTED

**Scope:** The fixed MEGA RUN A v2 queue only. Technical and rendered verification remain mandatory. User-visible tasks may reach `DONE` after those gates pass, while manual review is recorded as deferred by explicit user authorization for MEGA RUN A v2. No evidence may state user visual acceptance tonight. This exception does not alter the permanent review gate or authorize merging `ui-modernization` into `main`.

## DEC-UI-017 — User Review Correction Batch 01 responsive overrides

**Status:** ACCEPTED

The user retains the approved Personnel mobile summary direction while requiring
the dirty-discard dialog actions to remain in one row at 375px. Classes retain
their shared mixed-table structure and local scroll, with a narrower time
column and wider readable course-code column. Staff Shifts use an actionable
desktop calendar but a list at widths through 920px. Basic Medical equipment
uses a 2×2 catalog-action grid at 375px. These corrections preserve business
and permission behavior and remain in `VERIFY` until the user completes review.

## DEC-UI-018 — Restore canonical repository after modernization promotion

**Status:** ACCEPTED

**Decision:** Effective 2026-09-03, `baonguyen-kobe/eiu-medlabs` is restored as
the canonical MedLabs repository and production delivery source.

`origin` in the canonical checkout points to `baonguyen-kobe/eiu-medlabs`.

The existing canonical `ui-modernization` branch is the active integration
branch for the promoted modernization line.

`baonguyen1301/eiu-medlabs@e42b2ed6cbd89bb080a2c74d62f659560207b792`
is retained as the frozen historical modernization source and must not receive
new MedLabs feature delivery after promotion.

This decision supersedes DEC-UI-008 for repository ownership and delivery
target only. All other accepted UI-modernization decisions remain unchanged.

`main` remains the canonical release/deployment branch. Promotion into
`ui-modernization` does not authorize merging to `main`, database mutation, or
production deployment.

**Reason:** The clone was intentionally used as an isolated modernization
workspace. After modernization stabilization and documentation-authority
normalization, development and release preparation return to the original
canonical repository so source review, production migration review, and Vercel
deployment share one canonical history.

## DEC-UI-019 — GitHub-hosted change-aware validation

**Status:** ACCEPTED

**Decision:** Effective 2026-09-03, GitHub-hosted Actions on `ubuntu-latest`
is the primary automated technical gate for canonical MedLabs integration and
release preparation.

Local validation remains appropriate for fast focused feedback,
localhost/rendered review, and reproduction of failures, but a self-hosted
runner or routine full WSL suite is no longer the default CI path.

Validation is change-aware and risk-based. Reuse prior PASS evidence when the
covered behavior and relevant shared/transitive dependencies are unchanged.
Run the smallest sufficient validation for the current diff, and broaden only
when the blast radius requires it.

Full E2E is manual and reserved for major integration, release-candidate,
broad cross-cutting, unresolved-impact, or explicitly requested validation.

Automatic documentation-only pull requests and `main` pushes do not consume
the normal full CI workflow.

This decision supersedes DEC-UI-009 only for verification authority and runner
strategy. Its local preview isolation and infrastructure-restraint principles
remain in force.
