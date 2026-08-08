# Checkpoint status

Starting HEAD: `e3f752b021d24a9c161761ab22e6353e60986082`
Current green baseline HEAD: `192300d50d789eff6ba1ff5e47080729eb6d1cd7`
Branch: `review/hardening-20260805`
Latest verified CI: Run #36 — SUCCESS

## Completed in this checkpoint

- **TB-06 Destructive Equipment Lifecycle FIXED**:
  - Soft-cancellation enforced for ordinary Admin/Staff (`soft_cancel_equipment_request`).
  - Pre-delete transactional outbox snapshot for Root/Bảo hard delete (`hard_delete_equipment_request`).
  - Exactly-once TB-06 outbox deduplication via `equipment_request:<request_id>:deleted`.
  - Direct physical `DELETE FROM equipment_requests` table bypass closed for authenticated users.
- **EMAIL-MEDIUM-01 FIXED**: Finalized email notification matrix & settings.
- **SHIFT-MEDIUM-01 FIXED**: Shift pattern hard delete & history preservation (`20260807210011_fix_shift_pattern_hard_delete.sql`).
- **N-MEDIUM-01 FIXED**: Added real Personnel crash-window reconciliation integration test in `tests/e2e/personnel-management.spec.ts`.
- **N-HIGH-01 FIXED**: `guard_basic_medical_linked_schedule_mutation` trigger correctly protects Basic Medical links.
- **N-MEDIUM-02 FIXED**: `claim_personnel_reconciliation_batch` handles worker concurrency.
- **CP2 (Hard Delete architecture) FIXED**: `can_hard_delete` RPC added and applied via RESTRICT policies.
- **CP3 (Equipment request edit/triggers) FIXED**: Equipment request status and triggers applied.
- **CP4 (Schedule Import RPC) FIXED**: Manual schedule RPC and related schema rules added.
- **EMAIL-MEDIUM-02 CLOSED / GREEN**:
  - Equipment Request non-destructive and destructive TB-06 transactional outbox (`20260807220000_equipment_request_transactional_outbox.sql` & `20260808090000_equipment_request_tb06_outbox.sql`).
  - Skills Lab transactional outbox SL-01 through SL-05 (`20260808120000_skills_lab_transactional_outbox.sql`, `delete_skills_lab_class_schedule`, pre-delete snapshot, closed direct physical DELETE bypass).
  - Basic Medical Checkpoint A transactional outbox (`20260809090000_basic_medical_transactional_outbox.sql` for YC-P01 create/copy, YC-P02 adjust, YC-P03 cancel, YC-E01 damage report).
  - Basic Medical Checkpoint B transactional outbox (`20260809100000_basic_medical_schedule_outbox.sql` for YC-L04 full schedule edit, YC-L05 schedule cancellation).
- **Equipment Import null-email safety CLOSED / GREEN**:
  - Profile type typed `email: string | null` in `app/equipment/import/actions.ts`.
  - `profileByEmail` & `lecturerByEmail` exclude null/blank email without creating `"null"` keys.
  - `profileByName` & `lecturerByName` retain null-email profiles for name matching.
  - Registrant profile with null email produces clean validation error (`"Người đăng ký chưa có email trong hồ sơ Nhân sự"`).
  - Commit: `192300d50d789eff6ba1ff5e47080729eb6d1cd7`.
- **Equipment signature Storage orphan finding CLOSED — STALE / NOT APPLICABLE**:
  - **Audit result**: Current UI captures PNG signature as `data:image/png;base64,...`. Server action `confirmEquipmentRequestHandoff` passes base64 Data URL to `registrant_confirm_equipment_handoff` RPC which persists it directly into `handover_signature_path` and `return_signature_path` text columns of `public.equipment_requests`.
  - The `equipment_signatures` bucket exists in `storage.buckets`, but zero application actions/RPCs upload, read, or delete objects there (0 objects in `storage.objects`).
  - Hard delete (`hard_delete_equipment_request`) removes the `equipment_requests` row, physically deleting the Base64 signature text with the row. Status rewind (`manager_confirm_equipment_status`) sets the signature text column to `NULL`. No Storage orphan is produced.
  - **Architecture note**: The `*_signature_path` column names and unused `equipment_signatures` bucket reflect architecture drift from a previously intended Storage-backed design. This drift is not a production defect requiring migration.
  - **Future consideration**: If Storage-backed signatures are ever introduced, object-path/request ownership policies on `storage.objects` should be tightened beyond simple owner equality.

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
- `20260808090000_equipment_request_tb06_outbox.sql`
- `20260808090001_fix_equipment_scope_trigger_delete.sql`
- `20260808120000_skills_lab_transactional_outbox.sql`
- `20260809090000_basic_medical_transactional_outbox.sql`
- `20260809100000_basic_medical_schedule_outbox.sql`

## Tests run and passed

- `npm run test`: 70/70 PASS (0 failed, 0 skipped).
- `npm run test:db`: 11 files, 224/224 assertions PASS.
- `npm run test:e2e:critical`: 22/22 PASS.
- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npx supabase db lint --local --level error`: PASS.
- Latest GitHub CI: Run #36 SUCCESS.

## Open findings & deferred work

- None remaining in this hardening milestone.
