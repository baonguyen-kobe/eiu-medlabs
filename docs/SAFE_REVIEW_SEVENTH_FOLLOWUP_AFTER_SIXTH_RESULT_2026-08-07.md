# Safe Review Seventh Follow-up Result (After Sixth)

Date: 2026-08-07
Branch: review/hardening-20260805
PR: #1 (Draft)

## Scope completed

Implemented and verified the Seventh Follow-up items for Personnel saga hardening and Basic Medical workflow integrity, including required tests and local verification gates.

## Implemented changes

### Personnel

- Durable state-machine flow for personnel email/security updates in personnel_update_operations.
- Added previous_email, status lifecycle, auth_updated_at/committed_at/resolved_at, and reconciliation error tracking.
- Added mark_personnel_auth_updated and resolve_personnel_update_operation RPCs.
- Enforced Root-vs-Personnel-Manager authority split (Root can manage Personnel Manager, Root self-security immutable, self-security updates blocked).
- Added import-all reservation guard for omitted profiles with active operations.
- Added reconciliation endpoint and service-side reconciler for expired auth_updated/rollback_required operations.
- Improved cleanup fallback logging and reconciliation diagnostics.

### Basic Medical registrations

- Centralized view policy via private.can_view_basic_medical_registration.
- Restored visibility for Viewer and teaching lecturer on linked sessions.
- Revoked direct INSERT/UPDATE/DELETE for basic_medical_registrations and basic_medical_registration_sessions from authenticated.
- Added cancel_basic_medical_registration RPC and soft-cancel lifecycle columns.
- Preserved session/schedule history while cancelling future schedules and invalidating confirmations.
- Updated registration list/completion views to exclude cancelled registrations by default.

### Basic Medical equipment

- Added server-side search/filter RPC for inventory, rooms, damaged, logs with paging.
- Added server-side catalog candidate search to remove hidden 500-row candidate ceiling.
- Added scoped export authorization via get_basic_medical_authority_context and paged full export reads.
- Added atomic apply_basic_medical_catalog_import RPC.
- Added audit_basic_medical_equipment_export RPC.
- Backfilled registration code date prefix by created_at in Asia/Ho_Chi_Minh timezone.

## Required local validation

- Node tests: PASS (63/63)
  - Command: npm run test -- tests/seventh-followup.test.mjs
- Database tests: PASS (49/49)
  - Command: npx supabase test db --local
- Seventh-specific pgTAP file: PASS (15/15)
  - Command: npm run test:db -- --local supabase/tests/seventh_followup.sql

## Files changed (major)

- supabase/migrations/20260807003035_seventh_followup_personnel_and_basic_medical.sql
- supabase/schemas/07_seventh_followup_personnel_and_basic_medical.sql
- supabase/tests/seventh_followup.sql
- lib/personnel-reconciliation.ts
- app/api/internal/personnel-reconciliation/route.ts
- app/admin/actions.ts
- app/basic-medical/registrations/actions.ts
- app/basic-medical/equipment/actions.ts
- app/basic-medical/equipment/page.tsx
- app/api/basic-medical-equipment-export/route.ts
- components/basic-medical-equipment-manager.tsx
- tests/seventh-followup.test.mjs
- tests/sixth-followup.test.mjs
- tests/local-supabase.test.mjs

## Finding status

- P-HIGH-01 Root cannot manage Personnel Manager: FIXED
- P-HIGH-02 Durable crash window Auth vs DB commit: FIXED
- P-MEDIUM-01 Import-all omitted reserved profile race: FIXED
- P-MEDIUM-02 Cleanup fallback lock/reconciliation error handling: FIXED
- P-MEDIUM-03 Commit-success response must return syncable state: FIXED
- BM-HIGH-01 Viewer/teaching lecturer visibility regression: FIXED
- BM-HIGH-02 Direct DML bypass on registration/session tables: FIXED
- BM-HIGH-03 Hard delete lifecycle mismatch: FIXED
- BM-MEDIUM-01 Equipment read-only access for Y-scope roles: FIXED
- BM-MEDIUM-02 Server-side filter/search parity: FIXED
- BM-MEDIUM-03 Hidden 500-candidate cap in room allocation: FIXED
- BM-MEDIUM-04 Scoped export authorization and full export handling: FIXED
- BM-MEDIUM-05 Registration-code historical date backfill: FIXED
- BM-MEDIUM-06 Non-atomic equipment catalog import: FIXED

## Delivery metadata

- Implementation commit: PENDING
- Final HEAD: PENDING
- GitHub Actions run for final HEAD: PENDING
- Verify job: PENDING
