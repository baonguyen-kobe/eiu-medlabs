-- Migration: 20260818170000_enforce_equipment_request_table_semester_authority.sql
-- Enforce schedule semester authority at the public.equipment_requests table boundary

create or replace function private.enforce_equipment_request_semester_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_sched_semester text;
  target_room_type_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.class_schedule_id is null then
      raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '22023';
    end if;

    select schedules.semester, rooms.room_type_id
    into target_sched_semester, target_room_type_id
    from public.class_schedules as schedules
    join public.rooms as rooms on rooms.id = schedules.room_id
    where schedules.id = new.class_schedule_id
      and schedules.schedule_status <> 'cancelled';

    if target_room_type_id is null
      or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
      raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
    end if;

    if target_sched_semester is null
      or target_sched_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
      raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode = '22023';
    end if;

    new.semester := target_sched_semester;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.class_schedule_id is not distinct from old.class_schedule_id then
      select schedules.semester, rooms.room_type_id
      into target_sched_semester, target_room_type_id
      from public.class_schedules as schedules
      join public.rooms as rooms on rooms.id = schedules.room_id
      where schedules.id = new.class_schedule_id
        and schedules.schedule_status <> 'cancelled';

      if target_sched_semester in ('HK1', 'HK2', 'HK3', 'HK4') then
        new.semester := target_sched_semester;
      else
        if new.semester is distinct from old.semester then
          raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ để cập nhật.' using errcode = '22023';
        end if;
        new.semester := old.semester;
      end if;

      return new;
    else
      select schedules.semester, rooms.room_type_id
      into target_sched_semester, target_room_type_id
      from public.class_schedules as schedules
      join public.rooms as rooms on rooms.id = schedules.room_id
      where schedules.id = new.class_schedule_id
        and schedules.schedule_status <> 'cancelled';

      if target_room_type_id is null
        or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
        raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
      end if;

      if target_sched_semester is null
        or target_sched_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
        raise exception 'Lịch học mới chưa có thông tin Học kỳ hợp lệ.' using errcode = '22023';
      end if;

      new.semester := target_sched_semester;
      return new;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_requests_enforce_semester_authority on public.equipment_requests;
create trigger equipment_requests_enforce_semester_authority
before insert or update on public.equipment_requests
for each row execute function private.enforce_equipment_request_semester_authority();

revoke all on function private.enforce_equipment_request_semester_authority() from public, anon, authenticated;
