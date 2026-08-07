# Checkpoint status

Starting HEAD: `e3f752b021d24a9c161761ab22e6353e60986082`
Current local HEAD before commit: `e3f752b021d24a9c161761ab22e6353e60986082`
Branch: `review/hardening-20260805`

## Completed in this checkpoint
- Fixed integration test 1055, 1717, 1904, 2046, 2236, 3151, 3445.
- Fixed `service_role` privileges on `equipment_requests` and `equipment_request_items` for full DML.
- Fixed `registrant_confirm_equipment_handoff` RPC signature and constraints.
- Added strict transition rules (`new` -> `handed_over` guard) in `manager_confirm_equipment_status`.
- Secured `equipment_request_items` INSERT RLS policy with explicit status-based lockdown for staff/admin.
- Refactored server actions (`app/equipment/actions.ts`, `app/schedule-entry/import/actions.ts`) to use secure RPCs instead of direct DML.
- Prevented CSV formula injection in API endpoints.
- Validated full test suite locally (35/35 passing).

## Partially completed
- `csv formula injection` handled in API endpoints, but might need further review across all exports.

## Not started / intentionally deferred
- Hard Delete authority logic (`can_hard_delete`, Root/Bảo limits).
- Equipment request full edit workflow refinement.
- Import schedule canonical RPC / schedule creation flow.
- Email queue / shift lifecycle.

## Current migrations
- `20260807200000_ninth_and_remaining_workflows_hardening.sql`
- `20260807210000_complete_hardening_phases_1_to_5.sql`
- `20260807210001_fix_signature_paths_in_functions.sql`
- `20260807210002_fix_equipment_request_items_delete_policy.sql`
- `20260807210003_relax_equipment_request_items_insert_policy.sql`
- `20260807210004_restore_equipment_request_items_insert_status.sql`
- `20260807210005_fix_equipment_request_items_scope.sql`
- `20260807210006_fix_deleted_request_email_trigger.sql`
- `20260807210007_fix_service_role_and_signature_rpc.sql`
- `20260807210008_fix_equipment_request_status_and_signature.sql`
- `20260807210009_fix_equipment_request_items_insert_lock.sql`

## Tests run
- test: `tests/local-supabase.test.mjs`
  result: 35/35 passing.
- test: `npm run check`
  result: Passed typechecks. Linting has 10 minor ignored warnings in `/scripts`.

## Known failures
- failure: None.
  caused by current diff: NO
  next action: N/A

## Open findings
- CP2: Hard delete authority (can_hard_delete, Root+Bảo, RESTRICT dependencies)
- CP3: Equipment request full edit workflow refinement
- CP4: Import schedule canonical RPC / schedule creation flow
- CP5: Email queue / shift lifecycle

## Exact next actions for next model
1. Begin implementation of CP2 (Hard Delete authority logic).
2. Continue with CP3 and CP4.
3. Finalize CP5 workflows.

## Working tree before commit
CLEAN (After this commit). Excluded diagnostic scripts: `scripts/patch*.mjs`, `scripts/check*.sql`, `scripts/check_rls*.mjs`, `scripts/refactor.mjs`, `scripts/fix_tests.cjs`, `scripts/patch_schedules.mjs`. Excluded `docs/SAFE_REVIEW_REMAINING_WORKFLOWS_CROSS_FLOW_2026-08-07(1).md` (duplicate).

## Background tasks
0 stale watchers remaining (will be cleaned up).
