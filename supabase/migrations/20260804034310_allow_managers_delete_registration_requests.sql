create policy equipment_requests_delete
on public.equipment_requests
for delete
to authenticated
using (
  (select private.has_role('admin'))
  or (select private.has_role('staff'))
);
