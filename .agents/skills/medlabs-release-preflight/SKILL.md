---
name: medlabs-release-preflight
description: Release-only MedLabs preflight and production-verification procedure. Always delegates policy to docs/RELEASE.md and cannot deploy or mutate production without explicit current authorization.
---

# MedLabs Release Preflight

## Authority

Read `docs/RELEASE.md` first.

`docs/RELEASE.md` is authoritative.

This skill is procedural only and must not copy, redefine, weaken, or supersede
that policy.

## Preflight

Establish:

1. exact reviewed release SHA;
2. applicable CI evidence;
3. integration and `main` state;
4. clean canonical checkout;
5. `HEAD == origin/main`;
6. exact database migration delta;
7. whether production database mutation is required.
8. actual remote migration history and dry-run pending set;
9. whether previously unapplied migrations exist in production.

### Actual pending migration set

Always query the live linked project before pushing migrations.
Do not assume a release contains only one migration.
Surface any debt or pre-existing pending migrations before mutation.

### Partial migration handling

If a multi-migration push partially applies:

- the newly applied remote versions are authoritative immediately;
- never roll back successful migrations automatically;
- never use migration repair to disguise the remote history;
- recalculate the remaining pending set and continue only after the root cause is resolved.

### Pre-launch test data fast path

When the user/Reviewer explicitly confirms the environment is pre-launch:

- inspect blocking row counts and foreign keys;
- perform scoped, transactionally asserted deletion when explicitly authorized;
- do not build complex archival/compatibility bridges for disposable test data;
- this path is strictly invalid after real go-live.

## Authorization gates

A merge to `main` does not authorize production deployment.

Production application deployment requires explicit current authorization.

Production database mutation requires separate explicit current authorization.

If a database migration delta exists without database authorization:

STOP before database mutation.

## Production path

When application production deployment is explicitly authorized, use the
repository-controlled release path defined by `docs/RELEASE.md`, currently
`scripts/deploy-production.ps1`.

Do not replace it with a generic Vercel deployment skill.

### Deployment hang recovery

If the deployment wrapper appears hung:

1. Never initiate a second concurrent deployment.
2. Query `/api/version` with no-cache headers.
3. Check Vercel deployment metadata read-only.
4. If target SHA is live, classify as wrapper hang after success; terminate only the hung process tree.
5. Proceed directly to verification.

## Verification

After an authorized deployment, verify production using live evidence,
including the exact deployed application SHA through `/api/version` and the
required production smoke evidence.

### Interactive production credentials

If automated smoke credentials (`PRODUCTION_ADMIN_PASSWORD`) are not present in the environment:

- open the production login page in a visible browser window;
- pause for user to complete login directly;
- reuse the authenticated session for smoke testing;
- never log, store, or write the password into files or commands.
  Repository history alone does not prove production state.
