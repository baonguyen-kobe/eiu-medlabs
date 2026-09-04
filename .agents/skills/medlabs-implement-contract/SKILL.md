---
name: medlabs-implement-contract
description: Execute a settled MedLabs implementation or fix contract when the user or independent Reviewer has already supplied a verified finding, root cause, immutable behavior, exact replacement, or exact regression contract. Verify the source anchor, then implement exactly without reopening settled design.
---

# MedLabs Implement Contract

## Authority

Before editing, obey:

1. the explicit current user instruction;
2. `AGENTS.md`;
3. `docs/DOCUMENTATION_AUTHORITY.md`;
4. the approved scoped business/security/product contract;
5. current implementation truth.

This skill controls implementation method only. It does not redefine product
behavior.

## Settled-contract rule

When the user or independent Reviewer has already supplied a verified:

- finding;
- root cause;
- immutable decision;
- required behavior;
- exact code condition;
- exact SQL/RLS semantics;
- exact selector;
- exact replacement;
- regression contract;

treat that decision as settled.

Do not redesign it.
Do not replace it with a preferred architecture.
Do not restart broad diagnosis merely because debugging tools are available.

## Anchor verification

Before editing:

1. verify the repository and branch;
2. inspect the exact relevant current source;
3. verify that the supplied finding/contract still matches current source;
4. inspect only the minimum relevant neighboring source/tests needed to confirm
   the contract remains applicable.

If current source materially contradicts the supplied contract:

STOP.

Report:

CONTRACT_ANCHOR_MISMATCH

and include:

- exact file;
- exact contradictory current behavior;
- why the supplied contract can no longer be applied safely.

Do not improvise a replacement design.

## Implementation

When the anchor matches:

- implement the prescribed behavior exactly;
- keep the diff surgical;
- preserve unrelated behavior and user work;
- add no speculative compatibility layer;
- add no architecture beyond what the contract requires;
- do not perform broad cleanup;
- do not weaken tests, types, lint, authorization, RLS, validation, or security;
- do not change database/release behavior outside explicit scope.

## Regression evidence

Add or update only the regression evidence required by the contract.

Tests must protect observable behavior, not implementation text.

## Completion

Use `medlabs-verification-gate`.

Do not commit, push, merge, deploy, or mutate production unless the active task
explicitly authorizes that specific action.
