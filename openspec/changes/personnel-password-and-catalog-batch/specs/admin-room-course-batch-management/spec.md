## Purpose

Allow Administrators to batch-manage rooms and courses atomically while preserving entity identity, foreign-key relationships, and domain history.

## ADDED Requirements

### Requirement: Atomic Admin batch management

The system SHALL provide Admin-authorized batch edit and active-state operations for rooms and courses. Every selected ID and proposed value SHALL be validated before an update, and invalid input SHALL leave all selected rows unchanged.

#### Scenario: One invalid selected row aborts a room batch

- **WHEN** a room batch contains a missing or invalid target
- **THEN** the operation SHALL fail without partially updating any room.

### Requirement: Entity and history preservation

The system SHALL update selected room and course metadata in place. It SHALL preserve entity IDs, existing foreign-key relationships, and historical schedule, registration, confirmation, and signature snapshots.

#### Scenario: Metadata edit preserves schedule reference

- **WHEN** a room or course with an existing schedule is batch edited
- **THEN** the schedule SHALL retain its original foreign-key ID and historical snapshot values.

### Requirement: Domain-safe room type changes

The system SHALL reject a requested room type change when current dependent entities would make the resulting Skills/Basic Medical domain relationship inconsistent.

#### Scenario: In-use cross-domain type change

- **WHEN** a selected room or course is used by a dependent record that requires its current domain
- **THEN** the operation SHALL fail with a safe validation message and shall not rewrite history.

### Requirement: No batch deletion

The batch interface SHALL expose edit, deactivate, and reactivate operations only. It SHALL NOT delete or recreate room or course entities.

#### Scenario: Batch toolbar omits destructive deletion

- **WHEN** an Administrator selects rooms or courses
- **THEN** the batch controls SHALL expose only edit and active-state operations.
