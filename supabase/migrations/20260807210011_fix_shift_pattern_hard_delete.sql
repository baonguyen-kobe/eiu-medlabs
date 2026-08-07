create or replace function public.hard_delete_shift_pattern(
  target_pattern_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;

  -- Remove ONLY deletable pattern-generated child occurrences
  -- Historical/manual/completed/cancelled/started rows are preserved
  delete from public.staff_shifts
  where shift_pattern_id = target_pattern_id
    and registration_source = 'generated'
    and status not in ('completed', 'cancelled')
    and (shift_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh');

  -- Delete the parent pattern
  delete from public.staff_shift_patterns where id = target_pattern_id;
  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id)
    values (actor_id, 'shift_pattern.hard_deleted', 'shift_pattern', target_pattern_id);
  end if;
  return deleted_count > 0;
end;
$$;

revoke all on function public.hard_delete_shift_pattern(uuid) from public, anon, authenticated;
grant execute on function public.hard_delete_shift_pattern(uuid) to authenticated;
