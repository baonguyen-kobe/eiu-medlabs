## Why

Personnel accounts currently lack provider-aware password administration, a forced-change safeguard after privileged resets, and a usable self-service recovery path. Administrators also need to update and activate/deactivate rooms and courses in batches without replacing entities or corrupting their domain history.

## What Changes

- Add server-verified, provider-aware individual Personnel password reset and Root-only custom password change flows with sanitized audit records.
- Add persistent forced-password-change state and route enforcement for password sessions after a privileged reset.
- Make password recovery functional through Supabase Auth while returning a non-enumerating public response.
- Add atomic Admin-only batch edit and active-state operations for rooms and courses, preserving IDs, foreign keys, and historical snapshots.
- Reject unsafe room-type changes that would cross existing Skills and Basic Medical domain contracts.

## Capabilities

### New Capabilities

- `personnel-password-security`: Provider-aware Personnel password administration, forced change, recovery, and sanitized audit behavior.
- `admin-room-course-batch-management`: Atomic, domain-safe batch editing and active-state management for rooms and courses.

### Modified Capabilities

- None.

## Impact

- Affected areas: Personnel administration, login/session routing, Supabase Auth admin API, profiles/security schema, audit logs, Admin Room/Course pages, and focused integration/E2E coverage.
- New forward-only database migration(s) and matching declarative schema state are required.
- No production deployment, Auth configuration change, email delivery, or frozen PR #2 change is included.
