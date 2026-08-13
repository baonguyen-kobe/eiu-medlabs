## Context

The repository already centralizes Personnel authority in `get_personnel_authority_context` and Root verification in `private.is_root_administrator`. Supabase Auth administration must remain server-only. Rooms and courses already carry stable IDs and room-type domain relationships used by schedules and Basic Medical data.

## Goals / Non-Goals

**Goals:**

- Preserve the existing Personnel authority contract for every privileged password action.
- Make cross-system Auth and database transitions fail closed and auditable without retaining secrets.
- Keep Room/Course operations in-place and transactional across selected rows.

**Non-Goals:**

- No production deployment, production Auth configuration, or real recovery email.
- No batch password operation, replacement catalog entities, historical snapshot rewriting, or PR #2 work.

## Decisions

1. Store `must_change_password` in the existing profile security record, defaulting false. Use database RPCs for authority-sensitive state changes and audit writes.
2. Use the server-only Supabase admin client to inspect Auth identity data and mutate a single password-capable target. The client submits only the target user ID (or current user's new password); it never supplies the target email for reset selection.
3. Set forced-change state before attempting an Auth reset. If the Auth mutation fails, clear the pending state only through a controlled server-side compensation path; a successful temporary password can therefore never silently coexist with a false forced-change state.
4. Enforce forced change in the existing Next proxy/session boundary and re-check it in server-side protected actions/pages where applicable. The change-password and auth callback/logout routes are explicit allow paths.
5. Use Supabase recovery APIs with a local-safe redirect URL and neutral public response. Tests use local mail/recovery infrastructure only.
6. Reuse the existing `audit_logs` mechanism with action names and redacted metadata rather than creating a parallel audit model.
7. Implement Room/Course batch operations as a canonical transaction/RPC. The RPC verifies Admin authority, validates the complete selected set and proposed values, locks targets, rejects unsafe domain changes, then updates in place.

## Risks / Trade-offs

- Auth and database updates are not cross-system atomic. The reset flow makes the database security state fail closed first and records safe reconciliation metadata if compensation fails.
- Provider data varies by identity shape. Classification will derive from actual `identities`/provider fields, treating any email/password identity as password capable.
- Type changes can invalidate domain assumptions. The RPC checks current dependent schedules, registrations, and Basic Medical allocations before changing `room_type_id`.
- Password recovery can enumerate identities. Public output is invariant; no provider-specific result is returned before authentication.

## Migration Plan

Add only forward migrations after current history and mirror them in declarative schemas. No historical migration or frozen PR #2 migration is edited. Rollback is forward-only: preserve audit/history and correct behavior with a new migration if needed.
