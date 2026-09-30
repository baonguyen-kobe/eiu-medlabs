# Current UI Modernization State

Last updated: 2026-09-30

## Current branch

`ui-modernization`

## Canonical repository

`baonguyen-kobe/eiu-medlabs`

## Canonical base

`origin/main`

## Frozen historical modernization source

`baonguyen1301/eiu-medlabs@e42b2ed6cbd89bb080a2c74d62f659560207b792`

## Tracking foundation history

`507e08c869049f38882e7129ad47fb319df4ad50` — initial tracking foundation commit.

`b36880d5e18ca39d2da5db8464981d0e601b7ad3` — baseline/continuity follow-up commit.

## Current phase

Phase 2 — Shared accessibility and UI foundations, plus active Equipment Request workflow redesign review.

## Active task

Equipment Request workflow + responsive UI proposal review.

**Status:** VERIFY / USER REVIEW

Durable handoff:

`docs/ui-modernization/EQUIPMENT_REQUEST_WORKFLOW_HANDOFF.md`

This handoff is required reading before any new equipment-request UI/workflow implementation. It records the accepted business flow, terminology, signature rules, `Trả thiếu` recovery model, Figma SOURCE/PROPOSAL references, and the final responsive polish direction.

## Current Equipment UI review state

Desktop `PROPOSAL v2` direction is substantially accepted.

Responsive proposal frames exist for iPad 1024 and Phone 390 for both Admin/Staff and User/TA. One final alignment/polish pass is approved before the responsive proposal is treated as the implementation baseline.

Key polish items are recorded in section 14 of `EQUIPMENT_REQUEST_WORKFLOW_HANDOFF.md` and include:

- unified iPad/phone gutters and spacing rhythm;
- remove redundant iPad `Bộ lọc` action while visible filters remain expanded;
- preserve `Phòng/Lab`, scope/domain context, and `Giảng viên` in proposal summaries;
- split Admin status progression from PDF/delete utilities;
- align `Bàn giao` / `Trả thiết bị` confirmation grids;
- move Admin request-level `Ghi chú` into the same supporting-card stack used across responsive layouts.

Do not implement this redesign in source until the proposal receives user visual acceptance unless the user explicitly asks to start implementation earlier.

## Recently completed

MOB-01.7 — DONE — USER VISUAL PASS (04A Catalogs, 04B Email, 04C Imports/Audit/Dashboard/Evidence)

MOB-01.2 — DONE — USER VISUAL PASS — Batch 03G + Addenda

AUTH-01 — DONE

A11Y-03 — DONE — USER VISUAL PASS

TABLE-01 — DONE — USER VISUAL PASS

FORM-01 — DONE — USER VISUAL PASS

A11Y-04 — DONE — USER VISUAL PASS

ARCH-01 — DONE — USER VISUAL PASS

A11Y-02.4 — DONE — USER VISUAL PASS

STATE-02 — DONE — USER VISUAL PASS

MOB-01.4 — DONE — USER VISUAL PASS

PILOT-01, MOB-01.1, MOB-01.4, MOB-01.5, MOB-01.6, and TOUCH-01 — DONE — USER VISUAL PASS

## Existing modernization continuation task

A11Y-02.5 / Basic Medical confirmation modal focus contract remains an existing modernization task from the previous checkpoint. Reconcile priority with the explicitly active Equipment Request review before resuming unrelated work.

## Blocked tasks

- A11Y-01 — deferred: business owner retained the pointer-drawn signature limitation.

## Completed foundation

- UI/UX responsive audit completed.
- Audit archived in repository.
- Persistent tracking system created.

## Do not change

- MedLabs visual identity.
- Be Vietnam Pro.
- EIU blue/gold/cream.
- Business, security, and permission logic unless an approved scoped product change explicitly requires it.
- Framework and UI stack.

## Resume protocol

A new agent should:

1. Read `README.md`.
2. Read `docs/DOCUMENTATION_AUTHORITY.md`.
3. Read this file.
4. If the task concerns equipment requests, read `docs/ui-modernization/EQUIPMENT_REQUEST_WORKFLOW_HANDOFF.md` in full.
5. Read `TRACKER.md` and `DECISIONS.md`.
6. Inspect Git status, branch, commit, and diff.
7. For visual work, inspect current Figma frames rather than assuming the handoff's frame contents have not been manually edited.
8. Continue the explicitly active task or reconcile with the first eligible `READY` task.

If this checkpoint and Git disagree, reconcile Git history, `WORKLOG.md`, `TRACKER.md`, current docs, and the current diff before changing source.
