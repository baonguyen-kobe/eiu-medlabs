## Purpose

Defines compatible canonical staff-shift write windows and the approved
PeriodCalendar presentation without changing staff-shift authorization rules.

## ADDED Requirements

### Requirement: Canonical new staff-shift write windows

The system SHALL accept new Morning registrations only with values in the
07:30–11:30 window and new Afternoon registrations only with values in the
12:30–16:30 window, both on the 30-minute grid. The system MUST reject all
other values, including values outside the window and off-30-minute values,
with the existing slot-specific validation errors.

#### Scenario: Canonical Morning registration

- **WHEN** an authorized eligible user registers a Morning shift with 07:30 and
  11:30
- **THEN** the system creates the shift under the existing registration rules

#### Scenario: Retired or off-grid new value

- **WHEN** an authorized eligible user registers a shift using 07:00, 13:00,
  or a minute value other than 00 or 30
- **THEN** the system rejects the request without creating a shift

### Requirement: Legacy staff-shift compatibility on update

The system SHALL preserve persisted 07:00–11:00 Morning and 13:00–16:00
Afternoon pairs. An authorized update MAY retain the exact existing legacy
pair, but any changed legacy time MUST be replaced by values in that slot's
canonical window; all other changed legacy values MUST be rejected.

#### Scenario: Unchanged legacy pair

- **WHEN** an authorized user updates a persisted Morning 07:00–11:00 shift
  without changing its start or end time
- **THEN** the system preserves the legacy times under the existing update and
  audit behavior

#### Scenario: Changed legacy pair

- **WHEN** an authorized user changes a persisted legacy shift to a
  noncanonical pair
- **THEN** the system rejects the update without altering the stored shift

### Requirement: Staff-shift calendar family parity

The staff-shift roster SHALL use the approved PeriodCalendar family in week and
month views. Week view MUST show exactly Morning and Afternoon Lịch trực rows;
both views MUST use canonical day headers, cells, event-card hierarchy, and
subtle keyboard-accessible empty-slot registration affordances.

#### Scenario: Week roster presentation

- **WHEN** a user opens the roster in week view
- **THEN** the calendar presents two Lịch trực rows, Sáng and Chiều, without
  Lịch học, list, or additional navigation controls

#### Scenario: Authorized empty slot

- **WHEN** an authorized user focuses or hovers an eligible empty roster cell
- **THEN** the existing quick-registration action is available without becoming
  a permanent prominent dashed control

#### Scenario: Narrow week roster

- **WHEN** a user opens the week roster at a narrow viewport
- **THEN** the labelled week PeriodCalendar region itself scrolls horizontally,
  preserves the canonical seven-day minimum width and sticky period label, and
  does not make the document overflow horizontally
- **AND** the quick-registration action remains visible and tappable for
  touch or narrow layouts without requiring hover
