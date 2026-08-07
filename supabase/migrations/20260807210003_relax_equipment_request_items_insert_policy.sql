
-- Simplify equipment_request_items insert policy to fix RLS violation
drop policy if exists equipment_request_items_authorized_insert on public.equipment_request_items;

create policy equipment_request_items_authorized_insert
  on public.equipment_request_items for insert
  to authenticated
  with check (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      (select created_by from public.equipment_requests r where r.id = request_id) = (select auth.uid())
    )
  );

-- Fix cleanup in test 1899
