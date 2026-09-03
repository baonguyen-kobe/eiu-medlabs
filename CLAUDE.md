# MedLabs Calendar Claude guide

Read and follow `AGENTS.md` and `docs/DOCUMENTATION_AUTHORITY.md`. `AGENTS.md` is the authoritative repository instruction file, and `docs/DOCUMENTATION_AUTHORITY.md` defines document precedence.

- Use codebase navigation tools exactly as specified in `AGENTS.md`: direct code search and inspection for localized work, GitNexus for multi-file architecture/dependency/blast-radius analysis when useful, and Graphify as an optional query tool when a current graph exists.
- Read `NEXTJS_AGENTS.md` before changing Next.js behavior.
- Apply the specialized Supabase, React, UI design system (`docs/UI_DESIGN_SYSTEM_V2_MASTER.md`), or OpenSpec guidance named in `AGENTS.md` when relevant.
- Follow the UI modernization continuity system under `docs/ui-modernization/` (`CURRENT.md`, `TRACKER.md`, `DECISIONS.md`) for active UI tasks.
- Preserve unrelated work and follow `medlabs-verification-gate` for change-aware completion evidence; prior PASS evidence may be reused only when the relevant impact is demonstrably unchanged.
- `CLAUDE.md` is a thin entry point and must not introduce competing repository policy or secondary navigation requirements.
