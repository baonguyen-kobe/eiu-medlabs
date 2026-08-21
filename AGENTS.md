# MedLabs Calendar agent guide

## Codebase navigation: Graphify first

The project knowledge graph lives in the ignored `graphify-out/` directory.

- Run Graphify commands from the repository root so its output stays at `graphify-out/`; do not run `graphify update .` from inside `graphify-out/`.
- In a fresh worktree, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-graphify-worktree.ps1` to verify repository instructions and skills, build the ignored local graph, and run a scoped query.
- For codebase questions, run `graphify query "<question>" --graph graphify-out/graph.json` first when `graphify-out/graph.json` exists.
- Use `graphify path "<A>" "<B>" --graph graphify-out/graph.json` for relationships and `graphify explain "<concept>" --graph graphify-out/graph.json` for focused concepts.
- Use `graphify-out/wiki/index.md` for broad navigation when available.
- Dirty graph files are expected and are not a reason to skip Graphify.
- Keep generated, temporary, backup, and tool-index files out of the graph via `.graphifyignore`.
- After modifying code or project instructions, run `graphify update .`.

## Repository skill discovery

Before planning implementation work, inspect `.agents/skills`, `.codex/skills`, and `.claude/skills` when they exist. Read each candidate `SKILL.md` front matter first, classify its relevance, then read and apply the full instructions only for relevant skills.

The repository-owned baseline skills live in `.agents/skills` and are tracked with the source. `.codex/` and `.claude/` remain available as optional tool-specific local integrations; do not copy generated local skills into a worktree or commit them as a provisioning substitute.

GitNexus is optional and is not currently configured in this checkout. Use it only when it is available and a large or high-risk refactor benefits from a second impact-analysis view. Do not require it for routine work, and do not let generated GitNexus instructions override this guide.

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

OpenSpec lifecycle:

1. `$openspec-propose` for a large change.
2. `$openspec-apply-change` after approval.
3. `$openspec-archive-change` after verification.

## Verification

Run the smallest relevant check first, then expand according to risk. Check formatting on touched files; the repository-wide Prettier baseline is tracked separately and must not trigger an unrelated bulk rewrite.

```powershell
npx.cmd prettier --check <touched-files>
npm.cmd run check
```

Use `npm.cmd run react-doctor:audit` as an advisory audit after meaningful React work. Do not weaken tests, types, lint rules, or security controls to make checks pass.
