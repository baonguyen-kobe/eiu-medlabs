## 1. Discovery and contracts

- [x] 1.1 Inspect Personnel authority, Auth/session, audit, rate-limit, Room/Course, Equipment batch, domain, and test contracts.
- [x] 1.2 Establish provider-aware and domain-safe invariants.

## 2. Schema and authorization

- [x] 2.1 Add forward schema/migration support for forced password state and sanitized privileged password audit operations.
- [x] 2.2 Add Admin-only, all-or-nothing Room and Course batch RPCs with dependent-domain guards.
- [x] 2.3 Mirror the final database state in declarative schemas and verify grants, ownership, and search paths.

## 3. Password flows

- [x] 3.1 Implement server-only provider classification and individual Personnel reset with fail-closed compensation.
- [x] 3.2 Implement Root-only custom password change and sanitized error handling.
- [x] 3.3 Implement forced-password route enforcement and self-change completion flow.
- [x] 3.4 Implement non-enumerating Supabase recovery request and reset completion flows with scoped rate limiting.

## 4. Catalog batch management

- [x] 4.1 Add Room batch selection, edit, deactivate, and reactivate UX backed by the canonical RPC.
- [x] 4.2 Add Course batch selection, edit, deactivate, and reactivate UX backed by the canonical RPC.
- [x] 4.3 Route type-changing import paths through the same domain safety guard.

## 5. Tests and validation

- [x] 5.1 Add focused password/provider/authority/forced-change/recovery/audit regression coverage.
- [x] 5.2 Add Room/Course RPC, atomicity, FK/snapshot, and domain-guard regression coverage.
- [x] 5.3 Run clean local replay, DB tests, app tests, relevant E2E, critical E2E, and production-bundle smoke.

## 6. Review and delivery

- [ ] 6.1 Complete Sol High final security/integrity review and bounded corrections.
- [ ] 6.2 Commit, push feature branch, open one PR, and wait for CI.
