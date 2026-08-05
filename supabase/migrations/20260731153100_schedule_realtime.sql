do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_schedules'
  ) then
    alter publication supabase_realtime add table public.class_schedules;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_shifts'
  ) then
    alter publication supabase_realtime add table public.staff_shifts;
  end if;
end;
$$;
