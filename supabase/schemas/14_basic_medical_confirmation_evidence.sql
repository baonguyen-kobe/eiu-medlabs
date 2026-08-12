create or replace function public.get_basic_medical_confirmation_evidence(
  target_confirmation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  evidence jsonb;
begin
  select jsonb_build_object(
    'confirmation_id', confirmations.id,
    'registration_id_snapshot', confirmations.registration_id_snapshot,
    'class_schedule_id_snapshot', confirmations.class_schedule_id_snapshot,
    'signer_id', confirmations.signer_id,
    'signature_data', confirmations.signature_data,
    'schedule_date_snapshot', confirmations.schedule_date_snapshot,
    'start_time_snapshot', confirmations.start_time_snapshot,
    'end_time_snapshot', confirmations.end_time_snapshot,
    'room_id_snapshot', confirmations.room_id_snapshot,
    'teaching_lecturer_id_snapshot', confirmations.teaching_lecturer_id_snapshot,
    'signed_at', confirmations.signed_at,
    'invalidated_at', confirmations.invalidated_at,
    'invalidated_reason', confirmations.invalidated_reason,
    'equipment_checks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inventory_id', checks.inventory_id,
          'item_name_snapshot', checks.item_name_snapshot,
          'commercial_name_snapshot', checks.commercial_name_snapshot,
          'unit_snapshot', checks.unit_snapshot,
          'total_before', checks.total_before,
          'good_before', checks.good_before,
          'damaged_before', checks.damaged_before,
          'newly_damaged_quantity', checks.newly_damaged_quantity,
          'total_after', checks.total_before,
          'good_after', checks.good_after,
          'damaged_after', checks.damaged_after
        ) order by checks.item_name_snapshot, checks.inventory_id
      )
      from public.basic_medical_session_equipment_checks checks
      where checks.confirmation_id = confirmations.id
    ), '[]'::jsonb)
  )
  into evidence
  from public.basic_medical_session_confirmations confirmations
  where confirmations.id = target_confirmation_id
    and (select private.can_view_basic_medical_registration(
      confirmations.registration_id_snapshot
    ));

  if evidence is null then
    raise exception 'CONFIRMATION_EVIDENCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return evidence;
end;
$$;

revoke all on function public.get_basic_medical_confirmation_evidence(uuid)
  from public, anon;
grant execute on function public.get_basic_medical_confirmation_evidence(uuid)
  to authenticated;
