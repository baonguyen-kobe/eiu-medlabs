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

#### Scenario: Exact delete fails after a cleanup-owned finalize

- **WHEN** the current signing attempt created the object, finalization reports
  `EQUIPMENT_SIGNATURE_CLEANUP_OWNED`, and exact object deletion fails
- **THEN** the system requests service-role durable recovery by operation
  identity only, without changing cleanup ownership or accepting a caller path

#### Scenario: A marked terminal cleanup operation is retried

- **WHEN** a cleanup-owned operation marked for compensation is in `retry`,
  `deleted`, or `missing` and has no active request Storage reference
- **THEN** a future cleanup claim may reclaim it according to existing claim
  ownership rules

#### Scenario: Terminal acknowledgement fences newer compensation work

- **WHEN** a terminal `deleted` or `missing` ACK observes a marker that is
  newer than its validated `cleanup_claimed_at`
- **THEN** the ACK preserves that marker for a later cleanup claim; a marker
  that predates the current claim may be cleared by its terminal ACK
