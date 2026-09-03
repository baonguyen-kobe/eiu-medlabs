# MedLabs Release Policy

This document defines the durable release and production-verification policy for
MedLabs Calendar.

It is a policy, not a production-state ledger.

## Canonical release source

- Repository: `baonguyen-kobe/eiu-medlabs`
- Integration branch: `ui-modernization`
- Release/deployment branch: `main`
- Production application SHA must come from the exact reviewed `main` commit.

A merge into `ui-modernization` is not a production release.

A merge into `main` does not by itself prove that production has been updated.

## Release verification

Before an application release, verify at minimum:

1. the intended reviewed Git SHA;
2. applicable technical validation for the actual change blast radius;
3. a clean canonical checkout;
4. `HEAD == origin/main` for production deployment;
5. any database migration delta separately reviewed and authorized;
6. no production mutation is implied by documentation alone.

For major integration or release-candidate work, broader validation may be
required. Do not run broad suites mechanically when unchanged prior evidence
remains applicable.

## Application deployment

The repository's guarded production deployment path is
`scripts/deploy-production.ps1`.

The deployment process must preserve its safety gates, including canonical
`main`, clean-tree and exact-SHA checks.

The deployed application must expose the expected Git SHA through
`/api/version`.

Production state is accepted only after the deployed SHA is verified.

## Database release

Database production state is independent from application Git state.

Production database mutation requires separate explicit authorization and
review of the exact migration delta.

After an authorized migration operation, verify the actual remote Supabase
migration history and relevant production database state.

Do not infer applied migrations from filenames, commit history, or old
deployment documentation.

## Test economy

Validation is change-aware and risk-based.

Do not rerun an already-passing suite when its covered behavior and all relevant
shared dependencies remain unchanged and the prior PASS evidence is still
applicable.

Run the smallest sufficient validation set for the current diff.

Broaden validation when the diff changes shared infrastructure, authorization,
schema/RLS/RPC behavior, dependencies, runtime configuration, or other
cross-cutting contracts.

Full E2E is a major-integration/release gate, not the default validation for
every commit.

## Production truth

Production truth must be verified from the live system:

- exact deployed application SHA;
- actual remote migration history;
- relevant live database/configuration state;
- deployed integration configuration where applicable.

Historical production reports and old release ledgers are evidence only and
cannot override verified live state.
