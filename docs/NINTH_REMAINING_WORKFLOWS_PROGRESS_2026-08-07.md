# Checkpoint status

Starting HEAD: `e3f752b021d24a9c161761ab22e6353e60986082`
Current local baseline HEAD: `e54ecbdf3a09abeb2c19cbfc98443b3ff40a5966`
Branch: `review/hardening-20260805`

## Completed in this checkpoint

- **EMAIL-MEDIUM-01 FIXED**: Finalized email notification matrix & settings.
- **SHIFT-MEDIUM-01 FIXED**: Shift pattern hard delete & history preservation (`20260807210011_fix_shift_pattern_hard_delete.sql`).
- **N-MEDIUM-01 FIXED**: Added real Personnel crash-window reconciliation integration test in `tests/e2e/personnel-management.spec.ts`.
- **N-HIGH-01 FIXED**: `guard_basic_medical_linked_schedule_mutation` trigger correctly protects Basic Medical links.
- **N-MEDIUM-02 FIXED**: `claim_personnel_reconciliation_batch` handles worker concurrency.
- **CP2 (Hard Delete architecture) FIXED**: `can_hard_delete` RPC added and applied via RESTRICT policies.
- **CP3 (Equipment request edit/triggers) FIXED**: Equipment request status and triggers applied.
- **CP4 (Schedule Import RPC) FIXED**: Manual schedule RPC and related schema rules added.

## Partially completed

- **EMAIL-MEDIUM-02 (PARTIAL)**:
  - **Completed**: Equipment Request non-destructive transactional outbox (`public.email_outbox_events`, PL/pgSQL outbox functions in `20260807220000_equipment_request_transactional_outbox.sql`, 5 converted business RPCs, server action integration via `after()`, automatic recovery cron `/api/internal/email-recovery` at `15 * * * *` in `vercel.json`).
  - **Still Deferred**:
    - TB-06 destructive Equipment Request lifecycle outbox/deletion reconciliation.
    - Skills Lab transactional outbox.
    - Basic Medical transactional outbox.
    - Equipment Import null-email safety housekeeping (`profile.email?.trim()`).

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
- `20260807210010_fix_service_role_test_setup.sql`
- `20260807210011_fix_shift_pattern_hard_delete.sql`
- `20260807220000_equipment_request_transactional_outbox.sql`

## Tests run and passed

- `npx supabase test db supabase/tests/equipment_outbox.test.sql`: 15/15 PASS.
- `npm run test`: 68/68 PASS.
- `npx playwright test tests/e2e/equipment-request-management.spec.ts`: 1/1 PASS.
- `npm run test:e2e:critical`: 22/22 PASS.
- `npm run typecheck`: PASS.
- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npx supabase db lint --local --level error`: PASS.

## Open findings & deferred work

- TB-06 destructive Equipment Request outbox.
- Skills Lab transactional outbox.
- Basic Medical transactional outbox.
- Housekeeping: `app/equipment/import/actions.ts` null email safety.
