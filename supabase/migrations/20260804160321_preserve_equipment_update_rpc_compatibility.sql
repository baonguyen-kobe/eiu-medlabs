create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_items jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.update_equipment_request_content(
    target_request_id,
    target_class_schedule_id,
    target_semester,
    target_responsible_lecturer_id,
    target_receive_at,
    target_return_at,
    target_note,
    coalesce((
      select requests.late_registration_reason
      from public.equipment_requests as requests
      where requests.id = target_request_id
    ), ''),
    target_items
  );
$$;

revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) to authenticated;
