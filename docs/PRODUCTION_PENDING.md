# Production Pending Ledger

Last updated: 2026-09-04

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

`a92c2574dd0ac634381ce183139462cc9ba2186e`

Production version endpoint:

`https://medlabs-calendar.vercel.app/api/version`

Production milestone tag:

`production-2026-09-04`

GitHub Release:

`Production Release — 2026-09-04`

### Database

Production Supabase project ref:

`bwhiivfhezoozrzvchmm`

Total confirmed remote migrations: 127

Last confirmed production migration:

`20260903120000_preserve_historical_equipment_responsible_lecturer.sql`

Applied catch-up migrations in the 2026-09-04 release:

- `20260819140000_consolidated_skills_class_edit_and_equipment_lock.sql` (PR #62)
- `20260819231500_post_pr62_cancellation_and_claim_hardening.sql` (PR #64)
- `20260820180000_staff_shifts_v2_redesign.sql` (PR #68)
- `20260821100000_staff_shift_canonical_write_windows.sql` (PR #70)
- `20260822110000_basic_medical_equipment_request_wave_1.sql` (PR #73)
- `20260822130000_basic_medical_equipment_request_blockers.sql` (PR #73)
- `20260822140000_equipment_request_skills_compatibility.sql` (PR #73)
- `20260822150000_equipment_request_create_outbox_compatibility.sql` (PR #73)
- `20260823110000_basic_medical_equipment_request_edit.sql` (PR #77)
- `20260823120000_basic_medical_equipment_request_email.sql` (PR #77)
- `20260823121000_restore_email_outbox_deleted_recipient_guard.sql` (PR #77)
- `20260823203000_equipment_request_cancelled_terminal_guard.sql` (PR #78)
- `20260824090000_phase3b_operational_notifications_audit.sql` (PR #79)
- `20260824110000_preserve_lecturer_order_and_equipment_commercial_name_guard.sql` (PR #79)
- `20260824120000_basic_medical_condition_adjustment_notifications.sql` (PR #79)
- `20260903120000_preserve_historical_equipment_responsible_lecturer.sql` (PR #86)

No claim in this ledger should be read as a substitute for a live-production query.

## 2. Database migrations currently pending production

None. All reviewed migrations through `20260903120000` are confirmed applied on production.

Local migration history in `main` matches remote production migration history.

## 3. Application changes merged or authorized but not yet deployed

None. Production application is confirmed live at `a92c2574dd0ac634381ce183139462cc9ba2186e`.

Included deployed changes:

- PR #62 — Skills class edit / equipment lock / related Basic Medical changes
- PR #63 — self-hosted CI routing
- PR #64 — cancellation authorization / claim lock / lecturer display hardening
- PR #65 — self-hosted forgot-password E2E stabilization
- PR #66 — guarded PR62/PR64 production migration rail
- PR #67 — production pending ledger documentation
- PR #68 — Staff Shift V2 redesign
- PR #70 — Staff Shift roster/registration UI and canonical write windows
- PR #73 — Basic Medical Equipment Request Wave 1 foundation
- PR #77 — Basic Medical Equipment Request Wave 2 workspace, forms, and emails
- PR #78 — Unified equipment operations phase 3 and cancelled terminal guard
- PR #79 — Phase 3b operational notifications and audit
- PR #86 — Historical Nursing Skills responsible lecturer update behavior

## 4. Current production blocker / release-rail status

No active release blockers. Production release completed on 2026-09-04.

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
- migration purpose
- dependencies on earlier migrations
- destructive DDL, if any
- data backfill/mutation, if any
- explicit fail-closed/preflight assumptions
- security/RLS/function/trigger effects

### If the PR changes application behavior without a migration

Record it under:

`Application changes merged or authorized but not yet deployed`

### When an authorized release occurs

Update this document to record the newly confirmed production state and clear
the deployed items.
