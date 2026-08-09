## Why

An old pending equipment-signature operation can be reused without renewing its
cleanup age, allowing cleanup to claim it immediately after reservation. An
operation that has entered cleanup can also be adopted later, and a delayed
upload can leave an orphaned private object when that adoption is correctly
rejected. These races must be closed before any physical signature cleanup is
introduced.

## What Changes

- Add a database-managed reservation lease timestamp and use it for pending
  cleanup eligibility.
- Make cleanup ownership monotonic: only pending operations with no cleanup
  state may be adopted.
- Add a server-only exact-path Storage delete primitive and compensate only an
  object created by the current signing attempt when finalization is rejected as
  cleanup-owned.
- Add regression coverage for lease renewal, cleanup ownership, and safe upload
  compensation.

## Capabilities

### New Capabilities

- `equipment-signature-lifecycle`: Safe reservation leasing and irreversible
  cleanup ownership for equipment signature operations.
- `equipment-signature-upload-compensation`: Exact-path private Storage cleanup
  for a delayed upload blocked by cleanup ownership.

### Modified Capabilities

None.

## Impact

- Adds one corrective migration and matching declarative schema changes for
  `equipment_signature_operations` and its lifecycle RPCs.
- Affects authenticated lecturers/recipients signing equipment handover and
  return operations, plus the server-only Storage adapter.
- Does not add a scheduler, public cleanup API, physical cleanup runner, or
  change RLS/email/import behavior. Historical operations retain their original
  creation age through the migration backfill.
