-- Inventory cannot be created or updated against inactive targets.
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.set_basic_medical_room_inventory(uuid,uuid,uuid,integer,integer,boolean,text)'::regprocedure
  ) into definition;

  if position('(target_inventory_id is not null or is_active)' in definition) = 0 then
    raise exception 'INVENTORY_TARGET_ACTIVITY_GUARD_NOT_FOUND';
  end if;

  definition := replace(
    definition,
    '(target_inventory_id is not null or is_active)',
    'is_active'
  );
  execute definition;
end;
$$;
