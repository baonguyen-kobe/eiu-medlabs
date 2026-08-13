-- Declarative final state for immutable, human-readable confirmation evidence.

alter table public.basic_medical_session_confirmations
  add column if not exists course_code_snapshot text,
  add column if not exists course_name_snapshot text,
  add column if not exists room_code_snapshot text,
  add column if not exists building_code_snapshot text,
  add column if not exists room_name_snapshot text,
  add column if not exists teaching_lecturer_name_snapshot text,
  add column if not exists signer_name_snapshot text;

create or replace function private.capture_basic_medical_confirmation_display_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_row record;
begin
  if new.session_id is null then
    return new;
  end if;

  select schedules.course_code_snapshot,
         schedules.course_name_snapshot,
         rooms.room_code,
         rooms.building_code,
         rooms.room_name,
         teaching.full_name as teaching_lecturer_name,
         signer.full_name as signer_name
  into schedule_row
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  join public.profiles as teaching on teaching.id = new.teaching_lecturer_id_snapshot
  join public.profiles as signer on signer.id = new.signer_id
  where schedules.id = new.class_schedule_id_snapshot;

  if schedule_row.course_code_snapshot is null
    or schedule_row.course_name_snapshot is null
    or schedule_row.room_code is null
    or schedule_row.building_code is null
    or schedule_row.teaching_lecturer_name is null
    or schedule_row.signer_name is null then
    raise exception 'Không thể chụp thông tin hiển thị của bằng chứng xác nhận.'
      using errcode = 'P0002';
  end if;

  new.course_code_snapshot := schedule_row.course_code_snapshot;
  new.course_name_snapshot := schedule_row.course_name_snapshot;
  new.room_code_snapshot := schedule_row.room_code;
  new.building_code_snapshot := schedule_row.building_code;
  new.room_name_snapshot := schedule_row.room_name;
  new.teaching_lecturer_name_snapshot := schedule_row.teaching_lecturer_name;
  new.signer_name_snapshot := schedule_row.signer_name;
  return new;
end;
$$;

drop trigger if exists basic_medical_confirmation_display_snapshots
  on public.basic_medical_session_confirmations;
create trigger basic_medical_confirmation_display_snapshots
before insert on public.basic_medical_session_confirmations
for each row execute function private.capture_basic_medical_confirmation_display_snapshots();

revoke all on function private.capture_basic_medical_confirmation_display_snapshots()
  from public, anon, authenticated;

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
    'course_code_snapshot', confirmations.course_code_snapshot,
    'course_name_snapshot', confirmations.course_name_snapshot,
    'room_code_snapshot', confirmations.room_code_snapshot,
    'building_code_snapshot', confirmations.building_code_snapshot,
    'room_name_snapshot', confirmations.room_name_snapshot,
    'teaching_lecturer_name_snapshot', confirmations.teaching_lecturer_name_snapshot,
    'signer_name_snapshot', confirmations.signer_name_snapshot,
    'display_snapshots_available', confirmations.course_code_snapshot is not null
      and confirmations.course_name_snapshot is not null
      and confirmations.room_code_snapshot is not null
      and confirmations.building_code_snapshot is not null
      and confirmations.teaching_lecturer_name_snapshot is not null
      and confirmations.signer_name_snapshot is not null,
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
      from public.basic_medical_session_equipment_checks as checks
      where checks.confirmation_id = confirmations.id
    ), '[]'::jsonb)
  )
  into evidence
  from public.basic_medical_session_confirmations as confirmations
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
