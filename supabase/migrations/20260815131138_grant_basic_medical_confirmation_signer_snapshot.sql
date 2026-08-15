-- Restore the one display-snapshot column required by the existing
-- authenticated registration-list embed. Row visibility remains governed by
-- the existing confirmation-select policy.
grant select (signer_name_snapshot)
on public.basic_medical_session_confirmations
to authenticated;
