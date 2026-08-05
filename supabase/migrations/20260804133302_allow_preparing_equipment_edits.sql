do $migration$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.guard_equipment_request_update()'::regprocedure)
  into function_definition;
  updated_definition := replace(
    function_definition,
    'if old.status <> ''new''',
    'if old.status not in (''new'', ''preparing'')'
  );
  updated_definition := replace(
    updated_definition,
    'Chỉ có thể điều chỉnh phiếu trạng thái Mới.',
    'Chỉ có thể điều chỉnh phiếu trạng thái Mới hoặc Đã soạn.'
  );
  if updated_definition = function_definition then
    raise exception 'Không thể cập nhật guard_equipment_request_update.';
  end if;
  execute updated_definition;

  select pg_get_functiondef(
    'public.update_equipment_request_content(uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb)'::regprocedure
  ) into function_definition;
  updated_definition := replace(
    function_definition,
    'and status = ''new''',
    'and status in (''new'', ''preparing'')'
  );
  if updated_definition = function_definition then
    raise exception 'Không thể cập nhật update_equipment_request_content.';
  end if;
  execute updated_definition;
end;
$migration$;

drop policy if exists equipment_items_manage on public.equipment_request_items;
create policy equipment_items_manage
on public.equipment_request_items
for all
to authenticated
using (
  exists (
    select 1
    from public.equipment_requests as requests
    where requests.id = request_id
      and requests.status in ('new', 'preparing')
      and (
        requests.registrant_id = (select auth.uid())
        or (select private.has_role('admin'))
        or (select private.has_role('staff'))
      )
  )
)
with check (
  exists (
    select 1
    from public.equipment_requests as requests
    where requests.id = request_id
      and requests.status in ('new', 'preparing')
      and (
        requests.registrant_id = (select auth.uid())
        or (select private.has_role('admin'))
        or (select private.has_role('staff'))
      )
  )
);
