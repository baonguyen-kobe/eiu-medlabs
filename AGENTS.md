# MedLabs Calendar agent guide

## Documentation authority

Before planning or executing work, consult `docs/DOCUMENTATION_AUTHORITY.md`. It defines the strict document precedence hierarchy, canonical repository and branch ownership, runtime role and capability contracts, and codebase navigation rules.

## Codebase navigation and intelligence

Use the smallest sufficient navigation tool for the task:

- Use direct code search and file inspection for simple localized work.
- Use GitNexus for repository architecture, dependencies, execution flow, shared consumers, or blast-radius analysis when useful. The GitNexus CLI is installed globally, this repository has a current project-local index, and GitNexus MCP is configured project-locally.
- Do not require GitNexus for trivial local edits and do not re-index solely to answer a localized question.
- Graphify remains optional when `graphify-out/graph.json` exists. Run Graphify commands from the repository root so generated output stays under `graphify-out/`; use its query, path, explain, or wiki output only when present and relevant.
- Keep generated, temporary, backup, and tool-index files out of Graphify via `.graphifyignore`.

## Repository skill discovery

Before planning implementation work, inspect `.agents/skills`, `.codex/skills`, and `.claude/skills` when they exist. Read each candidate `SKILL.md` front matter first, classify its relevance, then read and apply the full instructions only for relevant skills.

The repository-owned baseline skills live in `.agents/skills` and are tracked with the source. `.codex/` and `.claude/` remain available as optional tool-specific local integrations; do not copy generated local skills into a worktree or commit them as a provisioning substitute.

## Version-matched Next.js guidance

Read `NEXTJS_AGENTS.md` before changing Next.js behavior. It indexes the documentation bundled with the installed Next.js version; consult the linked files under `node_modules/next/dist/docs` instead of relying on remembered framework behavior.

Regenerate the index after upgrading Next.js:

```powershell
npx.cmd @next/codemod agents-md --output NEXTJS_AGENTS.md
```

## Coding guardrails

Apply `.agents/skills/karpathy-coding-heuristics/SKILL.md` for implementation, bug fixes, refactors, and reviews:

- Think before coding and make material assumptions explicit.
- Prefer the simplest solution that fully meets the request.
- Keep changes surgical and preserve unrelated user work.
- Verify against observable success criteria.

For new or substantially modified source files, treat 350 lines as a review signal and 450 lines as a soft ceiling. Extract a cohesive boundary only when it improves the requested change; do not perform broad cleanup solely to satisfy a line count.

## Specialized guidance

- Use the Supabase skills for any Auth, database, RLS, migration, Edge Function, or Supabase client change.
- Use the Vercel React best-practices skill for React/Next.js implementation and performance work.
- Use the web-design-guidelines skill for explicit UI/UX or accessibility reviews.
- Use OpenSpec for cross-cutting features, breaking behavior, schema/security changes, or work that needs a durable proposal. Small fixes and localized UI changes should remain direct.

## Canonical UI/UX authority

For every MedLabs UI/UX implementation or review task, read `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` before modifying UI. After existing business/security requirements, it is the canonical UI authority. Do not recreate or copy the full Master into prompts or new files; when the user approves a UI rule change, update this file first and then implement against it.

`docs/UI_LAYOUT_SPEC.md` and `docs/UI_REVIEW_GUIDE.md` are supplemental references only and cannot override `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` or `docs/ui-modernization/` decisions and tracker state.

## Source-first UI correction interpretation

Before formulating or executing a user UI correction:

1. Inspect the current component/source.
2. Inspect the relevant CSS and selectors.
3. Determine the actual responsive breakpoint.
4. Inspect shared consumers and blast radius when relevant.
5. Consult the canonical UI Master.
6. Compare the request or screenshot against that real implementation.

Do not infer scope, selector, breakpoint, ownership, or shared impact from a screenshot alone when source inspection resolves it. Use GitNexus for complex shared components when useful; direct inspection is sufficient for localized work. **DISCOVER → VERIFY → REUSE → MODIFY** remains governing.

OpenSpec lifecycle:

1. `$openspec-propose` for a large change.
2. `$openspec-apply-change` after approval.
3. `$openspec-archive-change` after verification.

## UI Modernization Continuity

The persistent UI/UX/responsive modernization state is stored in:

`docs/ui-modernization/`

If this checkout is `main` and UI modernization is active, fetch `origin`, confirm `origin/ui-modernization` exists, switch to `ui-modernization`, then re-read `CURRENT.md`, `TRACKER.md`, and `DECISIONS.md` before source work. Do not implement UI modernization directly on `main`; it is the durable bootstrap and current-continuity mirror.

For any UI modernization, responsive, accessibility, design-system, frontend-polish, or related continuation task:

1. Read `docs/ui-modernization/README.md`.
2. Read `docs/ui-modernization/CURRENT.md`.
3. Read `docs/ui-modernization/TRACKER.md`.
4. Respect `docs/ui-modernization/DECISIONS.md`.
5. Do not redo tasks marked `DONE`.
6. If a task is `IN_PROGRESS`, inspect the current Git diff and continue it rather than restarting.
7. Before ending the task, update the tracking files required by the session-end protocol.
8. Never mark `DONE` without applicable verification evidence.

### User visual acceptance gate

For user-visible visual changes: implement → technical/rendered verification → localhost preview → user visual review → approved polish → quick regression → commit/push → `DONE`.

During active user visual review, keep the task `VERIFY`, keep localhost available when practical, and do not commit/push iterative visual revisions unless the user approves it or interruption safety requires a clearly recorded checkpoint. After explicit acceptance, run the smallest relevant final regression, update tracking, and move `VERIFY` to `DONE`. This gate does not apply mechanically to documentation-only or non-visual work.

If the user says only `continue`, `resume`, `proceed`, `tiếp tục`, `làm tiếp`, `đọc repo rồi tiếp tục`, or equivalent while UI modernization is active:

1. If on `main`, fetch `origin`, confirm and switch to `ui-modernization`, then re-read continuity files.
2. Read `CURRENT.md` and `TRACKER.md`.
3. Inspect Git status, diff, branch, and commit.
4. Resume the recorded `IN_PROGRESS` task, or take the first eligible `READY` task.
5. If Git and tracking disagree, reconcile Git history, the diff, `WORKLOG.md`, and `TRACKER.md`; report the inconsistency before destructive action.

An explicit current user request always takes precedence over automatic continuation. Do not redirect unrelated work into UI modernization.

## Verification

Validation is change-aware, risk-based, and Actions-budget-aware.

Run the smallest sufficient verification for the current diff. Do not rerun an
already-passing suite when its covered behavior and all relevant shared or
transitive dependencies remain unchanged and the prior PASS evidence is still
applicable.

Increase scope when changes affect shared infrastructure, authorization,
schema/RLS/RPC behavior, dependencies, runtime configuration, common
components, or other cross-cutting contracts. When blast radius is uncertain,
inspect first rather than mechanically choosing the largest suite.

For validation reports, distinguish explicitly between:

- `RUN AND PASS` — executed against the current relevant change;
- `REUSED PRIOR PASS — UNCHANGED IMPACT` — not rerun because prior evidence
  remains applicable;
- `NOT RUN — NOT REQUIRED FOR CURRENT IMPACT` — outside the verified blast
  radius.

Full E2E is a major-integration/release gate, not the default check for every
commit. Run it only for a release candidate, major integration, broad
cross-cutting change, unresolved impact uncertainty, or explicit reviewer/user
request.

For local feedback, check formatting on touched files first. On a Windows
checkout that still contains CRLF from an older checkout, `--end-of-line auto`
may be used only for local touched-file style validation; GitHub-hosted CI and
the repository `.gitattributes` LF contract remain authoritative for committed
line endings.

```powershell
npx.cmd prettier --check <touched-files>
npm.cmd run check
```
