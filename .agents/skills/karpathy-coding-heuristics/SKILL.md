---
name: karpathy-coding-heuristics
description: Apply four coding guardrails—think before coding, prefer the simplest sufficient solution, make surgical changes, and verify against explicit success criteria. Use for implementation, bug fixing, refactoring, review, and planning changes in MedLabs Calendar.
---

# Karpathy Coding Heuristics

Use these guardrails without adding ceremony to a small task.

## Before editing

1. Restate the requested outcome and observable success criteria.
2. Inspect the relevant code, tests, and current behavior before proposing a fix.
3. State assumptions that materially affect behavior. Ask only when a wrong assumption would be costly or irreversible.
4. Use the smallest sufficient navigation method:
   - use direct source inspection and LSP for localized work;
   - use GitNexus CLI/project index when architecture, dependency, execution-flow, shared-consumer, or blast-radius analysis materially helps;
   - Graphify is optional historical tooling and is never required for ordinary MedLabs work.

## While editing

1. Choose the simplest design that fully satisfies the request.
2. Keep the diff surgical: preserve unrelated behavior, style, and user changes.
3. Avoid speculative abstractions, compatibility layers, and cleanup outside scope.
4. If the modified area is already too large or tangled, extract only the boundary needed for the requested change; do not start a broad rewrite.
5. Prefer explicit names and direct control flow over clever compression.

## Verify the outcome

1. Test the behavior through the same surface the user will use when practical.
2. Use `medlabs-verification-gate` to select and report the applicable verification evidence.
3. Compare results with the original success criteria, not merely with compilation success.
4. Report what changed, what was verified, and any remaining limitation or assumption.

## Stop conditions

- Stop and ask before destructive operations or material scope expansion.
- Do not conceal a failing check by weakening tests, validation, types, lint rules, authorization, RLS, or security controls.
- Do not claim completion when the requested behavior lacks applicable verification evidence.
