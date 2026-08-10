-- Fix equipment_request_items insert policy to block inserts when the parent
-- request is already in handed_over / returned / completed status.
-- Previously admin and staff had an unconditional insert path; they must also
-- be restricted to new/preparing so the handed-over lock is respected.
drop policy if exists equipment_request_items_authorized_insert on public.equipment_request_items;

create policy equipment_request_items_authorized_insert
  on public.equipment_request_items for insert
  to authenticated
  with check (
    (
      (select private.has_role('admin'))
      or (select private.has_role('staff'))
    )
    and (
      (select r.status from public.equipment_requests r where r.id = request_id)
        in ('new', 'preparing')
    )
    or (
      (select r.status from public.equipment_requests r where r.id = request_id)
        in ('new', 'preparing')
      and (select r.created_by from public.equipment_requests r where r.id = request_id)
        = (select auth.uid())
    )
  );
