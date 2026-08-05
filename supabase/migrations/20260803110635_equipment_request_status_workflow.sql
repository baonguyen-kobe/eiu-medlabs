alter table public.equipment_requests
  drop constraint if exists equipment_requests_status_check;

update public.equipment_requests
set status = case
  when status = 'ready' then 'preparing'
  when status = 'cancelled' then 'completed'
  else status
end
where status in ('ready', 'cancelled');

alter table public.equipment_requests
  add constraint equipment_requests_status_check
  check (status in ('new', 'preparing', 'handed_over', 'returned', 'completed'));

drop policy if exists equipment_requests_update on public.equipment_requests;
create policy equipment_requests_update on public.equipment_requests
for update to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')))
with check ((select private.has_role('admin')) or (select private.has_role('staff')));
