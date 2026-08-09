## 1. Database lifecycle contract

- [x] 1.1 Add the reservation lease migration and declarative schema parity.
- [x] 1.2 Renew the lease on reuse and evaluate pending cleanup against it.
- [x] 1.3 Fence adoption to pending operations with no cleanup ownership.
- [x] 1.4 Add pgTAP lifecycle regression coverage and update its exact plan.

## 2. Server-side upload compensation

- [x] 2.1 Add validated exact-path private Storage deletion.
- [x] 2.2 Compensate only objects created by the current cleanup-owned signing attempt.
- [x] 2.3 Add focused Storage and signing-flow tests.

## 3. Verification

- [x] 3.1 Run focused checks, formatting, and static validation without local Supabase.
- [ ] 3.2 Verify lifecycle behavior in CI before any physical cleanup runner is considered.
