## Purpose

Provide secure, provider-aware Personnel password administration and self-service recovery without exposing privileged credentials or allowing forced-change bypasses.

## ADDED Requirements

### Requirement: Provider-aware password administration

The system SHALL classify a Personnel target from its actual Supabase Auth identity data. It SHALL allow password operations only for password-capable identities and SHALL reject Google-only targets without creating a password identity.

#### Scenario: Mixed provider identity remains password capable

- **WHEN** a target has both an email/password identity and a Google identity
- **THEN** password eligibility SHALL remain available subject to server-side Personnel authority.

### Requirement: Individual privileged reset

The system SHALL accept exactly one target user ID for a privileged reset, resolve the target email server-side, set the temporary password to that exact canonical email, mark the target as requiring a password change, and record a sanitized audit event.

#### Scenario: Unauthorized reset is denied

- **WHEN** an unauthorized actor invokes a reset action directly
- **THEN** the operation SHALL fail without changing Auth credentials or forced-change state.

### Requirement: Forced password change

The system SHALL prevent a password-authenticated user with `must_change_password` from accessing protected workspace routes until a successful self password change clears the state.

#### Scenario: Direct navigation is blocked

- **WHEN** a user requiring a password change requests a protected workspace route
- **THEN** the request SHALL be redirected to the forced-change route.

### Requirement: Non-enumerating password recovery

The system SHALL use a standard expiring password-recovery authorization and return the same neutral public response before identity verification regardless of account existence or provider.

#### Scenario: Google-only recovery request

- **WHEN** the submitted email belongs to a Google-only identity
- **THEN** the response SHALL remain generic and no password identity SHALL be created.

### Requirement: Password audit secrecy

The system SHALL record actor, target, action, timestamp, and safe result metadata for privileged password operations, but SHALL NOT persist or log passwords, recovery tokens, recovery URLs, or privileged credentials.

#### Scenario: Privileged reset audit is sanitized

- **WHEN** a privileged password reset completes or fails
- **THEN** its audit metadata SHALL identify the operation outcome without containing any password, token, URL secret, or credential.
