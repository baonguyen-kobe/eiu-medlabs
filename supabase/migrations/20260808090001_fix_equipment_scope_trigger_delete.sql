-- Migration: Fix enforce_room_scope trigger to not block DELETE operations
-- Context: TB-06 migration revokes DELETE privilege from authenticated/anon roles
-- and gates DELETE via hard_delete_equipment_request (security definer).
-- The enforce_room_scope trigger on DELETE is redundant and blocks the SECURITY DEFINER
-- hard_delete RPC because auth.role() is not 'service_role' in that execution context.
-- Using security definer so the trigger runs as postgres (which has private schema access)
-- regardless of the calling role (matches original security model of this function).

create or replace function private.enforce_equipment_request_room_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  -- DELETE is fully controlled by privilege revocation + hard_delete_equipment_request RPC.
  -- Do not block DELETE at the trigger level.
  if tg_op = 'DELETE' then
    return old;
  end if;

  if (select auth.role()) = 'service_role' or (select private.has_role('admin')) then
    return coalesce(new, old);
  end if;
  if (select private.has_role('staff')) then
    if not (select private.can_manage_equipment_schedule(coalesce(new.class_schedule_id, old.class_schedule_id))) then
      raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.registrant_id = actor_id and new.created_by = actor_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
    (old.registrant_id = actor_id and new.registrant_id = actor_id)
    or (old.responsible_lecturer_id = actor_id and new.responsible_lecturer_id = actor_id)
  ) then
    return new;
  end if;
  raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
end;
$$;
