## 1. Canonical data contract

- [x] 1.1 Add one forward-only compatibility migration for staff-shift time
      constraints and canonical registration/update RPC validation.
- [x] 1.2 Mirror the effective constraint and RPC definitions in the current
      declarative schema.
- [x] 1.3 Extend focused pgTAP proof for canonical values, legacy survival,
      unchanged legacy updates, rejected changed legacy values, and auth coverage.

## 2. Calendar and registration parity

- [x] 2.1 Update staff-only TimePicker arrays, defaults, visible labels, and
      error messages to the approved windows.
- [x] 2.2 Align week and month roster markup with the Skills PeriodCalendar and
      shared event hierarchy while preserving staff-shift actions.
- [x] 2.3 Make quick add subtle but keyboard-accessible and retain the compact
      registration grid behavior, with the labelled calendar region as the
      narrow-viewport horizontal scroller.

## 3. Regression coverage and verification

- [x] 3.1 Update focused time-picker and staff-shift UI contract tests.
- [x] 3.2 Run formatting, lint, typecheck, focused UI/time-picker tests, and
      OpenSpec validation.
- [ ] 3.3 Run the focused pgTAP proof only after CONTROL serializes the shared
      local Supabase environment; record migration replay status.
