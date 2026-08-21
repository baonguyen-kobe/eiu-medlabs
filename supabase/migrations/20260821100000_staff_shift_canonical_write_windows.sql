-- Staff shifts retain valid historical rows while all new or changed times use
-- the canonical 30-minute windows.

alter table public.staff_shifts
  drop constraint if exists staff_shifts_morning_time_check,
  drop constraint if exists staff_shifts_afternoon_time_check;

alter table public.staff_shifts
  add constraint staff_shifts_morning_time_check
    check (
      shift_slot <> 'MORNING' or (
        start_time >= '07:00'::time
        and start_time < end_time
        and end_time <= '11:30'::time
        and extract(minute from start_time)::integer in (0, 30)
        and extract(second from start_time)::integer = 0
        and extract(minute from end_time)::integer in (0, 30)
        and extract(second from end_time)::integer = 0
      )
    ),
  add constraint staff_shifts_afternoon_time_check
    check (
      shift_slot <> 'AFTERNOON' or (
        start_time >= '12:30'::time
        and start_time < end_time
        and end_time <= '16:30'::time
        and extract(minute from start_time)::integer in (0, 30)
        and extract(second from start_time)::integer = 0
        and extract(minute from end_time)::integer in (0, 30)
        and extract(second from end_time)::integer = 0
      )
    );

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.register_staff_shifts(jsonb,text)'::regprocedure
  ) into definition;

  if position(
    $old$target_start < '07:00'::time or target_end > '11:00'::time or$old$
    in definition
  ) = 0 then
    raise exception 'STAFF_SHIFT_RPC_DRIFT: register_staff_shifts morning rule was not found';
  end if;

  definition := replace(
    definition,
    $old$target_start < '07:00'::time or target_end > '11:00'::time or$old$,
    $new$target_start < '07:30'::time or target_end > '11:30'::time or$new$
  );
  definition := replace(
    definition,
    $old$target_start < '13:00'::time or target_end > '16:00'::time or$old$,
    $new$target_start < '12:30'::time or target_end > '16:30'::time or$new$
  );
  definition := replace(
    definition,
    'Morning shift must be within 07:00-11:00 on 30-minute grid',
    'Morning shift must be within 07:30-11:30 on 30-minute grid'
  );
  definition := replace(
    definition,
    'Afternoon shift must be within 13:00-16:00 on 30-minute grid',
    'Afternoon shift must be within 12:30-16:30 on 30-minute grid'
  );
  execute definition;

  select pg_get_functiondef(
    'public.update_staff_shift_time(uuid,time,time,text,text)'::regprocedure
  ) into definition;

  if position(
    $old$if target_start_time < '07:00'::time or target_end_time > '11:00'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0 then$old$
    in definition
  ) = 0 then
    raise exception 'STAFF_SHIFT_RPC_DRIFT: update_staff_shift_time morning rule was not found';
  end if;

  definition := replace(
    definition,
    $old$if target_start_time < '07:00'::time or target_end_time > '11:00'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0 then$old$,
    $new$if (target_start_time <> target_shift.start_time or target_end_time <> target_shift.end_time) and (
       target_start_time < '07:30'::time or target_end_time > '11:30'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0
    ) then$new$
  );
  definition := replace(
    definition,
    $old$if target_start_time < '13:00'::time or target_end_time > '16:00'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0 then$old$,
    $new$if (target_start_time <> target_shift.start_time or target_end_time <> target_shift.end_time) and (
       target_start_time < '12:30'::time or target_end_time > '16:30'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0
    ) then$new$
  );
  definition := replace(
    definition,
    'Morning shift must be within 07:00-11:00 on 30-minute grid',
    'Morning shift must be within 07:30-11:30 on 30-minute grid'
  );
  definition := replace(
    definition,
    'Afternoon shift must be within 13:00-16:00 on 30-minute grid',
    'Afternoon shift must be within 12:30-16:30 on 30-minute grid'
  );
  execute definition;
end;
$migration$;
