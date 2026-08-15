-- Declarative final state for the existing registration-list confirmation
-- embed. This is intentionally a column grant, not a table grant.
grant select (signer_name_snapshot)
on public.basic_medical_session_confirmations
to authenticated;
