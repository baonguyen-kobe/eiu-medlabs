# MedLabs Review Contract

This file defines the engineering review procedure for MedLabs Calendar.

It does not redefine product behavior, repository authority, or production
policy.

## Review source of truth

Review the actual work product, not the Executor narrative alone.

For every material review:

1. identify the exact branch and commit;
2. inspect the exact changed files and diff;
3. inspect relevant current source independently;
4. compare behavior against the applicable approved product/security contract;
5. inspect schema/RLS/RPC/migrations when database behavior is affected;
6. inspect regression coverage;
7. inspect verification evidence and labels;
8. detect unrelated scope expansion;
9. detect weakened validation, tests, types, authorization, RLS, or security;
10. verify release/production boundaries when relevant.

## Finding severity

### BLOCKER

Unsafe to integrate or release.

Examples:

- authorization/security regression;
- incorrect business behavior;
- destructive data risk;
- production action without authorization;
- required verification failure.

### REQUIRED

Must be corrected before the current task is accepted.

Examples:

- missing required regression coverage;
- incorrect implementation of the approved contract;
- material scope drift;
- verification claim unsupported by evidence.

### ADVISORY

Useful improvement outside the current acceptance requirement.

Do not convert advisory cleanup into required scope without explicit approval.

## Executor self-review

OMP `reviewer` and `security-reviewer` may provide supporting read-only review.

Their output does not replace independent review of the exact canonical work
product.

## Verification language

Use only:

- `RUN AND PASS`
- `REUSED PRIOR PASS — UNCHANGED IMPACT`
- `NOT RUN — NOT REQUIRED FOR CURRENT IMPACT`

Never label an unexecuted check PASS.

## Integration boundary

Executor completion is not integration approval.

Merge, release, production database mutation, and production deployment require
their own applicable authorization and gates.
