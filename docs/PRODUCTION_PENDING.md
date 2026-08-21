# Production Pending Ledger

Last updated: 2026-08-21

> This document is an informational production-debt ledger only.
>
> It is NOT proof of live production state.
> It is NOT a migration allowlist.
> It is NOT authorization to deploy or mutate production.
>
> At release freeze, all production state must be independently recalculated
> from Git history, current main, live application version, and actual remote
> migration history.

## 1. Last confirmed production state

### Application

Last confirmed production app SHA:

`b978f50e98276ecaed4cf4f5afe08bf17c39e56b`

Production version endpoint:

`https://medlabs-calendar.vercel.app/api/version`

### Database

Production Supabase project ref:

`bwhiivfhezoozrzvchmm`

Last confirmed production migration:

`20260818170000_enforce_equipment_request_table_semester_authority.sql`

Last confirmed applied PR59 production migration set:

- `20260818104500_add_class_schedule_semester.sql`
- `20260818140000_secure_equipment_request_semester_authority.sql`
- `20260818160000_secure_equipment_import_semester_authority.sql`
- `20260818170000_enforce_equipment_request_table_semester_authority.sql`

## 2. Database migrations currently pending production

- [ ] `20260819140000_consolidated_skills_class_edit_and_equipment_lock.sql`
  - Source: PR #62
  - State: MERGED TO MAIN
  - Production: NOT APPLIED
  - Reviewed blob: `af359cb1e0372c097974eaaa86a17b50346192a3`

- [ ] `20260819231500_post_pr62_cancellation_and_claim_hardening.sql`
  - Source: PR #64
  - State: MERGED TO MAIN
  - Production: NOT APPLIED
  - Reviewed blob: `0c20d83348500c1460eba3906e5cf4540e70e5d2`

- [ ] `20260820180000_staff_shifts_v2_redesign.sql`
  - Source: PR #68
  - State: MERGED TO MAIN
  - Production: NOT APPLIED
  - Reviewed blob: `a2d1ed0c3fca25c35f04190cc637b9515042ecc9`

IMPORTANT:

These are the pending migrations known as of 2026-08-20.

Future feature PRs may add more migrations.

At release freeze, DO NOT trust this list alone.
Recalculate the exact remote-vs-local migration delta.

## 3. Application changes merged but not yet deployed

Last confirmed production app:

`b978f50e98276ecaed4cf4f5afe08bf17c39e56b`

Main at ledger initialization:

`ff11c2ef220a836d0dd73f04a27dea3c538546fc`

Known merged work not yet represented by the production app includes:

- PR #62 — Skills class edit / equipment lock / related Basic Medical changes
- PR #63 — self-hosted CI routing
- PR #64 — cancellation authorization / claim lock / lecturer display hardening
- PR #65 — self-hosted forgot-password E2E stabilization
- PR #66 — guarded PR62/PR64 production migration rail
- PR #67 — production pending ledger documentation
- PR #68 — Staff Shift V2 redesign

NOTE:

This section is informational.

Do not maintain a permanent assumption that the initialization main SHA is the
final release SHA.

Future merged feature PRs that affect the deployed application should be added
to this section.

## 4. Current production blocker

GitHub-hosted Actions production migration workflow is currently blocked by:

`HOSTED_RUNNER_BUDGET_BLOCKED`

Observed production migration workflow:

`Production PR62 PR64 migrations`

Run:

`32343086453`

Attempts:

- attempt 1: runner not provisioned
- attempt 2: runner not provisioned

Both attempts failed BEFORE any workflow step executed.

Therefore, as last confirmed:

- production Supabase mutation: NO
- production migration application: NO
- production deployment: NO

Do not rerun this production workflow merely to test billing availability.

Current plan:

Wait for GitHub-hosted Actions quota/budget availability before the next
production release.

## 5. Explicitly frozen / deferred production items

### Frozen

PR #2 Equipment Signature migrations remain FROZEN.

The following migration versions must NOT be applied unless separately
reviewed and explicitly authorized:

- `20260809120000`
- `20260809130000`
- `20260809140000`
- `20260809150000`
- `20260809160000`
- `20260810000000`
- `20260810010000`
- `20260810020000`
- `20260810030000`

### Deferred

- `DIRECT_ANON_TABLE_GRANT` on
  `public.basic_medical_session_confirmations`
- Hosted Supabase Auth delete HTTP500 investigation

Do not silently include deferred/frozen work in a future release.

## 6. Rules for future feature PRs

For every future PR, determine whether it changes the production footprint.

### If the PR adds a database migration

Add the migration here under:

`Database migrations currently pending production`

Record:

- migration filename
- source PR
- merge state
- production state

Do NOT create a production migration rail during active development.

### If the PR changes deployed application behavior

Add the PR under:

`Application changes merged but not yet deployed`

### If the PR is only tests/docs/internal tooling

No ledger update is required unless it changes production release mechanics.

### Important workflow rule

Do NOT open a separate PR only to update this ledger after initialization.

Future ledger updates should normally be included in the SAME feature PR that
creates the production impact.

## 7. Release freeze procedure

When the user says:

`Chốt release`

or equivalent:

1. Freeze main.
2. Record exact final release candidate SHA.
3. Verify full CI on that exact SHA.
4. Query/read the actual production app version.
5. Read the actual production migration history.
6. Recalculate the exact pending migration set.
7. Compare the audit result with this ledger.
8. The actual audit wins if this ledger differs.
9. Only then create the final production migration rail.
10. Do not make an old production rail chase an actively changing main branch.

## 8. Required production order

For releases with DB changes:

1. Read-only production preflight
2. User authorizes DB mutation
3. Apply exact reviewed production migrations
4. Verify exact remote migration history
5. Verify DB contract/security postcheck
6. External review
7. User separately authorizes app deployment
8. Deploy exact frozen main SHA
9. Verify `/api/version`
10. Production smoke

Do NOT deploy a new application before required DB migrations are proven
successful.

## 9. Source of truth hierarchy

At release time use this priority:

1. Actual live production state
2. Actual Git/main state
3. Actual migration files/history
4. This ledger

The ledger exists to prevent forgotten production debt.

It must never override real production evidence.
