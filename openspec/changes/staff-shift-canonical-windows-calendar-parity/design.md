## Context

The current staff-shift redesign establishes slot-level constraints and the
registration/update RPCs, but its windows are retired. See proposal.md for the
user-facing motivation. Existing persisted rows must stay valid while every
new write becomes canonical.

## Goals / Non-Goals

**Goals:**

- Enforce canonical new-write windows through the registration and update RPCs.
- Permit existing legacy pairs to survive and to remain unchanged on update.
- Reuse the Skills PeriodCalendar markup and event-card hierarchy for both
  staff-shift calendar variants.
- Keep staff-shift time-picker restrictions explicit and local.

**Non-Goals:**

- No rewrite of the original redesign migration, authorization rules, RLS,
  actions, realtime behavior, or generic TimePicker defaults.
- No local Supabase reset/start, production operation, or non-staff-shift UI
  redesign.

## Decisions

### 1. Use a forward-only compatibility envelope and RPC-level write rules

The table constraint will accept 30-minute values in the inclusive legacy/new
Morning envelope 07:00–11:30 and Afternoon envelope 12:30–16:30. The
registration RPC will require values inside the approved new-write windows on
the 30-minute grid. The update RPC will allow an unchanged retired legacy pair,
otherwise require values inside the canonical window. This prevents invalid
persisted data while failing closed for every changed value. Replacing the
original migration would break replay history and is excluded.

### 2. Keep canonical values in explicit staff-shift arrays

The staff roster passes only its slot arrays to TimePicker. The component's
untouched-baseline behavior continues to display a historical value until the
user changes it; generic TimePicker options remain unchanged. Deriving values
from generic hours would accidentally broaden another form's contract.

### 3. Render one staff-shift PeriodCalendar family

The roster retains its domain slot renderer but wraps events in the shared
`slot-events`, `slot-event`, and `slot-event-shift` hierarchy. The toolbar and
period grid live inside one calendar card. The week shows two period rows only;
month uses the same cells and cards with canonical today, Sunday, outside-month,
and overflow states. A dedicated table or permanent dashed quick-add button is
rejected because both diverge from the Skills reference.

The labelled period-calendar element is the horizontal viewport rather than a
wrapper around it. Its period grid keeps the shared seven-day minimum width and
sticky period label, while narrow and touch layouts reveal the otherwise subtle
Quick Add control.

## Risks / Trade-offs

- [Compatibility envelope could permit noncanonical direct writes] → direct
  table writes remain denied and both canonical RPCs validate exact new values.
- [Legacy UI values could be edited accidentally] → TimePicker treats an
  untouched invalid controlled baseline as displayable; any changed value is
  constrained to the explicit canonical array.
- [Migration has not been replayed locally] → pgTAP and migration replay remain
  serialized with CONTROL; no reset/start occurs in this worktree.

## Migration Plan

1. Add a forward migration that replaces only the staff-shift time checks and
   RPC definitions, then mirror it in the current declarative schema.
2. Run the focused pgTAP proof through the serialized local environment.
3. Deploy the forward migration normally; rollback is application rollback
   only, because the widened compatible table constraint is safe for existing
   rows and the previous RPC code would not be reintroduced by this change.
