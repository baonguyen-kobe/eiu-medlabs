---
name: medlabs-verification-gate
description: MedLabs change-aware completion and evidence gate. Select the smallest sufficient verification from actual diff and blast radius, permit prior PASS reuse only when impact is demonstrably unchanged, and never call an unexecuted check PASS.
---

# MedLabs Verification Gate

## Evidence labels

Every reported verification item must use exactly one of:

`RUN AND PASS`

`REUSED PRIOR PASS — UNCHANGED IMPACT`

`NOT RUN — NOT REQUIRED FOR CURRENT IMPACT`

A check not executed against the current change must never be labeled PASS.

## Required workflow

Follow this progression for all changes:

`IMPLEMENT`
→ `TARGETED VERIFY`
→ `PRE-PUSH HYGIENE`
→ `PUSH`
→ `CI`

## Mandatory pre-push hygiene

Before every push after tracked changes:

1. **Determine actual changed files** from Git status and diff.
2. **Run Prettier `--write`** on applicable CHANGED files only.
3. **Run Prettier `--check`** on the same changed files to confirm style.
4. **Run ESLint** on changed JS/TS files where applicable.
5. **Run `git diff --check`** to prevent whitespace and syntax conflicts.
6. **Run lightweight CHANGED/IMPACTED tests** covering the touched boundary.
7. **Inspect `git diff --stat` and `git status`** to ensure no unintended files or changes are staged.
8. **Only then permit commit and push.**

Pre-push hygiene rules:

- **Never use CI as the first formatter.** Format and check touched files locally before pushing.
- **Never globally modify unrelated files** to make a hotfix or targeted change pass formatting.
- **Global baseline debt must be classified separately** from task-owned changes.
- **Prior PASS may still be reused** only under the skill's existing unchanged impact rules.
- **An unexecuted check must never be called PASS.**

## Determine impact first

Before selecting verification:

1. inspect changed paths;
2. inspect the relevant behavioral and security blast radius;
3. inspect relevant shared/transitive dependencies;
4. use `scripts/ci-impact.mjs` where applicable;
5. broaden verification when impact remains uncertain.

## Prior PASS reuse

Prior PASS evidence may be reused only when all are true:

- the covered behavior is unchanged;
- relevant shared/transitive dependencies are unchanged;
- relevant runtime/dependency configuration is unchanged;
- the prior evidence remains applicable to the current exact state.

If these conditions cannot be demonstrated, do not reuse the evidence.

## Scope

Run the smallest sufficient verification.

Do not mechanically run Full E2E.

Full E2E is reserved for:

- release candidates;
- major integration;
- broad cross-cutting changes;
- unresolved impact uncertainty;
- explicit user/Reviewer request.

## Failure

Any required failing check blocks completion.

Never weaken:

- tests;
- types;
- lint;
- authorization;
- RLS;
- validation;
- security controls;

to make verification pass.

## Report

For every relevant verification item, state:

- one exact evidence label;
- what was or was not run;
- why that evidence remains sufficient.
