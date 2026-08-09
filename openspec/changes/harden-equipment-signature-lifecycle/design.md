## Context

See proposal.md and the lifecycle specifications. Existing cleanup eligibility
uses operation creation time, and finalization accepts pending rows without
requiring `cleanup_state = none`.

## Goals / Non-Goals

**Goals:**

- Make reservation ordering authoritative in PostgreSQL.
- Preserve the existing caller-controlled retention cutoffs.
- Compensate only a private Storage object provably created by the current
  server-side signing attempt.

**Non-Goals:**

- No scheduler, cron job, cleanup route, physical cleanup runner, or Base64
  migration.
- No broad retention-policy change or application wall-clock decision.

## Decisions

- Add nullable `last_reserved_at`, backfill it from `created_at`, then make it
  non-null with a database-time default. This preserves historical age; setting
  migration time would incorrectly defer old cleanup candidates.
- Reuse locks the existing pending/none row and refreshes its lease with
  `clock_timestamp()`. Cleanup evaluates the same lease field, so transaction
  ordering determines the winner without a client clock.
- Fence adoption both in the existing cleanup guard and in finalization with the
  stable `EQUIPMENT_SIGNATURE_CLEANUP_OWNED` error. The guard protects direct
  writes while the RPC gives the server action a deterministic handling point.
- Add a validated exact-path Storage delete companion to upload/download. The
  signing flow carries a `created` result from upload and compensates only on
  the cleanup-owned error; conflicts and ambiguous finalization remain intact.

- If that exact delete fails, record `cleanup_compensation_required_at` through
  a service-role, operation-id-only RPC. The marker preserves the existing
  cleanup ownership and is claimable only when that ownership permits it; it
  never adopts an operation or starts a physical cleanup runner.

## Risks / Trade-offs

- [Migration and schema drift] → update the corrective migration and declarative
  schema together, with pgTAP contract coverage.
- [A finalize error may follow a successful adoption] → compensation is limited
  to the explicit cleanup-owned stable error, not generic failures.
- [Storage delete scope] → validate request, phase, operation, and canonical
  path binding before one exact private-bucket delete.

- [Delete and marker both fail]: return a stable user-facing failure while
  retaining the residual double-failure for operational review; distributed
  Storage and database failures cannot be made impossible in this request.

## Migration Plan

1. Deploy the additive migration and declarative parity.
2. Run CI pgTAP and focused Storage tests before enabling any physical cleanup.
3. Roll back application use by reverting the corrective migration/application
   commits; no historical operation data requires destructive reversal.
