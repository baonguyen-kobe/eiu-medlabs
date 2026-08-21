## Why

Staff-shift new writes still use the retired 07:00–11:00 and 13:00–16:00
windows, while its calendar shell only partially follows the approved Skills
PeriodCalendar. The approved half-hour windows and calendar family need one
compatible rollout that preserves persisted legacy shifts.

## What Changes

- Change staff-shift new registration and changed-time validation to the
  canonical Morning 07:30–11:30 and Afternoon 12:30–16:30 half-hour windows.
- Preserve historical 07:00–11:00 and 13:00–16:00 shift pairs without allowing
  them as new writes or changed legacy values.
- Replace the staff-shift week presentation with the Skills PeriodCalendar
  visual structure, including shared event cards and unobtrusive quick-add
  affordances, while retaining authorized domain actions.
- Align month cards and registration time controls with that same family.

## Capabilities

### New Capabilities

- `staff-shift-canonical-windows-calendar-parity`: Canonical staff-shift write
  windows, legacy compatibility, and approved calendar-family presentation.

### Modified Capabilities

- None.

## Impact

- Staff-shift registration UI, time-picker options, and user-facing validation
  messages.
- One forward-only Supabase migration, the current declarative schema mirror,
  and focused pgTAP coverage for the staff-shift RPCs.
- No change to authentication, authorization, RLS, external APIs, or production
  operations.
