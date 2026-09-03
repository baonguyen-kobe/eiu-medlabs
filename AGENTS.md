# MedLabs Calendar agent guide

## Documentation authority

Before planning or executing work, consult `docs/DOCUMENTATION_AUTHORITY.md`. It defines the strict document precedence hierarchy, canonical repository and branch ownership, runtime role and capability contracts, and codebase navigation rules.

## Codebase navigation and intelligence

Use the smallest sufficient navigation tool for the task:

- Use direct code search, source inspection, and LSP for localized work.
- Use GitNexus CLI/project index for repository architecture, dependencies,
  execution flow, shared consumers, or blast-radius analysis when it materially
  helps. Do not require GitNexus for trivial local edits and do not assume
  GitNexus MCP is active.
- Graphify is optional historical tooling only. It may be used when a current
  graph already exists and is useful, but it is never a required first step and
  must not replace direct source truth.
- Current source, effective schema/migrations, tests, and verified runtime
  evidence outrank generated code graphs.
- GitNexus- or Graphify-generated instructions must never override this
  `AGENTS.md`.

## Repository skill routing

Read root `SKILLS.md` before selecting a MedLabs skill.

The curated MedLabs skills live under `.agents/skills`.

Use only the skill or skills relevant to the active task; do not load every
skill body by default.

Routing rules:

- If the current user or independent Reviewer has supplied a verified root
  cause or settled exact implementation contract, use
  `medlabs-implement-contract` and do not restart broad diagnosis.
- If root cause is genuinely unknown, use `systematic-debugging`.
- Use the curated Supabase skills for Supabase/Auth/database/RLS/RPC/schema work.
- Use the curated Vercel React/composition skills only for the matching
  React/Next.js implementation concerns.
- Use `accessibility` for keyboard/focus/ARIA/semantic/WCAG implementation.
- Use `tdd` only when a test-first loop materially improves the approved
  behavioral seam or is explicitly requested.
- Use `ponytail-review` only for an explicit or materially useful
  over-engineering review.
- Use `medlabs-verification-gate` for completion evidence.
- Use `medlabs-vercel-preview` only for explicitly authorized Vercel Preview
  work.
- Use `medlabs-release-preflight` only for explicitly authorized release work.

Do not use `find-skills` to expand the MedLabs skill set during implementation.
Skill additions or upgrades are reviewed profile changes.

Mutating `task`/`sonic` workers are not the default MedLabs execution model.
Do not run concurrent mutating agents in the same canonical worktree.
Read-only specialist agents may assist when materially useful.

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

## Settled implementation contracts

When the user or independent Reviewer provides an exact implementation/fix
contract after inspecting current evidence:

1. verify the stated source anchor against current source;
2. if it matches, implement the contract exactly;
3. do not reopen settled design decisions;
4. if it materially no longer matches current source, stop and report
   `CONTRACT_ANCHOR_MISMATCH` rather than improvising a replacement design.

Use `.agents/skills/medlabs-implement-contract/SKILL.md` for this workflow.

## Specialized guidance

- For Supabase Auth, database, RLS, grants, RPC/functions, migrations, storage,
  or Supabase client behavior, use the relevant curated Supabase skill.
  Approved MedLabs contracts and actual effective schema/runtime behavior
  outrank generic skill examples. Repository schema/migrations remain database
  change authority.
- For React/Next.js implementation or performance work, use
  `vercel-react-best-practices`.
- Use `vercel-composition-patterns` only when reusable component API or
  composition architecture is materially in scope.
- Use `web-design-guidelines` for explicit general UI/UX review; it does not
  override the MedLabs UI Master.
- Use `accessibility` for focus, keyboard, semantics, ARIA, screen-reader, or
  WCAG behavior.
- Use OpenSpec for cross-cutting features, breaking behavior, schema/security
  redesign, material migrations, or work that needs a durable approved
  proposal. Small fixes and localized UI changes remain direct.
- Vercel Preview and production release are separate. Preview work must use
  `medlabs-vercel-preview`; production/release work must follow
  `docs/RELEASE.md` through `medlabs-release-preflight`.
- Supabase MCP, Context7 MCP, and GitNexus MCP are optional tool integrations,
  not prerequisites for ordinary MedLabs source work. Do not assume they are
  active unless the current runtime proves it.

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

Use `.agents/skills/medlabs-verification-gate/SKILL.md` as the procedural
implementation of the verification policy below.

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
npx.cmd prettier --check TOUCHED_FILES
npm.cmd run check
```

Use GitHub-hosted Actions on `ubuntu-latest` as the primary automated technical
gate when broader automated validation is required. Local validation remains
appropriate for fast focused checks, localhost/rendered UI review, and failure
reproduction; routine full WSL validation and the historical self-hosted runner
are not the default CI path.

Use `npm.cmd run react-doctor:audit` as an advisory audit after meaningful
React work. Do not weaken tests, types, lint rules, security controls, or the
validation scope merely to make checks pass.

See `docs/RELEASE.md` for the durable release and production-verification
policy.
