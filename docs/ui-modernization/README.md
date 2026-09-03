# EIU MedLabs UI Modernization — Start Here

This directory is the authoritative, Git-tracked continuity system for the EIU MedLabs UI/UX, responsive-design, accessibility, design-system, and frontend-modernization effort. Chat history is not required to resume work.

The system is agent/model-independent. Any agent that can read the repository can resume by reading:

1. `docs/DOCUMENTATION_AUTHORITY.md`
2. `docs/ui-modernization/README.md`
3. `docs/ui-modernization/CURRENT.md`
4. `docs/ui-modernization/TRACKER.md`
5. `docs/ui-modernization/DECISIONS.md`

Git-tracked project state is authoritative. Continuity must not depend on a ChatGPT account, Codex session, OMP model, GPT-5.6 Sol/Terra, Gemini, terminal lifetime, or chat memory.

## Source-of-truth hierarchy

For UI modernization, first apply the authority model in
`docs/DOCUMENTATION_AUTHORITY.md`.

Within the UI-modernization domain, use:

1. Explicit current user instruction.
2. Approved current business/security/product contracts.
3. Effective current source when determining what the implementation actually
   does.
4. `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` for canonical visual/design-system
   rules.
5. `docs/ui-modernization/DECISIONS.md` for durable modernization decisions.
6. `docs/ui-modernization/CURRENT.md` for the active checkpoint.
7. `docs/ui-modernization/TRACKER.md` for task status and dependencies.
8. `docs/ui-modernization/MASTER-PLAN.md` for planned sequencing.
9. Audit evidence in `docs/ui-modernization/audits/` for historical evidence.

`docs/UI_LAYOUT_SPEC.md` and `docs/UI_REVIEW_GUIDE.md` are supplemental
references only. They cannot override the UI Master, approved current product
contracts, effective source, or modernization continuity state.

Do not treat an implementation defect as a new design decision merely because
it exists in source. Conversely, do not claim current implementation behavior
from documentation alone when the source can be inspected.

Record deliberate modernization decision changes in `DECISIONS.md`.
Use `WORKLOG.md` for historical execution evidence rather than as an authority
over current state.

## Session startup protocol

For any new Codex, Gemini, OMP, Orca, IDE-agent, or other coding-agent session working on UI modernization, read in this order:

1. Repository `AGENTS.md` and `docs/DOCUMENTATION_AUTHORITY.md`
2. `docs/ui-modernization/README.md`
3. `docs/ui-modernization/CURRENT.md`
4. `docs/ui-modernization/TRACKER.md`
5. `docs/ui-modernization/DECISIONS.md`
6. `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` for visual specifications
7. `MASTER-PLAN.md` only as needed
8. Relevant audit evidence only as needed

Then run:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```

If this checkout is `main` and UI modernization is active:

1. `git fetch origin`
2. Confirm `origin/ui-modernization` exists.
3. `git switch ui-modernization`
4. Re-read `CURRENT.md`, `TRACKER.md`, and `DECISIONS.md` from that branch.
5. Only then select or continue source work.

Do not implement UI modernization directly on `main`; it is the durable bootstrap and current-continuity mirror.

Rules:

- Do not redo tasks whose tracker status is `DONE`.
- If `CURRENT.md` identifies an active task, inspect existing source and `git diff`, then continue that task.
- If there is no active task, select the first eligible `READY` task by dependency order, phase order, then priority unless the user explicitly requests another task.
- Do not put unrelated tasks `IN_PROGRESS` together.

## Source-first UI request interpretation

Before translating a new UI correction into instructions or code: inspect the current component, relevant CSS/selectors, actual responsive breakpoint, and shared consumers/blast radius; then consult the UI Master and compare the request or screenshot to the real implementation. Do not infer scope, selector, breakpoint, ownership, or shared impact from a screenshot alone. Use GitNexus for complex shared components when useful; direct inspection is sufficient for local changes. **DISCOVER → VERIFY → REUSE → MODIFY** remains governing.

## Explicit user-request rule

An explicit current user request takes precedence. If the user requests work unrelated to UI modernization, perform that task. Do not hijack unrelated work merely because modernization remains active.

## Generic resume requests

When the user says only `continue`, `resume`, `proceed`, `tiếp tục`, `làm tiếp`, `đọc repo rồi tiếp tục`, or equivalent:

```text
read CURRENT
↓
read TRACKER
↓
inspect git status and diff
↓
verify branch and commit
↓
resume the IN_PROGRESS task
or take the first eligible READY task
```

Do not ask the user to reconstruct prior work. If `CURRENT.md` and Git disagree, reconcile Git history, the current diff, `WORKLOG.md`, and `TRACKER.md`; report the inconsistency before any destructive action.

## Task claiming protocol

Before implementation, update `CURRENT.md` with:

```text
Active task: <ID>
Status: IN_PROGRESS
Starting commit: <sha>
```

A coherent batch may contain tightly coupled parent/child tasks only when documented. Normally, only one primary implementation batch is `IN_PROGRESS`.

## Task completion protocol

Before changing a task to `DONE`, record applicable evidence:

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

Use only:

```text
PASS
FAIL
BLOCKED(reason)
N/A
```

If implementation exists but required verification is incomplete, use `VERIFY`, not `DONE`. Never turn an unavailable check into `PASS`. Keep the known local test-environment limitations distinct from code regressions.

## User visual acceptance gate

For user-visible visual changes:

```text
implementation
→ technical/rendered verification
→ localhost preview
→ user visual review
→ final approved polish
→ final quick regression
→ commit/push
→ DONE
```

During active user visual review, retain `VERIFY`, keep localhost available when practical, and do not commit/push iterative visual revisions unless the user explicitly approves it or interruption safety requires a recorded checkpoint. After explicit approval, run the smallest relevant regression, update tracking, then move `VERIFY` to `DONE`. This gate does not apply mechanically to documentation-only or non-visual work.

## Interruption recovery

### Case A — Uncommitted source changes exist

Read `CURRENT.md` and inspect `git diff`. Determine whether the changes belong to the recorded active task. Continue them; do not restart from scratch.

### Case B — Working tree is clean

Compare:

- the baseline/last-known commit in `CURRENT.md`
- `git rev-parse HEAD`
- `WORKLOG.md`
- `TRACKER.md`

If HEAD is newer than `CURRENT.md`, inspect intervening commits and update tracking state before implementation.

### Case C — Tracking update is incomplete

Use Git commit evidence and recorded verification. Do not mark work `DONE` without evidence.

## Session end protocol

Before ending a UI-modernization session:

1. Run applicable verification.
2. Update `TRACKER.md`.
3. Update `CURRENT.md`.
4. Update `QA-MATRIX.md` where relevant.
5. Update `DECISIONS.md` if a decision changed.
6. Append `WORKLOG.md`.
7. Review `git diff`.
8. Commit only when task and tracking state form a coherent batch.
9. Record the implementation commit SHA in tracking evidence.

This protocol must work without chat history.

## Commit convention

Prefer stable task IDs in implementation commit subjects:

```text
fix(AUTH-01): unify password recovery auth shell
fix(A11Y-03): add combobox keyboard navigation
feat(TABLE-01): add accessible table scroll viewport
fix(TOUCH-01): enlarge staff shift action targets
```

Implementation, verification evidence, and tracking updates for the same task should normally be committed together. Avoid separate tracker-only commits unless necessary.

## Branch strategy

- Canonical repository: `baonguyen1301/eiu-medlabs`.
- Canonical delivery remote and push target: `origin`.
- `origin/main` is the durable bootstrap and current-continuity mirror.
- UI implementation uses the long-lived `ui-modernization` branch based on current `origin/main`.
- A main checkout must switch to `ui-modernization` before implementation work.
- Do not use `baonguyen-kobe/eiu-medlabs` for EIU MedLabs UI modernization delivery.
- Do not merge or open a pull request automatically unless explicitly authorized.
- Explicit user direction may change this strategy.

## Infrastructure and verification policy

- Local-first verification is authoritative for current UI modernization work.
- For manual UI verification, use `localhost` port `4000`; if occupied, select the next free port from `4001`, `4002`, `4003`, and onward. Do not change `package.json` merely to enforce a port.
- Before requesting or creating infrastructure: **DISCOVER → VERIFY → REUSE → CREATE only if needed**.
- Inspect and reuse existing automated test infrastructure first.
- Workflow YAML does not require UI modernization to use, change, or trigger GitHub Actions.
- Do not configure or reuse a self-hosted runner unless separately approved and explicitly required.

## Key files

- `CURRENT.md` — concise active checkpoint and next action
- `TRACKER.md` — authoritative stable-ID task registry
- `DECISIONS.md` — durable accepted and pending decisions
- `MASTER-PLAN.md` — goals, phase order, dependencies, and Definition of Done
- `QA-MATRIX.md` — route-by-route rendered verification evidence
- `WORKLOG.md` — append-only historical record
- `audits/` — immutable historical audit evidence
