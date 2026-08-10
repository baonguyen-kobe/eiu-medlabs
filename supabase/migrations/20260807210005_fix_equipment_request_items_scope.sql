
-- Fix equipment_request_items policies to check room scope for staff
drop policy if exists equipment_request_items_authorized_insert on public.equipment_request_items;

create policy equipment_request_items_authorized_insert
  on public.equipment_request_items for insert
  to authenticated
  with check (
    (select private.has_role('admin'))
    or (
      (select private.has_role('staff'))
      and (select private.can_manage_equipment_request(request_id))
    )
    or (
      (select status from public.equipment_requests r where r.id = request_id) in ('new', 'preparing')
      and (select created_by from public.equipment_requests r where r.id = request_id) = (select auth.uid())
    )
  );

drop policy if exists equipment_request_items_delete on public.equipment_request_items;

create policy equipment_request_items_delete
  on public.equipment_request_items for delete
  to authenticated
  using (
    (select private.has_role('admin'))
    or (
      (select private.has_role('staff'))
      and (select private.can_manage_equipment_request(request_id))
    )
    or (
      (select status from public.equipment_requests r where r.id = request_id) in ('new', 'preparing')
      and (select created_by from public.equipment_requests r where r.id = request_id) = (select auth.uid())
    )
  );
