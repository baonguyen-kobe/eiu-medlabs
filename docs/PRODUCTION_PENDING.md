# Production Pending Ledger

Last updated: 2026-08-23

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

No claim in this ledger should be read as a fresh live-production query after
that last-confirmed state.

## 2. Database migrations currently pending production

The following migrations are present in reviewed repository history after the
last confirmed production migration and are therefore production debt until a
future release audit proves otherwise.

- [ ] `20260819140000_consolidated_skills_class_edit_and_equipment_lock.sql`
  - Source: PR #62
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `af359cb1e0372c097974eaaa86a17b50346192a3`

- [ ] `20260819231500_post_pr62_cancellation_and_claim_hardening.sql`
  - Source: PR #64
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `0c20d83348500c1460eba3906e5cf4540e70e5d2`

- [ ] `20260820180000_staff_shifts_v2_redesign.sql`
  - Source: PR #68
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `a2d1ed0c3fca25c35f04190cc637b9515042ecc9`

- [ ] `20260821100000_staff_shift_canonical_write_windows.sql`
  - Source: PR #70
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `90ccd0685f0c360e809791b8635e6688d7394313`

- [ ] `20260822110000_basic_medical_equipment_request_wave_1.sql`
  - Source: PR #73
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `0e1de858eb2de385eb92d6d09c3a609ceae1e0ea`

- [ ] `20260822130000_basic_medical_equipment_request_blockers.sql`
  - Source: PR #73
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `eca61f123ddf5deb28372f61136244898f204dcb`

- [ ] `20260822140000_equipment_request_skills_compatibility.sql`
  - Source: PR #73
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `d8e39e2f1af0061e9ca135f13b694cc0188aeaf6`

- [ ] `20260822150000_equipment_request_create_outbox_compatibility.sql`
  - Source: PR #73
  - State: MERGED TO MAIN
  - Production: NOT CONFIRMED APPLIED
  - Reviewed blob: `c0a04e4a768005e119f7218adb4e4f5e6fde68d6`

- [ ] `20260823110000_basic_medical_equipment_request_edit.sql`
  - Source: PR #77
  - State at this ledger update: INCLUDED IN PR #77; MERGE AUTHORIZED
  - Production: NOT APPLIED
  - Reviewed blob: `8544ab1c5558177b581e12e3ac1fb33286ae5305`

- [ ] `20260823120000_basic_medical_equipment_request_email.sql`
  - Source: PR #77
  - State at this ledger update: INCLUDED IN PR #77; MERGE AUTHORIZED
  - Production: NOT APPLIED
  - Reviewed blob: `74e0c8431c8ee902eb14e57121667d0e1ff0ba2f`

- [ ] `20260823121000_restore_email_outbox_deleted_recipient_guard.sql`
  - Source: PR #77
  - State at this ledger update: INCLUDED IN PR #77; MERGE AUTHORIZED
  - Production: NOT APPLIED
  - Reviewed blob: `d74a60381c9444d7c8e71fc185bf5b3def56efda`

IMPORTANT:

This is a debt ledger, not proof of the remote migration table. At release
freeze, DO NOT trust this list alone. Recalculate the exact remote-vs-local
migration delta from the actual production project and the exact frozen release
SHA.

## 3. Application changes merged or authorized but not yet deployed

Last confirmed production app:

`b978f50e98276ecaed4cf4f5afe08bf17c39e56b`

Main before PR #77 merge:

`92a6fbaaa149b7c2dae28d38ffb42bcf7ef6ddc3`

PR #77 reviewed candidate head before this ledger-only correction:

`61131e0eb9abc8e7039d7f58ce658dc3b16814f6`

CI #328 attempt 2 on that exact candidate head: SUCCESS.

Known production-impacting application work not yet represented by the last
confirmed production app includes:

- PR #62 — Skills class edit / equipment lock / related Basic Medical changes
- PR #63 — self-hosted CI routing
- PR #64 — cancellation authorization / claim lock / lecturer display hardening
- PR #65 — self-hosted forgot-password E2E stabilization
- PR #66 — guarded PR62/PR64 production migration rail
- PR #67 — production pending ledger documentation
- PR #68 — Staff Shift V2 redesign
- PR #70 — Staff Shift roster/registration UI and canonical write windows
- PR #73 — Basic Medical Equipment Request Wave 1 foundation
- PR #77 — Basic Medical Equipment Request Wave 2: separate Y cơ sở workspace,
  create/edit/copy flow, domain-aware request email, and selector UX parity
  with Skills Lab

PRs #71, #72, #74, and #76 are CI/docs/tooling-only for this ledger purpose
and are intentionally not added as deployed-application production debt.
PR #75 remains frozen/unmerged and is not included.

NOTE:

This section is informational. Do not maintain a permanent assumption that any
recorded main or candidate SHA is the final release SHA. A future release audit
must freeze a new exact SHA and independently verify production.

## 4. Current production blocker / release-rail status

The last confirmed GitHub-hosted production migration workflow attempt was
blocked by:

`HOSTED_RUNNER_BUDGET_BLOCKED`

Observed production migration workflow:

`Production PR62 PR64 migrations`

Run:

`32343086453`

Attempts:

- attempt 1: runner not provisioned
- attempt 2: runner not provisioned

Both attempts failed BEFORE any workflow step executed.

Therefore, as last confirmed for that attempt:

- production Supabase mutation: NO
- production migration application: NO
- production deployment: NO

Do not rerun an old production workflow merely to test billing availability.
Do not use the old PR62/PR64 rail as a release allowlist for the now-expanded
migration set.

At the next release freeze, build/review the production rail against the exact
frozen main SHA and the actual remote migration history.

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
- repository/merge state
- production state
- reviewed blob when known

Do NOT create a production migration rail during active development.

### If the PR changes deployed application behavior

Add the PR under:

`Application changes merged or authorized but not yet deployed`

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
3. Verify full required CI on that exact SHA.
4. Query/read the actual production app version.
5. Read the actual production migration history.
6. Recalculate the exact pending migration set.
7. Compare the audit result with this ledger.
8. The actual audit wins if this ledger differs.
9. Only then create/review the final production migration rail.
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

The ledger exists to prevent forgotten production debt. It must never override
real production evidence.
