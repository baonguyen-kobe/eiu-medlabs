## Purpose

Prevents a delayed signing attempt from leaving an orphaned private signature
object after cleanup has taken ownership of its database operation.

## ADDED Requirements

### Requirement: Cleanup-owned upload compensation is exact and safe

The system SHALL remove only the exact validated private signature object created
by the current signing attempt when finalization rejects that operation as
cleanup-owned. It MUST NOT delete an existing object after a conflict or delete
for ambiguous, generic, invalid-path, or already-adopted outcomes.

#### Scenario: Late upload is blocked by cleanup ownership

- **WHEN** the current signing attempt successfully creates its exact private object and finalization reports cleanup ownership
- **THEN** the system deletes that exact object once and reports the finalization failure

#### Scenario: Existing object conflict is not owned by this attempt

- **WHEN** upload reports a conflict because the exact object already exists
- **THEN** the system does not delete that object
