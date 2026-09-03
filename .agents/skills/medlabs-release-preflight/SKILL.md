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

## Verification

After an authorized deployment, verify production using live evidence,
including the exact deployed application SHA through `/api/version` and the
required production smoke evidence.

Repository history alone does not prove production state.
