# MedLabs Orca/OMP Profile v4

`SKILLS.md` is the curated skill manifest and routing guide for MedLabs
Calendar.

It defines which skills should be used and when.

It is not a product-policy authority.

Product, security, implementation, UI, verification, and production truth are
resolved through `AGENTS.md`, `docs/DOCUMENTATION_AUTHORITY.md`, current source,
and `docs/RELEASE.md`.

## Core routing

| Situation | Skill |
| --- | --- |
| User/Reviewer supplied a verified root cause or settled exact implementation contract | `medlabs-implement-contract` |
| Root cause is genuinely unknown | `systematic-debugging` |
| Supabase Auth/client/platform behavior | `supabase` |
| SQL/PostgreSQL performance, indexes, locks, schema structure or migration design | `supabase-postgres-best-practices` |
| RLS, grants, authorization or privileged Supabase database behavior | `supabase` first; `supabase-postgres-best-practices` only as secondary advisory guidance |
| React/Next.js implementation or performance | `vercel-react-best-practices` |
| Reusable component API or composition architecture | `vercel-composition-patterns` |
| Explicit generic UI/UX review | `web-design-guidelines` |
| Keyboard, focus, semantic HTML, ARIA, screen-reader or WCAG behavior | `accessibility` |
| Test-first work where TDD materially improves a high-risk behavioral contract | `tdd` |
| Explicit check for unnecessary abstractions or over-engineering | `ponytail-review` |
| Vercel Preview explicitly authorized | `medlabs-vercel-preview` |
| Release/production work explicitly authorized | `medlabs-release-preflight` |
| Completion and verification reporting | `medlabs-verification-gate` |

## Authority boundaries

Skills guide implementation method. They do not redefine MedLabs behavior.

For desired behavior, implementation truth, and production truth, follow
`docs/DOCUMENTATION_AUTHORITY.md`.

For Next.js framework behavior, use `NEXTJS_AGENTS.md` and the documentation
bundled with the installed Next.js version before generic external guidance.

For Supabase, approved MedLabs business/security contracts and actual effective
schema/migrations/RLS/RPC behavior outrank generic skill recommendations.

Repository schema and migration files remain the database change authority.

Supabase skills must not automatically configure MCP or use a remote database
as an iterative write scratchpad. Production database mutation requires a
separately authorized release operation.

For visual behavior, `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` is the canonical UI
authority after business/security requirements.

For release and production, `docs/RELEASE.md` is authoritative.

## Profile inventory

### CORE

#### karpathy-coding-heuristics

- Source type: CUSTOM
- Path: `.agents/skills/karpathy-coding-heuristics`
- Purpose: simple, surgical, evidence-driven implementation.
- Do not use it to override a settled product contract.

#### medlabs-implement-contract

- Source type: CUSTOM
- Path: `.agents/skills/medlabs-implement-contract`
- Purpose: execute a settled Reviewer/user contract without reopening design.

#### medlabs-verification-gate

- Source type: CUSTOM
- Path: `.agents/skills/medlabs-verification-gate`
- Purpose: change-aware MedLabs completion evidence.

### TASK_TRIGGERED

#### systematic-debugging

- Source type: ADAPTED_FROM_UPSTREAM
- Upstream: `obra/superpowers`
- SHA: `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
- Upstream path: `skills/systematic-debugging`
- Local path: `.agents/skills/systematic-debugging`
- Use only when root cause is not already independently verified.
- Adaptations: settled-contract routing; MedLabs TDD routing; MedLabs verification gate.

#### supabase

- Source type: ADAPTED_FROM_UPSTREAM
- Upstream: `supabase/agent-skills`
- SHA: `8331f910845103c08d51f6ca1d86ebb7d1f745e3`
- Upstream path: `skills/supabase`
- Local path: `.agents/skills/supabase`
- Adaptations: MedLabs repository-first database writes; MCP is optional and is never auto-configured; no direct remote database scratchpad workflow.

#### supabase-postgres-best-practices

- Source type: ADAPTED_FROM_UPSTREAM
- Upstream: `supabase/agent-skills`
- SHA: `8331f910845103c08d51f6ca1d86ebb7d1f745e3`
- Upstream path: `skills/supabase-postgres-best-practices`
- Local path: `.agents/skills/supabase-postgres-best-practices`
- Adaptations: Supabase security guidance takes precedence for RLS/grants; UPDATE/FOR ALL policies require appropriate `USING` and `WITH CHECK`; generic privilege examples are advisory only.
- Advisory only; actual MedLabs contracts/schema/runtime outrank examples.

#### vercel-react-best-practices

- Source type: UPSTREAM_PINNED
- Upstream: `vercel-labs/agent-skills`
- SHA: `063bee94c3f4df8453406c830b0a7df0f2860278`
- Upstream path: `skills/react-best-practices`
- Local path: `.agents/skills/vercel-react-best-practices`

#### vercel-composition-patterns

- Source type: UPSTREAM_PINNED
- Upstream: `vercel-labs/agent-skills`
- SHA: `063bee94c3f4df8453406c830b0a7df0f2860278`
- Upstream path: `skills/composition-patterns`
- Local path: `.agents/skills/vercel-composition-patterns`

#### web-design-guidelines

- Source type: UPSTREAM_PINNED
- Upstream: `vercel-labs/agent-skills`
- SHA: `063bee94c3f4df8453406c830b0a7df0f2860278`
- Upstream path: `skills/web-design-guidelines`
- Local path: `.agents/skills/web-design-guidelines`
- Review guidance only; it does not replace the MedLabs UI Master.

#### accessibility

- Source type: UPSTREAM_PINNED
- Upstream: `affaan-m/ECC`
- SHA: `22e8cf01d0b54719b3a49002fab2ccbda4ff5b9e`
- Upstream path: `skills/accessibility`
- Local path: `.agents/skills/accessibility`

#### tdd

- Source type: ADAPTED_FROM_UPSTREAM
- Upstream: `mattpocock/skills`
- SHA: `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`
- Upstream path: `skills/engineering/tdd`
- Local path: `.agents/skills/tdd`
- Use on demand for high-risk behavioral seams, not ceremonially for every change.
- Adaptations: Reviewer-provided seams count as approved; no dependency on `codebase-design`; no dependency on `code-review`.

#### ponytail-review

- Source type: UPSTREAM_PINNED
- Upstream: `DietrichGebert/ponytail`
- SHA: `2ed6c52c9d7e5e56942508591085fd45dea277d3`
- Upstream path: `skills/ponytail-review`
- Local path: `.agents/skills/ponytail-review`
- One-shot over-engineering review only. Persistent Ponytail modes are not part of MedLabs.

### PREVIEW_ONLY

#### medlabs-vercel-preview

- Source type: CUSTOM
- Path: `.agents/skills/medlabs-vercel-preview`
- Never authorizes production.

### RELEASE_ONLY

#### medlabs-release-preflight

- Source type: CUSTOM
- Path: `.agents/skills/medlabs-release-preflight`
- Always delegates production policy to `docs/RELEASE.md`.

## Documentation/tool routing

Next.js:

`NEXTJS_AGENTS.md` → installed-version Next.js docs.

Supabase:

MedLabs contract/current implementation → curated Supabase skills → official
Supabase documentation/tools when needed.

Other third-party libraries:

Use current authoritative documentation when necessary. Context7 may be added
later as an optional documentation MCP; it is not required for Profile v4 Core.

GitNexus:

Use CLI/index only when architecture or blast-radius analysis materially helps.
Do not assume GitNexus MCP is active.

Graphify:

Optional historical tooling only. Never a mandatory first step.

## Verification

Use `medlabs-verification-gate`.

Valid labels are exactly:

- `RUN AND PASS`
- `REUSED PRIOR PASS — UNCHANGED IMPACT`
- `NOT RUN — NOT REQUIRED FOR CURRENT IMPACT`

Never call an unexecuted check PASS.
