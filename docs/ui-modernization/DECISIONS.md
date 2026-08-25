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
