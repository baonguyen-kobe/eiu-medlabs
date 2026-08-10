# Safe Review Eighth Follow-up Result (After Seventh)

Date: 2026-08-07
Branch: review/hardening-20260805
PR: #1 (Draft)

## Implemented changes

### Personnel

- Reconciliation now scans expired `reserved` operations as well as the states
  already marked after Auth changes.
- `begin_personnel_update` no longer changes expired `reserved` operations to
  `expired` without comparing Auth and Profile state.
- Service resolver can resolve a `reserved` operation after reconciliation.
- Vercel Cron runs the protected reconciliation endpoint hourly. The endpoint
  returns inspected/resolved counters and logs manual-action-required events.

### Basic Medical registrations

- Added a transaction-local trigger guard that rejects direct `UPDATE` or
  `DELETE` of linked `class_schedules` with
  `BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED`.
- `save_basic_medical_registration` and
  `cancel_basic_medical_registration` set the guard flag in their transaction.
- Cancellation now invalidates confirmations only for schedules actually
  changed to `cancelled`; past completed-session confirmations are retained.
- UI and email terminology use `Hủy phiếu`; the UI explains that future
  schedules are cancelled while historical data remains.
- Registration list now supports `Chưa hoàn thành`, `Hoàn thành`, `Đã hủy`, and
  `Tất cả`, including cancellation timestamp and reason in the detail view.

### Basic Medical equipment

- Removed component-local query/filter/page state and `PaginationControls`.
  The URL plus `search_basic_medical_equipment` RPC now exclusively own
  filtering and paging.
- Equipment export fails explicitly when mandatory audit logging fails.

### Documentation and delivery

- Corrected Seventh delivery metadata and marked its two reopened findings
  `PARTIAL / REOPENED`.
- Added production reconciliation scheduler and Root manual-recovery runbook.

## Major files

- `supabase/migrations/20260807120000_eighth_followup_personnel_and_basic_medical.sql`
- `supabase/schemas/08_eighth_followup_personnel_and_basic_medical.sql`
- `supabase/tests/eighth_followup.sql`
- `lib/personnel-reconciliation.ts`
- `app/api/internal/personnel-reconciliation/route.ts`
- `app/basic-medical/registrations/actions.ts`
- `app/basic-medical/registrations/page.tsx`
- `components/basic-medical-registration-list.tsx`
- `components/basic-medical-equipment-manager.tsx`
- `app/api/basic-medical-equipment-export/route.ts`
- `vercel.json`

## Finding status

- P-HIGH-01: FIXED
- P-MEDIUM-01: FIXED
- BM-HIGH-01: FIXED
- BM-MEDIUM-01: FIXED
- BM-MEDIUM-02: FIXED
- BM-MEDIUM-03: FIXED
- BM-MEDIUM-04: FIXED
- DOC-MEDIUM-01: FIXED
- LOW export audit handling: FIXED

## Validation

- Focused TypeScript checks: PASS.
- GitHub Actions CI: PASS (`verify` completed successfully).

## Delivery metadata

- Implementation commit: `032418cac26808260475c8b373ced62874f85e93`
- Final implementation HEAD: `032418cac26808260475c8b373ced62874f85e93`
- GitHub Actions run: [31147729879](https://github.com/baonguyen-kobe/eiu-medlabs/actions/runs/31147729879) (`completed / success`)
- Verify job: [92770615748](https://github.com/baonguyen-kobe/eiu-medlabs/actions/runs/31147729879/job/92770615748) (`completed / success`)
