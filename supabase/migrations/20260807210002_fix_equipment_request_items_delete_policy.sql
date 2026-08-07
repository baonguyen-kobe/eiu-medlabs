
-- Fix missing DELETE policy for equipment_request_items which prevents update_equipment_request_content RPC from clearing items
create policy equipment_items_delete on public.equipment_request_items
for delete to authenticated
using (
  (select private.has_role('admin'))
  or (select private.has_role('staff'))
  or exists (
    select 1 from public.equipment_requests r
    where r.id = request_id
      and r.created_by = auth.uid()
      and r.status in ('new', 'preparing')
  )
);
