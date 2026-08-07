
-- Fix equipment_request_deleted_email trigger to remove delivery_mode from insert
create or replace function private.enqueue_equipment_request_deleted_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registrant_email text;
begin
  if tg_op = 'DELETE' or new.status = 'cancelled' then
    select email into registrant_email from public.profiles where id = old.registrant_id;
    if registrant_email is not null then
      insert into public.email_notifications (
        notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
      ) values (
        'equipment_request_deleted', old.registrant_id, registrant_email, 
        concat('equipment_request_deleted:', old.id, ':', old.registrant_id, ':', extract(epoch from now())),
        'Yêu cầu trang thiết bị đã bị hủy', 
        jsonb_build_object('request_id', old.id, 'status', coalesce(new.status, 'deleted'))
      ) on conflict do nothing;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
