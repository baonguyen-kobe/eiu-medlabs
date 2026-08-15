-- Read-only, scoped confirmation metadata for the Phiếu Y cơ sở list.
-- Do not grant table SELECT: signature payloads remain inaccessible to clients.
create or replace function public.list_basic_medical_registration_confirmation_states(
  target_registration_ids uuid[]
)
returns table (
  registration_id uuid,
  session_id uuid,
  confirmation_id uuid,
  signer_id uuid,
  signer_name_snapshot text,
  signed_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid,
  invalidated_by_name_snapshot text,
  invalidated_reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if coalesce(cardinality(target_registration_ids), 0) > 100 then
    raise exception 'INVALID_BASIC_MEDICAL_REGISTRATION_BATCH' using errcode = '22023';
  end if;

  return query
  select
    sessions.registration_id,
    sessions.id,
    confirmations.id,
    confirmations.signer_id,
    confirmations.signer_name_snapshot,
    confirmations.signed_at,
    confirmations.invalidated_at,
    confirmations.invalidated_by,
    confirmations.invalidated_by_name_snapshot,
    confirmations.invalidated_reason
  from public.basic_medical_registration_sessions as sessions
  join public.basic_medical_session_confirmations as confirmations
    on confirmations.session_id = sessions.id
  where sessions.registration_id = any(target_registration_ids)
    and (select private.can_view_basic_medical_registration(sessions.registration_id))
  order by sessions.registration_id, sessions.session_number, confirmations.signed_at;
end;
$$;

revoke all on function public.list_basic_medical_registration_confirmation_states(uuid[])
  from public, anon, authenticated;
grant execute on function public.list_basic_medical_registration_confirmation_states(uuid[])
  to authenticated;
