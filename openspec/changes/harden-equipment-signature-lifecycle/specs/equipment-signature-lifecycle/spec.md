## Purpose

Ensures equipment-signature reservation and cleanup transitions remain safe when
late client work overlaps with cleanup ownership.

## ADDED Requirements

### Requirement: Reservations renew cleanup eligibility

The system SHALL record a database-managed reservation timestamp for every
equipment-signature operation. Reusing a pending operation with no cleanup state
MUST renew that timestamp before the reservation is returned, while historical
operations retain their original age during migration.

#### Scenario: Reusing an old pending operation

- **WHEN** an authorized actor reserves an old pending operation that has no cleanup state
- **THEN** the system returns the same operation and path and advances its reservation timestamp

#### Scenario: Cleanup claims an untouched operation

- **WHEN** a pending operation with no cleanup state has not been re-reserved before the caller-supplied cutoff
- **THEN** cleanup may claim that operation using its reservation timestamp

### Requirement: Cleanup ownership is irreversible

The system SHALL allow adoption only from an operation that is pending and has
no cleanup state. An operation that has entered claimed, retry, deleted, or
missing cleanup state MUST reject adoption with a stable application-owned error.

#### Scenario: Cleanup owns an operation before finalization

- **WHEN** finalization is attempted for a pending operation in any cleanup-owned state
- **THEN** the request signature path remains unchanged and finalization returns the stable cleanup-owned error

#### Scenario: Normal pending operation finalizes

- **WHEN** finalization is attempted for a pending operation with no cleanup state
- **THEN** the system adopts the operation according to the existing signature workflow
