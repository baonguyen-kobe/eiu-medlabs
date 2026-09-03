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
