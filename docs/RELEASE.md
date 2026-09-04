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

### Interactive production credentials

If automated production smoke credentials (e.g. `PRODUCTION_ADMIN_PASSWORD`) are absent in the environment and the user is available:

- open a headed, visible browser window to the production login page;
- pause and ask the user to enter credentials directly into the browser;
- reuse that authenticated browser session for the required smoke testing;
- never request, print, store, or log the password in shell history, logs, or environment files.

Missing environment credentials alone do not block a release when an interactive authenticated smoke session is available.

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

### Deployment hang recovery

If a deployment wrapper appears hung or stalls past normal build duration:

1. **Do not start a second deployment.**
2. Check the public `/api/version` endpoint with caching disabled.
3. Inspect Vercel deployment metadata read-only (e.g. `vercel ls --meta appGitSha=<targetSha>`).
4. If the target SHA is already live and ready, classify the situation as a deployment wrapper/tooling hang after success; do not redeploy.
5. Terminate only the exact hung process tree if necessary.
6. Proceed directly to post-deployment verification and smoke testing.

## Database release

Database production state is independent from application Git state.

Production database mutation requires separate explicit authorization and
review of the exact migration delta.

After an authorized migration operation, verify the actual remote Supabase
migration history and relevant production database state.

Do not infer applied migrations from filenames, commit history, or old
deployment documentation.

### Actual pending migration set wins

Before executing a production database push:

- read the actual remote migration history (`supabase migration list --linked`);
- run a dry-run push (`supabase db push --linked --dry-run`);
- calculate the exact current pending migration set;
- do not assume a requested feature has only one pending migration.

If previous unapplied production migrations or unrecorded debt exist, surface the exact pending set before mutation.

### Partial migration application

If a multi-migration push partially succeeds:

- the actual new remote history becomes authoritative immediately;
- do not attempt to roll back successfully applied forward migrations automatically;
- do not use migration repair to conceal or rewrite the remote migration history;
- recompute the remaining pending set and continue only after the root cause of the failed migration is resolved and authorized.

### Pre-launch test data fast path

Only when the user or Reviewer explicitly confirms that the system is in pre-launch status and the blocking data is disposable test/demo data:

1. Identify the legacy/history/data blocker.
2. Quickly inspect the actual row count, schema constraints, and foreign key dependencies.
3. Execute a scoped, asserted deletion or reset of the blocking test data inside a transaction when explicitly authorized.
4. Rerun the pending migration push.

Do not design permanent archival or compatibility bridges solely to preserve disposable test data.

This pre-launch exception must not silently remain valid after real production go-live.

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
