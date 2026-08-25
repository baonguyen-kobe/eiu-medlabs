# EIU MedLabs UI Modernization Tracker

This is the authoritative stable-ID task registry. Status definitions and Definition of Done are in `MASTER-PLAN.md`.

Rules:

- Never rename audit IDs.
- Never mark a cross-feature parent `DONE` until all non-deferred children are `DONE`.
- Normally, only one primary implementation batch is `IN_PROGRESS`.
- Every `BLOCKED` row states its blocker.
- `DONE` requires applicable verification evidence.

## Primary task registry

| ID       | Task                                                                    | Phase | Priority | Status  | Dependencies                                               | Scope                                                     | Verification/Evidence                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------- | ----- | -------- | ------- | ---------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRACK-01 | Persistent UI modernization tracking foundation                         | 0     | P0       | DONE    | None                                                       | Documentation and agent continuity only                   | Audit archived hash-identically; foundation commit `507e08c869049f38882e7129ad47fb319df4ad50` published to canonical `baonguyen1301/eiu-medlabs` `main`                                                                                                                                      |
| BASE-01  | Authenticated protected-screen rendered baseline                        | 0     | P0       | IN_PROGRESS | Local Supabase and approved local administrator | Representative protected routes at required viewports | Local authenticated baseline authorized and active; rendered evidence required before completion |
| DEC-01   | Choose business-approved accessible signature/confirmation alternative  | 1     | P0       | DONE    | User/business decision                                     | Equipment handover/return and Basic Medical confirmation  | Business owner retained pointer-drawn signature; see DEC-UI-013 |
| A11Y-01  | Replace pointer-only required signature interaction                     | 1     | P0       | DEFERRED | DEC-01                                                     | Two signature/confirmation workflow families              | Business owner explicitly retained pointer-drawn signature; known non-pointer accessibility limitation accepted and deferred |
| AUTH-01  | Repair forgot/reset/change-password screens using approved login family | 1     | P1       | DONE    | TRACK-01                                                   | Three auth routes; no business/auth behavior changes      | Commits `0106503`, `cdbcd1e`, `de47134`. PASS: Prettier, targeted ESLint, TypeScript, build, login accessibility E2E, 375/768/1024/1440 rendered sweep, keyboard focus order, pending focus, status/alert semantics, local axe scan, `/login` regression, and user visual acceptance         |
| A11Y-02  | Consolidate overlay focus, Escape, inert, and focus-return behavior     | 2     | P1       | BACKLOG | AUTH-01; BASE-01 where protected                           | Shared overlay foundation plus five child families        | ConfirmDialog is accepted behavior reference                                                                                                                                                                                                                                                 |
| A11Y-03  | Complete SearchableCombobox keyboard model                              | 2     | P1       | DONE    | AUTH-01                                                    | Seven consumers                                           | Commit `df72c82`. Technical and rendered evidence passed; manual user review deferred by explicit user authorization for the 2026-08-25 overnight batch                                                                                                                                      |
| A11Y-04  | Add accessible names to filters and repeated-row controls               | 2     | P1       | DONE    | AUTH-01                                                    | Basic Medical equipment and Staff Shifts first            | Commit `6e5d202`. Technical and rendered evidence passed; manual user review deferred by explicit user authorization for the 2026-08-25 overnight batch                                                                                                                                      |
| TABLE-01 | Add accessible TableScrollViewport contract                             | 2     | P1       | DONE    | AUTH-01                                                    | Repeated responsive table wrappers                        | Commit `1c7acec`. Technical and rendered evidence passed; manual user review deferred by explicit user authorization for the 2026-08-25 overnight batch                                                                                                                                      |
| FORM-01  | Formalize field, description, error, and invalid relationships          | 2     | P2       | DONE    | AUTH-01                                                    | Shared field foundation and gradual adoption              | Commit `dc675c6`. TimePicker is the representative adopter; gradual adoption remains future work. Manual user review deferred by explicit user authorization for the 2026-08-25 overnight batch                                                                                              |
| TOUCH-01 | Establish touch-target baseline for compact actions                     | 2     | P1       | DONE    | AUTH-01                                                    | Staff-shift actions first; shared compact controls        | Commit `b75e571`. Coarse/mobile pointer targets: 40px event actions and 44px empty-cell actions; desktop remains 24×28px. PASS: `/staff-shifts` at 375/768/1024/1440, no page overflow. Manual user review deferred by explicit overnight authorization                                      |
| PILOT-01 | Classes responsive/accessibility representative pilot                   | 3     | P1       | DONE    | A11Y-03; A11Y-04; TABLE-01; FORM-01; TOUCH-01              | `/classes/open`, `/classes/mine`, `ClassRegistrationList` | Verification-only: existing current source met pilot criteria after foundations. PASS: filters/toolbar, combobox/TimePicker integration, named/focusable table viewport, actions, and 375/768/1024/1440 local scroll parity. Manual user review deferred by explicit overnight authorization |
| MOB-01   | Assign and implement per-table mobile strategies                        | 3–5   | P1       | BACKLOG | TABLE-01; PILOT-01                                         | Seven child families                                      | Parent stays open until all non-deferred children are DONE                                                                                                                                                                                                                                   |

| MOB-01.1 | Classes pilot mobile column priority | 3 | P1 | DONE | PILOT-01 | `/classes/open`, `/classes/mine`, `ClassRegistrationList` | Commit `ce00c9a`. Strategy B: read-only narrow rows hide course code and student count; editable rows retain all required controls and local scroll. PASS: 375/768 strategy gate, 1024/1440 full layout, actions retained. Manual user review deferred by explicit overnight authorization |

| MOB-01.4 | Basic Medical equipment mobile strategies | 4 | P1 | DONE | PILOT-01 | `/basic-medical/equipment` | Commit `9b3ff59`. Catalog/logs use Strategy A local scroll; rooms/damaged use Strategy B hiding secondary commercial/unit/good/actor/date fields at narrow widths while keeping primary data/actions. Manual user review deferred by explicit overnight authorization |
| PERF-01 | Remove personnel page per-row request fan-out | 7 | P1 | DONE | PILOT-01 | `/admin/personnel` server loading | Commit `705fc62`. For 29 local personnel rows: before 29 Auth Admin + 29 profile queries = 58 row-scoped calls; after 1 paginated Auth Admin list + 1 batched profile query = 2 calls. Server-only result shape/security preserved. Manual user review deferred by explicit overnight authorization |
| DS-01 | Consolidate semantic token generations safely | 6 | P1 | BACKLOG | BASE-01; PILOT-01 | Global tokens only | Computed-style and visual regression evidence required |
| DS-02 | Incrementally reduce global CSS architecture debt | 6 | P1 | BACKLOG | DS-01; BASE-01; PILOT-01 | Seven mandatory child batches | Never execute as one giant globals.css cleanup |
| ARCH-01 | Consolidate import wizard presentation shell | 5 | P2 | DONE | PILOT-01 | Schedule and equipment import wizards | Commit `95f2678`. Extracted shared accessible preview viewport/pagination presentation; domain parsing, validation, actions, results, and five-step flows remain separate. PASS: import entry routes at 375/1440. Manual user review deferred by explicit overnight authorization |
| ARCH-02 | Extract demonstrated cohesive boundaries from large client components | 7 | P2 | BACKLOG | PILOT-01; relevant rollout tasks | Dashboard, shifts, request and registration components | No line-count-only refactor; require behavior/performance evidence |
| STATE-01 | Add route loading/error and recoverable async-state foundations | 7 | P2 | BACKLOG | PILOT-01 | App Router states and shared UX | Preserve known environment failures as distinct blockers |
| STATE-02 | Add lifecycle-history request failure state | 7 | P2 | BACKLOG | Shared async-state direction where applicable | Equipment lifecycle history | Must eliminate perpetual loading on a failed RPC |
| INT-01 | Resolve dead or misleading controls | 5 | P2 | DONE | AUTH-01 | Dashboard `Xem tất cả`; login options | Commit `24d9efa`. Removed non-functional Remember Login; Show Password is memory-only, off by default, preserves typed value when toggled, and does not customize Supabase sessions. Dashboard lecturer all-link remains a functional source `Link` to `/classes/open`; manual user review deferred by explicit authorization for MEGA RUN A v2 |
| TYPE-01 | Remove unsupported undersized content typography | 6 | P2 | BACKLOG | DS-01; PILOT-01 | Legacy metadata and Staff Shifts | Preserve density; do not enlarge blindly |
| CONTRAST-01 | Correct demonstrated muted login contrast | 6 | P2 | BACKLOG | AUTH-01; DS-01 | Login secondary copy | Audit measured 4.28:1; verify rendered computed contrast |
| Z-01 | Formalize overlay and sticky layering policy | 6–8 | P3 | BACKLOG | A11Y-02; DS-02.5 | Sticky, popover, drawer, modal, toast | Verify no layer regressions on representative routes |
| INT-02 | Add consistent pressed-state feedback | 6–8 | P3 | BACKLOG | DS-01; PILOT-01 | Shared buttons and toggles | Keyboard/touch/mouse behavior; no layout-shifting motion |
| QA-01 | Final full-route viewport, keyboard, accessibility, and identity sweep | 8 | P0 | BACKLOG | All non-deferred implementation tasks | All 32 page routes | `QA-MATRIX.md` complete with no invented PASS states |

## Cross-feature child tasks

### A11Y-02 overlay families

| ID        | Task                                            | Phase | Priority | Status  | Dependencies     | Scope                     | Verification/Evidence                                          |
| --------- | ----------------------------------------------- | ----- | -------- | ------- | ---------------- | ------------------------- | -------------------------------------------------------------- |
| A11Y-02.1 | Mobile WorkspaceShell/sidebar focus contract    | 2     | P1       | BACKLOG | A11Y-02; BASE-01 | Mobile navigation         | Trap/inert, Escape, scrim close, focus return, 375/768         |
| A11Y-02.2 | Personnel drawer focus contract                 | 2–4   | P1       | BACKLOG | A11Y-02; BASE-01 | Personnel edit drawer     | Initial focus, trap, sticky regions, pending, close and return |
| A11Y-02.3 | Staff-shift dialog focus contract               | 2–4   | P1       | BACKLOG | A11Y-02; BASE-01 | Quick/edit dialogs        | Shared shell, field names, Escape, return, mobile fit          |
| A11Y-02.4 | Equipment modal focus contract                  | 2–4   | P1       | BACKLOG | A11Y-02; BASE-01 | Item and signature modals | Shared shell; signature behavior remains blocked by DEC-01     |
| A11Y-02.5 | Basic Medical confirmation modal focus contract | 2–4   | P1       | BACKLOG | A11Y-02; BASE-01 | Confirmation modal        | Shared shell; signature behavior remains blocked by DEC-01     |

### MOB-01 table families

| ID       | Task                                       | Phase | Priority | Status  | Dependencies                  | Scope                                                | Verification/Evidence                              |
| -------- | ------------------------------------------ | ----- | -------- | ------- | ----------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| MOB-01.1 | Classes pilot mobile column priority       | 3     | P1       | DONE | PILOT-01                      | `/classes/open`, `/classes/mine`                     | Commit `ce00c9a`; manual user review deferred by explicit overnight authorization |
| MOB-01.2 | Equipment request mobile strategy          | 4     | P1       | BACKLOG | PILOT-01; A11Y-02.4           | Request summary/detail and item editing              | Strategy D for list; C/F where editing requires it |
| MOB-01.3 | Basic Medical registration mobile strategy | 4     | P1       | BACKLOG | PILOT-01; A11Y-02.5           | Registration/session/condition tables                | Strategy D/F; preserve approved business layout    |
| MOB-01.4 | Basic Medical equipment mobile strategy    | 4     | P1       | DONE | PILOT-01                      | Catalog, inventory, damaged, logs                    | Commit `9b3ff59`; manual user review deferred by explicit overnight authorization |
| MOB-01.5 | Personnel mobile strategy                  | 4     | P1       | BACKLOG | PILOT-01; A11Y-02.2           | Personnel table/drawer                               | Strategy E; preserve desktop table reference       |
| MOB-01.6 | Staff shifts mobile strategy               | 4     | P1       | BACKLOG | PILOT-01; TOUCH-01; A11Y-02.3 | Calendar and registration rows                       | Touch, labels, local scroll, dialog fit            |
| MOB-01.7 | Remaining table-family mobile strategies   | 5     | P2       | BACKLOG | MOB-01.1; PILOT-01            | Catalogs, imports, email, audit, dashboard, evidence | Record A/B/C/D/E/F decision per family             |

### DS-02 safe CSS batches

| ID      | Task                                                | Phase | Priority | Status  | Dependencies                | Scope                                    | Verification/Evidence                              |
| ------- | --------------------------------------------------- | ----- | -------- | ------- | --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| DS-02.1 | Consolidate token aliases                           | 6     | P1       | BACKLOG | DS-01; BASE-01; PILOT-01    | Legacy and semantic variables            | Computed-style parity and viewport evidence        |
| DS-02.2 | Consolidate auth styles                             | 6     | P1       | BACKLOG | AUTH-01; DS-02.1            | Login/recovery/reset/change              | Public four-viewport screenshots and accessibility |
| DS-02.3 | Consolidate table styles                            | 6     | P1       | BACKLOG | TABLE-01; PILOT-01; DS-02.1 | Table shell/header/cell/scroll rules     | Representative table families and edge geometry    |
| DS-02.4 | Consolidate form styles                             | 6     | P2       | BACKLOG | FORM-01; PILOT-01; DS-02.1  | Fields, sections, toolbars               | Four viewports and focus/error states              |
| DS-02.5 | Consolidate overlay styles                          | 6     | P1       | BACKLOG | A11Y-02; DS-02.1            | Dialogs, drawers, popovers               | Focus, viewport, stacking and pending evidence     |
| DS-02.6 | Consolidate Staff Shift local styles                | 6     | P2       | BACKLOG | MOB-01.6; DS-02.1           | Staff Shift page-local Tailwind variants | Preserve workflow and MedLabs identity             |
| DS-02.7 | Remove remaining verified-obsolete legacy selectors | 6     | P2       | BACKLOG | DS-02.1–DS-02.6             | Residual global CSS only                 | Per-selector evidence; no broad rewrite            |

## Reconciliation summary

```text
Audit IDs expected: 21
Tracker audit IDs mapped: 21
Unmapped audit IDs: none
New planning IDs: TRACK-01, BASE-01, DEC-01, PILOT-01, QA-01
```
