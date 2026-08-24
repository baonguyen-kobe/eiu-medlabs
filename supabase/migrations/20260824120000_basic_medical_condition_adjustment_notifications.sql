-- A generic condition adjustment belongs to aggregate room inventory, not to a
-- uniquely identifiable historical damage report. Notify only the management
-- side from the committed condition-log event.

create or replace function private.notify_basic_medical_condition_adjustment(
  target_condition_log_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  condition_log record;
  inserted_count integer := 0;
begin
  select
    logs.id,
    logs.inventory_id,
    logs.actor_id,
    logs.event_type,
    logs.good_before,
    logs.damaged_before,
    logs.good_after,
    logs.damaged_after,
    logs.item_name_snapshot,
    inventory.catalog_item_id,
    inventory.room_id,
    rooms.room_type_id,
    rooms.room_code,
    rooms.room_name,
    catalog.item_name
  into condition_log
  from public.basic_medical_equipment_condition_logs as logs
  join public.basic_medical_room_inventory as inventory
    on inventory.id = logs.inventory_id
  join public.rooms
    on rooms.id = inventory.room_id
  join public.basic_medical_equipment_catalog as catalog
    on catalog.id = inventory.catalog_item_id
  where logs.id = target_condition_log_id;

  if condition_log.id is null
    or condition_log.event_type <> 'condition_adjustment' then
    return 0;
  end if;

  with management_recipients as (
    select profiles.id as recipient_id
    from public.profiles
    join public.user_roles as roles
      on roles.user_id = profiles.id
    where profiles.is_active
      and roles.role = 'admin'
    union
    select profiles.id
    from public.profiles
    join public.user_roles as roles
      on roles.user_id = profiles.id
    join public.profile_room_types as scopes
      on scopes.profile_id = profiles.id
    where profiles.is_active
      and roles.role = 'staff'
      and scopes.room_type_id = condition_log.room_type_id
  ), inserted as (
    insert into public.user_notifications (
      recipient_id,
      actor_id,
      domain,
      notification_type,
      entity_type,
      entity_id,
      title,
      body,
      href,
      dedupe_key,
      metadata
    )
    select
      recipients.recipient_id,
      condition_log.actor_id,
      'basic_medical',
      'basic_medical_inventory_condition_adjusted',
      'basic_medical_condition_log',
      condition_log.id,
      'Đã điều chỉnh tình trạng thiết bị',
      concat(
        coalesce(condition_log.item_name_snapshot, condition_log.item_name),
        ' tại phòng ',
        concat_ws(' ', condition_log.room_code, condition_log.room_name),
        ': Tốt ', condition_log.good_before, ' → ', condition_log.good_after,
        ' · Hư ', condition_log.damaged_before, ' → ', condition_log.damaged_after,
        '.'
      ),
      concat('/basic-medical/equipment?tab=logs&item=', condition_log.catalog_item_id),
      concat(
        'basic_medical:condition_adjustment:',
        condition_log.id,
        ':',
        recipients.recipient_id
      ),
      jsonb_build_object(
        'condition_log_id', condition_log.id,
        'inventory_id', condition_log.inventory_id,
        'room_id', condition_log.room_id,
        'catalog_item_id', condition_log.catalog_item_id,
        'good_before', condition_log.good_before,
        'damaged_before', condition_log.damaged_before,
        'good_after', condition_log.good_after,
        'damaged_after', condition_log.damaged_after
      )
    from management_recipients as recipients
    where recipients.recipient_id is distinct from condition_log.actor_id
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end;
$$;

revoke all on function private.notify_basic_medical_condition_adjustment(uuid)
from public, anon, authenticated;

create or replace function private.observe_basic_medical_condition_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_basic_medical_condition_adjustment(new.id);
  return new;
end;
$$;

revoke all on function private.observe_basic_medical_condition_adjustment()
from public, anon, authenticated;

drop trigger if exists basic_medical_condition_adjustment_notification
  on public.basic_medical_equipment_condition_logs;

create trigger basic_medical_condition_adjustment_notification
after insert on public.basic_medical_equipment_condition_logs
for each row
when (new.event_type = 'condition_adjustment')
execute function private.observe_basic_medical_condition_adjustment();
