-- Declarative mirror of 20260803090011_native_registration_workflows.sql.
create table if not exists public.basic_medical_registrations (
  id uuid primary key default gen_random_uuid(), academic_year text not null check (btrim(academic_year) <> ''),
  semester text not null check (semester in ('HK1','HK2','HK3','HK4')), start_date date not null,
  end_date date not null check (end_date >= start_date), course_id uuid not null references public.courses(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict, student_count integer not null check (student_count > 0),
  registrant_id uuid not null references public.profiles(id) on delete restrict,
  responsible_lecturer_id uuid not null references public.profiles(id) on delete restrict, note text,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.courses
  add column if not exists room_type_id uuid references public.room_types(id) on delete restrict;
update public.courses as courses
set room_type_id = coalesce(
  (
    select rooms.room_type_id
    from public.class_schedules as schedules
    join public.rooms as rooms on rooms.id = schedules.room_id
    where schedules.course_id = courses.id
    group by rooms.room_type_id
    order by count(*) desc, rooms.room_type_id
    limit 1
  ),
  (
    select rooms.room_type_id
    from public.basic_medical_registrations as registrations
    join public.rooms as rooms on rooms.id = registrations.room_id
    where registrations.course_id = courses.id
    group by rooms.room_type_id
    order by count(*) desc, rooms.room_type_id
    limit 1
  ),
  '40000000-0000-0000-0000-000000000001'::uuid
)
where courses.room_type_id is null;
alter table public.courses
  alter column room_type_id set default '40000000-0000-0000-0000-000000000001'::uuid,
  alter column room_type_id set not null;
create index if not exists courses_room_type_id_idx
  on public.courses (room_type_id, is_active, course_name);
alter table public.class_schedules add column if not exists basic_medical_registration_id uuid references public.basic_medical_registrations(id) on delete cascade;
drop trigger if exists class_schedules_email_outbox on public.class_schedules;
create trigger class_schedules_email_outbox
after insert on public.class_schedules
for each row
when (new.basic_medical_registration_id is null)
execute function private.enqueue_manual_schedule_email();
alter table public.class_schedules
  drop constraint if exists class_schedules_operating_hours;
alter table public.class_schedules
  add constraint class_schedules_operating_hours check (
    (
      basic_medical_registration_id is not null
      and start_time >= time '07:00'
      and end_time <= time '21:00'
    )
    or
    (
      basic_medical_registration_id is null
      and (
        (start_time >= time '07:30' and end_time <= time '11:30')
        or (start_time >= time '12:30' and end_time <= time '16:30')
      )
    )
  );
create table if not exists public.basic_medical_registration_sessions (
  id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.basic_medical_registrations(id) on delete cascade,
  class_schedule_id uuid not null unique references public.class_schedules(id) on delete cascade,
  lesson_title text not null check (btrim(lesson_title) <> ''), teaching_lecturer_id uuid not null references public.profiles(id) on delete restrict,
  session_number integer not null check (session_number > 0), unique (registration_id, session_number)
);
create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(), item_name text not null check (btrim(item_name) <> ''), commercial_name text,
  item_type text, country_of_origin text, manufacturer text, model text, unit text not null check (btrim(unit) <> ''),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (item_name, commercial_name, model)
);
create table if not exists public.equipment_requests (
  id uuid primary key default gen_random_uuid(), class_schedule_id uuid not null unique references public.class_schedules(id) on delete cascade,
  registrant_id uuid not null references public.profiles(id) on delete restrict,
  responsible_lecturer_id uuid not null references public.profiles(id) on delete restrict,
  semester text not null check (semester in ('HK1','HK2','HK3','HK4')),
  phone_snapshot text not null check (phone_snapshot ~ '^[0-9]{10}$'), email_snapshot text not null,
  receive_at timestamptz not null, return_at timestamptz not null check (return_at >= receive_at),
  status text not null default 'new' check (status in ('new','preparing','handed_over','returned','completed')),
  late_approval_status text not null default 'not_required' check (late_approval_status in ('not_required','pending','approved','rejected')),
  late_registration_reason text,
  late_requested_at timestamptz,
  late_reviewed_by uuid references public.profiles(id) on delete set null,
  late_reviewed_at timestamptz,
  late_review_note text,
  handover_file_url text, note text, created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.equipment_requests
  add column if not exists handover_staff_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists handover_staff_confirmed_at timestamptz,
  add column if not exists handover_recipient_signature text,
  add column if not exists handover_recipient_signed_at timestamptz,
  add column if not exists handover_effective_at timestamptz,
  add column if not exists return_staff_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists return_staff_confirmed_at timestamptz,
  add column if not exists return_recipient_signature text,
  add column if not exists return_recipient_signed_at timestamptz,
  add column if not exists return_effective_at timestamptz;
alter table public.equipment_requests
  add column if not exists late_approval_status text not null default 'not_required',
  add column if not exists late_registration_reason text,
  add column if not exists late_requested_at timestamptz,
  add column if not exists late_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists late_reviewed_at timestamptz,
  add column if not exists late_review_note text;
alter table public.equipment_requests
  add constraint equipment_requests_late_approval_status_valid check (
    late_approval_status in ('not_required','pending','approved','rejected')
  ),
  add constraint equipment_requests_late_approval_reason_required check (
    late_approval_status = 'not_required'
    or nullif(btrim(late_registration_reason), '') is not null
  ),
  add constraint equipment_requests_late_review_valid check (
    (late_approval_status in ('not_required','pending') and late_reviewed_by is null and late_reviewed_at is null)
    or (late_approval_status in ('approved','rejected') and late_reviewed_by is not null and late_reviewed_at is not null)
  );
alter table public.equipment_requests
  add constraint equipment_requests_handover_signature_valid check (
    handover_recipient_signature is null or (
      length(handover_recipient_signature) between 100 and 400000
      and handover_recipient_signature like 'data:image/png;base64,%'
    )
  ),
  add constraint equipment_requests_return_signature_valid check (
    return_recipient_signature is null or (
      length(return_recipient_signature) between 100 and 400000
      and return_recipient_signature like 'data:image/png;base64,%'
    )
  );
create table if not exists public.equipment_request_items (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.equipment_requests(id) on delete cascade,
  skill_name text not null check (btrim(skill_name) <> ''), catalog_item_id uuid not null references public.equipment_catalog(id) on delete restrict,
  quantity integer not null check (quantity > 0), note text, created_at timestamptz not null default now()
);
create index if not exists basic_medical_registrations_created_by_idx on public.basic_medical_registrations(created_by, created_at desc);
create index if not exists equipment_requests_registrant_idx on public.equipment_requests(registrant_id, created_at desc);
create index if not exists equipment_requests_late_approval_pending_idx
  on public.equipment_requests(created_at desc)
  where late_approval_status = 'pending';
create index if not exists equipment_request_items_request_idx on public.equipment_request_items(request_id);
alter table public.basic_medical_registrations enable row level security;
alter table public.basic_medical_registration_sessions enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.equipment_requests enable row level security;
alter table public.equipment_request_items enable row level security;
create trigger basic_medical_registrations_set_updated_at before update on public.basic_medical_registrations for each row execute function private.set_updated_at();

create or replace function public.save_basic_medical_registration(
  target_registration_id uuid,
  target_academic_year text,
  target_semester text,
  target_start_date date,
  target_end_date date,
  target_course_id uuid,
  target_room_id uuid,
  target_student_count integer,
  target_responsible_lecturer_id uuid,
  target_note text,
  target_sessions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  registration_id_value uuid;
  registration_owner_id uuid;
  course_code_value text;
  course_name_value text;
  session_row record;
  session_number_value integer := 0;
  schedule_id_value uuid;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if actor_id is null
    or not (select private.is_active_user())
    or not (
      (select private.has_role('admin'))
      or (select private.has_role('staff'))
      or (
        (select private.has_room_type(basic_medical_room_type_id))
        and (
          (select private.has_role('lecturer'))
          or (select private.has_role('teaching_assistant'))
        )
        and exists (
          select 1
          from public.profiles as profiles
          where profiles.id = actor_id
            and profiles.allow_basic_medical_access
        )
      )
    ) then
    raise exception 'Bạn không có quyền lưu phiếu Y cơ sở.' using errcode = '42501';
  end if;

  if target_academic_year !~ '^\d{4}-\d{4}$'
    or substring(target_academic_year from 6 for 4)::integer
      <> substring(target_academic_year from 1 for 4)::integer + 1 then
    raise exception 'Năm học phải gồm hai năm liên tiếp, ví dụ 2026-2027.' using errcode = '22023';
  end if;
  if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ không hợp lệ.' using errcode = '22023';
  end if;
  if target_start_date is null or target_end_date is null or target_end_date < target_start_date then
    raise exception 'Khoảng ngày đăng ký không hợp lệ.' using errcode = '22023';
  end if;
  if target_student_count is null or target_student_count < 1 then
    raise exception 'Số lượng sinh viên phải là số nguyên dương.' using errcode = '22023';
  end if;
  if target_sessions is null
    or jsonb_typeof(target_sessions) <> 'array'
    or jsonb_array_length(target_sessions) < 1
    or jsonb_array_length(target_sessions) > 500 then
    raise exception 'Danh sách buổi học phải có từ 1 đến 500 buổi.' using errcode = '22023';
  end if;

  select courses.course_code, courses.course_name
  into course_code_value, course_name_value
  from public.courses as courses
  where courses.id = target_course_id
    and courses.is_active
    and courses.room_type_id = basic_medical_room_type_id;
  if course_code_value is null then
    raise exception 'Môn học Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rooms as rooms
    where rooms.id = target_room_id
      and rooms.is_active
      and rooms.room_type_id = basic_medical_room_type_id
  ) then
    raise exception 'Phòng Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles as profiles
    where profiles.id = target_responsible_lecturer_id
      and profiles.is_active
      and lower(btrim(coalesce(profiles.title, ''))) = 'giảng viên'
      and exists (
        select 1 from public.profile_room_types as assignments
        where assignments.profile_id = profiles.id
          and assignments.room_type_id = basic_medical_room_type_id
      )
  ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_sessions) as session(
      schedule_date date,
      start_time time,
      end_time time,
      lesson_title text,
      teaching_lecturer_id uuid
    )
    left join public.profiles as profiles on profiles.id = session.teaching_lecturer_id
    where session.schedule_date is null
      or session.schedule_date < target_start_date
      or session.schedule_date > target_end_date
      or session.start_time is null
      or session.start_time < time '07:00'
      or session.end_time is null
      or session.end_time > time '21:00'
      or session.end_time <= session.start_time
      or nullif(btrim(session.lesson_title), '') is null
      or profiles.id is null
      or not profiles.is_active
      or lower(btrim(coalesce(profiles.title, ''))) <> 'giảng viên'
      or not exists (
        select 1 from public.profile_room_types as assignments
        where assignments.profile_id = profiles.id
          and assignments.room_type_id = basic_medical_room_type_id
      )
  ) then
    raise exception 'Danh sách buổi học có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  if target_registration_id is null then
    insert into public.basic_medical_registrations (
      academic_year, semester, start_date, end_date, course_id, room_id,
      student_count, registrant_id, responsible_lecturer_id, note, created_by
    ) values (
      target_academic_year, target_semester, target_start_date, target_end_date,
      target_course_id, target_room_id, target_student_count, actor_id,
      target_responsible_lecturer_id, nullif(btrim(target_note), ''), actor_id
    ) returning id, created_by into registration_id_value, registration_owner_id;
  else
    select registrations.created_by
    into registration_owner_id
    from public.basic_medical_registrations as registrations
    where registrations.id = target_registration_id
    for update;

    if registration_owner_id is null then
      raise exception 'Không tìm thấy phiếu Y cơ sở.' using errcode = 'P0002';
    end if;
    if registration_owner_id <> actor_id
      and not (select private.has_role('admin'))
      and not (select private.has_role('staff')) then
      raise exception 'Bạn không có quyền điều chỉnh phiếu Y cơ sở.' using errcode = '42501';
    end if;

    update public.basic_medical_registrations
    set academic_year = target_academic_year,
        semester = target_semester,
        start_date = target_start_date,
        end_date = target_end_date,
        course_id = target_course_id,
        room_id = target_room_id,
        student_count = target_student_count,
        responsible_lecturer_id = target_responsible_lecturer_id,
        note = nullif(btrim(target_note), '')
    where id = target_registration_id;

    delete from public.class_schedules
    where basic_medical_registration_id = target_registration_id;
    registration_id_value := target_registration_id;
  end if;

  for session_row in
    select session.*
    from jsonb_to_recordset(target_sessions) as session(
      schedule_date date,
      start_time time,
      end_time time,
      lesson_title text,
      teaching_lecturer_id uuid
    )
  loop
    session_number_value := session_number_value + 1;
    insert into public.class_schedules (
      course_id, course_code_snapshot, course_name_snapshot, room_id,
      lecturer_id, lecturer_2_id, schedule_date, start_time, end_time,
      source, schedule_status, note, student_count, created_by,
      published_by, published_at, basic_medical_registration_id
    ) values (
      target_course_id, course_code_value, course_name_value, target_room_id,
      session_row.teaching_lecturer_id, null, session_row.schedule_date,
      session_row.start_time, session_row.end_time, 'manual', 'published',
      nullif(btrim(target_note), ''), target_student_count,
      registration_owner_id, actor_id, now(), registration_id_value
    ) returning id into schedule_id_value;

    insert into public.basic_medical_registration_sessions (
      registration_id, class_schedule_id, lesson_title,
      teaching_lecturer_id, session_number
    ) values (
      registration_id_value, schedule_id_value,
      btrim(session_row.lesson_title), session_row.teaching_lecturer_id,
      session_number_value
    );
  end loop;

  return registration_id_value;
end;
$$;
create trigger equipment_catalog_set_updated_at before update on public.equipment_catalog for each row execute function private.set_updated_at();
create trigger equipment_requests_set_updated_at before update on public.equipment_requests for each row execute function private.set_updated_at();
create or replace function private.validate_equipment_request_content()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare skills_room_type constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if new.semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;
  if length(coalesce(new.note, '')) > 2000 then
    raise exception 'Ghi chú không được vượt quá 2000 ký tự.' using errcode = '22023';
  end if;
  if length(coalesce(new.late_registration_reason, '')) > 1000 then
    raise exception 'Lý do đăng ký trễ không được vượt quá 1000 ký tự.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profiles
    where profiles.id = new.responsible_lecturer_id and profiles.is_active
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
      and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = skills_room_type)
  ) then raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger equipment_requests_validate_content
before insert or update on public.equipment_requests
for each row execute function private.validate_equipment_request_content();
create or replace function private.validate_equipment_request_timing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
  receive_local timestamp;
  return_local timestamp;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.class_schedule_id is not distinct from old.class_schedule_id
    and new.receive_at is not distinct from old.receive_at
    and new.return_at is not distinct from old.return_at then
    return new;
  end if;

  select schedules.schedule_date, rooms.room_type_id
  into target_schedule_date, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id
    and schedules.schedule_status <> 'cancelled';

  if target_schedule_date is null
    or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
  end if;

  receive_local := new.receive_at at time zone 'Asia/Ho_Chi_Minh';
  return_local := new.return_at at time zone 'Asia/Ho_Chi_Minh';

  if receive_local::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày nhận không được trước ngày hiện tại.' using errcode = '22023';
  end if;
  if receive_local::date > target_schedule_date then
    raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode = '22023';
  end if;
  if return_local < receive_local then
    raise exception 'Ngày và giờ trả phải sau hoặc bằng thời điểm nhận.' using errcode = '22023';
  end if;
  if return_local::date < target_schedule_date then
    raise exception 'Ngày trả phải bằng hoặc sau ngày học.' using errcode = '22023';
  end if;
  if receive_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00')
    or return_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00') then
    raise exception 'Giờ nhận và giờ trả không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;
create trigger equipment_requests_validate_timing before insert or update on public.equipment_requests for each row execute function private.validate_equipment_request_timing();
create or replace function private.enforce_equipment_late_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.receive_at is not distinct from old.receive_at
    and new.late_registration_reason is not distinct from old.late_registration_reason
    and old.late_approval_status <> 'rejected' then
    return new;
  end if;
  if new.receive_at <= clock_timestamp() then
    raise exception 'Thời gian nhận thiết bị phải sau thời điểm đăng ký.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_late_approval_system', 'true', true);
  if new.receive_at < clock_timestamp() + interval '24 hours' then
    if nullif(btrim(new.late_registration_reason), '') is null then
      raise exception 'Vui lòng nhập Lý do đăng ký trễ.' using errcode = '22023';
    end if;
    new.late_approval_status := 'pending';
    new.late_requested_at := clock_timestamp();
    new.late_reviewed_by := null;
    new.late_reviewed_at := null;
    new.late_review_note := null;
  else
    new.late_approval_status := 'not_required';
    new.late_registration_reason := null;
    new.late_requested_at := null;
    new.late_reviewed_by := null;
    new.late_reviewed_at := null;
    new.late_review_note := null;
  end if;
  return new;
end;
$$;
create trigger equipment_requests_enforce_late_approval
before insert or update on public.equipment_requests
for each row execute function private.enforce_equipment_late_approval();

create or replace function private.guard_equipment_late_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_rank integer;
  new_rank integer;
begin
  if (
    new.late_approval_status is distinct from old.late_approval_status
    or new.late_requested_at is distinct from old.late_requested_at
    or new.late_reviewed_by is distinct from old.late_reviewed_by
    or new.late_reviewed_at is distinct from old.late_reviewed_at
    or new.late_review_note is distinct from old.late_review_note
  ) and current_setting('app.equipment_late_approval_system', true) <> 'true'
    and current_setting('app.equipment_late_approval_rpc', true) <> 'true'
    and current_setting('app.equipment_confirmation_rpc', true) <> 'true' then
    raise exception 'Vui lòng dùng luồng duyệt đăng ký trễ.' using errcode = '42501';
  end if;

  old_rank := case old.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  new_rank := case new.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  if new_rank > old_rank and old.late_approval_status in ('pending', 'rejected') then
    raise exception 'Phiếu chưa được duyệt đăng ký trễ.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger equipment_requests_guard_late_approval
before update on public.equipment_requests
for each row execute function private.guard_equipment_late_approval();
create or replace function private.guard_equipment_request_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;

  if old.status not in ('new', 'preparing')
    and (
      new.class_schedule_id is distinct from old.class_schedule_id
      or new.semester is distinct from old.semester
      or new.registrant_id is distinct from old.registrant_id
      or new.responsible_lecturer_id is distinct from old.responsible_lecturer_id
      or new.phone_snapshot is distinct from old.phone_snapshot
      or new.email_snapshot is distinct from old.email_snapshot
      or new.receive_at is distinct from old.receive_at
      or new.return_at is distinct from old.return_at
      or new.note is distinct from old.note
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Chỉ có thể điều chỉnh phiếu trạng thái Mới hoặc Đã soạn.' using errcode = '42501';
  end if;

  if (select private.has_role('admin')) or (select private.has_role('staff')) then
    if new.status is distinct from old.status
      or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
      or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
      or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
      or new.handover_effective_at is distinct from old.handover_effective_at
      or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
      or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
      or new.return_recipient_signature is distinct from old.return_recipient_signature
      or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
      or new.return_effective_at is distinct from old.return_effective_at then
      raise exception 'Vui lòng dùng luồng xác nhận trạng thái phiếu.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.registrant_id is distinct from old.registrant_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.status is distinct from old.status
    or new.handover_file_url is distinct from old.handover_file_url
    or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
    or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
    or new.handover_recipient_signature is distinct from old.handover_recipient_signature
    or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
    or new.handover_effective_at is distinct from old.handover_effective_at
    or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
    or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
    or new.return_recipient_signature is distinct from old.return_recipient_signature
    or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
    or new.return_effective_at is distinct from old.return_effective_at
    or new.phone_snapshot is distinct from old.phone_snapshot
    or new.email_snapshot is distinct from old.email_snapshot then
    raise exception 'Người đăng ký chỉ được điều chỉnh nội dung phiếu.' using errcode = '42501';
  end if;

  select schedules.schedule_date, rooms.room_type_id
  into target_schedule_date, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id
    and schedules.schedule_status <> 'cancelled';

  if target_schedule_date is null
    or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
  end if;

  if (new.receive_at at time zone 'Asia/Ho_Chi_Minh')::date > target_schedule_date then
    raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode = '22023';
  end if;

  if new.responsible_lecturer_id <> new.registrant_id
    and not exists (
      select 1
      from public.list_scoped_lecturers(target_room_type_id) as lecturers
      where lecturers.id = new.responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;
create or replace function private.can_manage_equipment_schedule(target_schedule_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.has_role('admin')) or (
    (select private.has_role('staff')) and exists (
      select 1 from public.class_schedules schedules
      join public.rooms rooms on rooms.id = schedules.room_id
      where schedules.id = target_schedule_id
        and (select private.has_room_type(rooms.room_type_id))
    )
  );
$$;
create or replace function private.can_manage_equipment_request(target_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.equipment_requests requests
    where requests.id = target_request_id
      and (select private.can_manage_equipment_schedule(requests.class_schedule_id))
  );
$$;
create or replace function private.enforce_equipment_request_room_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid());
begin
  if (select auth.role()) = 'service_role' or (select private.has_role('admin')) then
    return coalesce(new, old);
  end if;
  if (select private.has_role('staff')) then
    if not (select private.can_manage_equipment_schedule(coalesce(new.class_schedule_id, old.class_schedule_id))) then
      raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.registrant_id = actor_id and new.created_by = actor_id then return new; end if;
  if tg_op = 'UPDATE' and ((old.registrant_id = actor_id and new.registrant_id = actor_id) or (old.responsible_lecturer_id = actor_id and new.responsible_lecturer_id = actor_id)) then return new; end if;
  raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
end;
$$;
create trigger equipment_requests_enforce_room_scope
before insert or update or delete on public.equipment_requests
for each row execute function private.enforce_equipment_request_room_scope();
create or replace function public.manager_confirm_equipment_status(
  target_request_id uuid,
  target_status text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  current_rank integer;
  target_rank integer;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được chuyển trạng thái phiếu.' using errcode = '42501';
  end if;
  if target_status not in ('new','preparing','handed_over','returned','completed') then
    raise exception 'Trạng thái phiếu không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row from public.equipment_requests
  where id = target_request_id for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  current_rank := case current_row.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  target_rank := case target_status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_rank < current_rank then
    update public.equipment_requests
    set status = target_status,
        handover_staff_confirmed_by = case when target_rank >= 2 then handover_staff_confirmed_by else null end,
        handover_staff_confirmed_at = case when target_rank >= 2 then handover_staff_confirmed_at else null end,
        handover_recipient_signature = case when target_rank >= 2 then handover_recipient_signature else null end,
        handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
        handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
        return_staff_confirmed_by = null,
        return_staff_confirmed_at = null,
        return_recipient_signature = null,
        return_recipient_signed_at = null,
        return_effective_at = null
    where id = target_request_id returning * into changed_row;
    return changed_row;
  end if;

  if target_status = current_row.status
    and target_status not in ('handed_over','returned') then
    return current_row;
  end if;
  if target_status = 'preparing' then
    update public.equipment_requests set status = 'preparing'
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'handed_over' then
    if current_row.status = 'new' then
      raise exception 'Phải chuyển phiếu sang Đã soạn trước khi xác nhận Đã giao.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_staff_confirmed_by = actor_id,
        handover_staff_confirmed_at = clock_timestamp(),
        status = case when handover_recipient_signature is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_staff_confirmed_by = actor_id,
        return_staff_confirmed_at = clock_timestamp(),
        status = case when return_recipient_signature is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

create or replace function public.manager_review_late_equipment_request(
  target_request_id uuid,
  target_decision text,
  target_note text default null
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được duyệt đăng ký trễ.' using errcode = '42501';
  end if;
  if target_decision not in ('approved', 'rejected') then
    raise exception 'Kết quả duyệt đăng ký trễ không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row
  from public.equipment_requests
  where id = target_request_id
  for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if current_row.late_approval_status <> 'pending' then
    raise exception 'Phiếu không ở trạng thái Chờ duyệt đăng ký trễ.' using errcode = '22023';
  end if;
  if current_row.receive_at <= clock_timestamp() then
    raise exception 'Thời gian nhận thiết bị đã đến hoặc đã qua.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_late_approval_rpc', 'true', true);
  update public.equipment_requests
  set late_approval_status = target_decision,
      late_reviewed_by = actor_id,
      late_reviewed_at = clock_timestamp(),
      late_review_note = nullif(btrim(target_note), '')
  where id = target_request_id
  returning * into changed_row;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  ) values (
    actor_id,
    case when target_decision = 'approved' then 'approve_late_equipment_registration' else 'reject_late_equipment_registration' end,
    'equipment_request',
    target_request_id,
    jsonb_build_object('late_approval_status', current_row.late_approval_status),
    jsonb_build_object('late_approval_status', target_decision),
    jsonb_build_object('review_note', nullif(btrim(target_note), ''))
  );

  return changed_row;
end;
$$;

create or replace function public.registrant_confirm_equipment_handoff(
  target_request_id uuid,
  target_phase text,
  target_signature text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  class_start_at timestamptz;
  signature_bytes bytea;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501';
  end if;
  if target_phase not in ('handover','return') then
    raise exception 'Loại xác nhận không hợp lệ.' using errcode = '22023';
  end if;
  if target_signature is null
    or length(target_signature) not between 100 and 400000
    or target_signature not like 'data:image/png;base64,%' then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end if;
  begin
    signature_bytes := decode(split_part(target_signature, ',', 2), 'base64');
  exception when others then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end;
  if substring(signature_bytes from 1 for 8) <> decode('iVBORw0KGgo=', 'base64') then
    raise exception 'Chữ ký phải là ảnh PNG.' using errcode = '22023';
  end if;

  select requests.* into current_row
  from public.equipment_requests as requests
  where requests.id = target_request_id for update;
  if current_row.id is null
    or actor_id not in (current_row.registrant_id, current_row.responsible_lecturer_id) then
    raise exception 'Chỉ Người đăng ký hoặc Giảng viên phụ trách được ký xác nhận.' using errcode = '42501';
  end if;
  select ((schedules.schedule_date + schedules.start_time) at time zone 'Asia/Ho_Chi_Minh')
  into class_start_at
  from public.class_schedules as schedules
  where schedules.id = current_row.class_schedule_id;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_phase = 'handover' then
    if current_row.status not in ('new','preparing','handed_over') then
      raise exception 'Phiếu không còn ở bước xác nhận giao.' using errcode = '22023';
    end if;
    if current_row.handover_staff_confirmed_at is null
      and current_row.status <> 'handed_over' then
      raise exception 'Kho phải xác nhận Đã giao trước khi Người đăng ký hoặc Giảng viên phụ trách ký.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_recipient_signature = target_signature,
        handover_recipient_signed_at = signed_at_value,
        handover_effective_at = case
          when signed_at_value > class_start_at then receive_at
          else signed_at_value end,
        status = case when handover_staff_confirmed_at is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  else
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi ký xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_recipient_signature = target_signature,
        return_recipient_signed_at = signed_at_value,
        return_effective_at = case
          when signed_at_value < return_at then return_at
          else signed_at_value end,
        status = case when return_staff_confirmed_at is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  end if;
  return changed_row;
end;
$$;
create trigger equipment_requests_guard_update before update on public.equipment_requests for each row execute function private.guard_equipment_request_update();

create or replace function public.create_equipment_request_with_items(
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_late_registration_reason text,
  target_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.profiles;
  request_id uuid;
begin
  if actor_id is null or not (select private.is_active_user())
    or not (
      (select private.has_role('admin'))
      or (select private.has_role('staff'))
      or (select private.has_role('teaching_assistant'))
      or (select private.has_role('lecturer'))
    ) then
    raise exception 'Bạn không có quyền tạo phiếu thiết bị.' using errcode = '42501';
  end if;
  if target_semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Danh sách thiết bị phải có từ 1 đến 500 dòng.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.class_schedules as schedules
    join public.rooms as rooms on rooms.id = schedules.room_id
    where schedules.id = target_class_schedule_id
      and schedules.schedule_status <> 'cancelled'
      and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
      and (select private.has_room_type(rooms.room_type_id))
  ) then
    raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '42501';
  end if;
  if target_responsible_lecturer_id <> actor_id
    and not exists (
      select 1
      from public.list_scoped_lecturers('40000000-0000-0000-0000-000000000001'::uuid) as lecturers
      where lecturers.id = target_responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      skill_name text, catalog_item_id uuid, quantity integer, note text
    )
    left join public.equipment_catalog as catalog on catalog.id = item.catalog_item_id
    where item.skill_name is null or btrim(item.skill_name) = ''
      or length(item.skill_name) > 200
      or item.catalog_item_id is null
      or item.quantity is null or item.quantity < 1 or item.quantity > 100000
      or length(coalesce(item.note, '')) > 1000
      or catalog.id is null or not catalog.is_active
  ) then
    raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  select * into actor_profile from public.profiles where id = actor_id;
  if actor_profile.id is null or coalesce(actor_profile.phone, '') !~ '^\d{10}$' then
    raise exception 'Hồ sơ Nhân sự chưa có số điện thoại 10 chữ số.' using errcode = '22023';
  end if;

  insert into public.equipment_requests (
    class_schedule_id, semester, registrant_id, responsible_lecturer_id,
    phone_snapshot, email_snapshot, receive_at, return_at,
    late_registration_reason, note, created_by
  ) values (
    target_class_schedule_id, target_semester, actor_id, target_responsible_lecturer_id,
    actor_profile.phone, actor_profile.email, target_receive_at, target_return_at,
    nullif(btrim(target_late_registration_reason), ''), nullif(btrim(target_note), ''), actor_id
  ) returning id into request_id;

  insert into public.equipment_request_items (
    request_id, skill_name, catalog_item_id, quantity, note
  )
  select request_id, btrim(item.skill_name), item.catalog_item_id, item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    skill_name text, catalog_item_id uuid, quantity integer, note text
  );
  return request_id;
end;
$$;

revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

drop function if exists public.update_equipment_request_content(uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb);
drop function if exists public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb);
create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_late_registration_reason text,
  target_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_request_id uuid;
begin
  if target_semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;

  if target_items is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 then
    raise exception 'Danh sách thiết bị không hợp lệ.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      skill_name text,
      catalog_item_id uuid,
      quantity integer,
      note text
    )
    left join public.equipment_catalog catalog on catalog.id = item.catalog_item_id
    where item.skill_name is null
      or btrim(item.skill_name) = ''
      or item.catalog_item_id is null
      or item.quantity is null
      or item.quantity < 1
      or catalog.id is null
      or not catalog.is_active
  ) then
    raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  update public.equipment_requests
  set class_schedule_id = target_class_schedule_id,
      semester = target_semester,
      responsible_lecturer_id = target_responsible_lecturer_id,
      receive_at = target_receive_at,
      return_at = target_return_at,
      note = nullif(btrim(target_note), ''),
      late_registration_reason = nullif(btrim(target_late_registration_reason), '')
  where id = target_request_id
    and status in ('new', 'preparing')
  returning id into updated_request_id;

  if updated_request_id is null then
    raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh.' using errcode = '42501';
  end if;

  delete from public.equipment_request_items where request_id = target_request_id;

  insert into public.equipment_request_items (
    request_id,
    skill_name,
    catalog_item_id,
    quantity,
    note
  )
  select target_request_id,
         btrim(item.skill_name),
         item.catalog_item_id,
         item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    skill_name text,
    catalog_item_id uuid,
    quantity integer,
    note text
  );

  return updated_request_id;
end;
$$;
create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_items jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.update_equipment_request_content(
    target_request_id,
    target_class_schedule_id,
    target_semester,
    target_responsible_lecturer_id,
    target_receive_at,
    target_return_at,
    target_note,
    coalesce((
      select requests.late_registration_reason
      from public.equipment_requests as requests
      where requests.id = target_request_id
    ), ''),
    target_items
  );
$$;
create policy basic_medical_registrations_select on public.basic_medical_registrations for select to authenticated using ((select private.is_active_user()) and ((select private.has_role('admin')) or (select private.has_role('staff')) or ((select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)) and (created_by = (select auth.uid()) or registrant_id = (select auth.uid()) or responsible_lecturer_id = (select auth.uid())))));
create policy basic_medical_registrations_manage on public.basic_medical_registrations for all to authenticated using ((select private.has_role('admin')) or (select private.has_role('staff')) or created_by = (select auth.uid())) with check (created_by = (select auth.uid()) and ((select private.has_role('admin')) or (select private.has_role('staff')) or (((select private.has_role('lecturer')) or (select private.has_role('teaching_assistant'))) and (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)) and exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.allow_basic_medical_access))));
create policy basic_medical_sessions_select on public.basic_medical_registration_sessions for select to authenticated using (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id));
create policy basic_medical_sessions_manage on public.basic_medical_registration_sessions for all to authenticated using (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff'))))) with check (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff')))));
create policy equipment_catalog_select on public.equipment_catalog for select to authenticated using ((select private.is_active_user()));
create policy equipment_catalog_admin on public.equipment_catalog for all to authenticated using ((select private.has_role('admin')) or (select private.has_role('staff'))) with check ((select private.has_role('admin')) or (select private.has_role('staff')));
create policy equipment_requests_select on public.equipment_requests for select to authenticated using ((select private.is_active_user()) and ((select private.can_manage_equipment_request(id)) or registrant_id = (select auth.uid()) or responsible_lecturer_id = (select auth.uid())));
create policy equipment_requests_insert on public.equipment_requests for insert to authenticated with check ((select private.is_active_user()) and registrant_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy equipment_requests_update on public.equipment_requests for update to authenticated using ((select private.can_manage_equipment_request(id)) or registrant_id = (select auth.uid())) with check ((select private.can_manage_equipment_request(id)) or (registrant_id = (select auth.uid()) and created_by = (select auth.uid())));
create policy equipment_requests_delete on public.equipment_requests for delete to authenticated using ((select private.can_manage_equipment_request(id)));
create policy equipment_items_select on public.equipment_request_items for select to authenticated using (exists (select 1 from public.equipment_requests r where r.id = request_id));
create policy equipment_items_manage on public.equipment_request_items for all to authenticated using (exists (select 1 from public.equipment_requests r where r.id = request_id and r.status in ('new', 'preparing') and (r.registrant_id = (select auth.uid()) or (select private.can_manage_equipment_request(r.id))))) with check (exists (select 1 from public.equipment_requests r where r.id = request_id and r.status in ('new', 'preparing') and (r.registrant_id = (select auth.uid()) or (select private.can_manage_equipment_request(r.id)))));
grant select, insert, update, delete on public.basic_medical_registrations, public.basic_medical_registration_sessions,
  public.equipment_catalog, public.equipment_requests, public.equipment_request_items to authenticated;
revoke execute on function public.save_basic_medical_registration(uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb) from public, anon;
grant execute on function public.save_basic_medical_registration(uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb) to authenticated;
grant select on public.class_schedules, public.rooms, public.equipment_catalog, public.equipment_requests,
  public.equipment_request_items to service_role;
revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) to authenticated;
revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) to authenticated;
revoke execute on function public.manager_confirm_equipment_status(uuid, text) from public, anon;
grant execute on function public.manager_confirm_equipment_status(uuid, text) to authenticated;
revoke all on function private.validate_equipment_request_content() from public, anon, authenticated;
revoke execute on function public.manager_review_late_equipment_request(uuid, text, text) from public, anon;
grant execute on function public.manager_review_late_equipment_request(uuid, text, text) to authenticated;
revoke all on function private.can_manage_equipment_schedule(uuid) from public, anon;
revoke all on function private.can_manage_equipment_request(uuid) from public, anon;
grant execute on function private.can_manage_equipment_schedule(uuid) to authenticated;
grant execute on function private.can_manage_equipment_request(uuid) to authenticated;
revoke all on function private.enforce_equipment_request_room_scope() from public, anon, authenticated;
revoke execute on function public.registrant_confirm_equipment_handoff(uuid, text, text) from public, anon;
grant execute on function public.registrant_confirm_equipment_handoff(uuid, text, text) to authenticated;

create or replace function public.import_equipment_requests(target_requests jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_payload jsonb;
  item_payload jsonb;
  new_request_id uuid;
  source_code text;
  results jsonb := '[]'::jsonb;
begin
  if actor_id is null
    or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Quản trị viên hoặc Chuyên viên được import phiếu thiết bị.' using errcode = '42501';
  end if;
  if target_requests is null
    or jsonb_typeof(target_requests) <> 'array'
    or jsonb_array_length(target_requests) = 0
    or jsonb_array_length(target_requests) > 500 then
    raise exception 'Danh sách import phải có từ 1 đến 500 phiếu.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  for request_payload in select value from jsonb_array_elements(target_requests)
  loop
    source_code := coalesce(request_payload ->> 'source_code', '');
    begin
      if jsonb_typeof(request_payload -> 'items') <> 'array'
        or jsonb_array_length(request_payload -> 'items') = 0 then
        raise exception 'Phiếu % chưa có danh sách thiết bị.', source_code using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.profiles as profiles
        where profiles.id = (request_payload ->> 'registrant_id')::uuid
          and profiles.is_active
      ) then
        raise exception 'Người đăng ký của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.class_schedules as schedules
        join public.rooms as rooms on rooms.id = schedules.room_id
        where schedules.id = (request_payload ->> 'class_schedule_id')::uuid
          and schedules.schedule_status <> 'cancelled'
          and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
      ) then
        raise exception 'Lớp Skills lab của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if (request_payload ->> 'responsible_lecturer_id')::uuid
          <> (request_payload ->> 'registrant_id')::uuid
        and not exists (
          select 1
          from public.list_scoped_lecturers(
            '40000000-0000-0000-0000-000000000001'::uuid
          ) as lecturers
          where lecturers.id = (request_payload ->> 'responsible_lecturer_id')::uuid
        ) then
        raise exception 'Giảng viên phụ trách của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if coalesce(request_payload ->> 'semester', '') not in ('HK1','HK2','HK3','HK4') then
        raise exception 'Học kỳ của phiếu % phải là HK1, HK2, HK3 hoặc HK4.', source_code using errcode = '22023';
      end if;

      insert into public.equipment_requests (
        class_schedule_id,
        semester,
        registrant_id,
        responsible_lecturer_id,
        phone_snapshot,
        email_snapshot,
        receive_at,
        return_at,
        status,
        note,
        created_by,
        created_at,
        updated_at
      ) values (
        (request_payload ->> 'class_schedule_id')::uuid,
        request_payload ->> 'semester',
        (request_payload ->> 'registrant_id')::uuid,
        (request_payload ->> 'responsible_lecturer_id')::uuid,
        request_payload ->> 'phone_snapshot',
        request_payload ->> 'email_snapshot',
        (request_payload ->> 'receive_at')::timestamptz,
        (request_payload ->> 'return_at')::timestamptz,
        request_payload ->> 'status',
        nullif(request_payload ->> 'note', ''),
        actor_id,
        (request_payload ->> 'created_at')::timestamptz,
        (request_payload ->> 'created_at')::timestamptz
      ) returning id into new_request_id;

      for item_payload in
        select value from jsonb_array_elements(request_payload -> 'items')
      loop
        if not exists (
          select 1
          from public.equipment_catalog as catalog
          where catalog.id = (item_payload ->> 'catalog_item_id')::uuid
        ) then
          raise exception 'Danh mục thiết bị của phiếu % đã thay đổi.', source_code using errcode = '22023';
        end if;
        insert into public.equipment_request_items (
          request_id,
          skill_name,
          catalog_item_id,
          quantity,
          note,
          created_at
        ) values (
          new_request_id,
          item_payload ->> 'skill_name',
          (item_payload ->> 'catalog_item_id')::uuid,
          (item_payload ->> 'quantity')::integer,
          nullif(item_payload ->> 'note', ''),
          (request_payload ->> 'created_at')::timestamptz
        );
      end loop;

      results := results || jsonb_build_array(jsonb_build_object(
        'source_code', source_code,
        'ok', true,
        'request_id', new_request_id
      ));
    exception
      when unique_violation then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Lớp hoặc mã phiếu đã có phiếu thiết bị.'
        ));
      when sqlstate '22023' then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', sqlerrm
        ));
      when foreign_key_violation or check_violation then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Dữ liệu liên quan của phiếu không còn hợp lệ.'
        ));
      when others then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Không thể tạo phiếu thiết bị.'
        ));
    end;
  end loop;
  return results;
end;
$$;

revoke execute on function public.import_equipment_requests(jsonb) from public, anon;
grant execute on function public.import_equipment_requests(jsonb) to authenticated;

-- C2 activation: database-owned equipment signature object references and adoption operations.
-- request_id deliberately has no foreign key so operation/object-path records survive hard deletes for future cleanup.
+-- C2 activation: database-owned equipment signature object references and adoption operations.
-- request_id deliberately has no foreign key so operation/object-path records survive hard deletes for future cleanup.
alter table public.equipment_requests
  add column if not exists handover_recipient_signature_storage_path text,
  add column if not exists return_recipient_signature_storage_path text;

create table public.equipment_signature_operations (
  id uuid primary key,
  request_id uuid not null,
  phase text not null constraint equipment_signature_operations_phase_check check (phase in ('handover', 'return')),
  actor_id uuid not null,
  object_path text not null unique constraint equipment_signature_operations_object_path_check check (
    object_path ~ '^equipment-requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(handover|return)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  ),
  state text not null constraint equipment_signature_operations_state_check check (state in ('pending', 'adopted', 'rejected')),
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz
);

alter table public.equipment_signature_operations
  add column cleanup_state text not null default 'none' check (cleanup_state in ('none','claimed','retry','deleted','missing')),
  add column cleanup_claim_token uuid,
  add column cleanup_claimed_at timestamptz,
  add column cleanup_completed_at timestamptz,
  add column cleanup_last_error text,
  add constraint equipment_signature_operations_cleanup_coherence check ((cleanup_state = 'claimed' and cleanup_claim_token is not null and cleanup_claimed_at is not null and cleanup_completed_at is null) or (cleanup_state in ('deleted','missing') and cleanup_completed_at is not null and cleanup_claim_token is null) or (cleanup_state in ('none','retry') and cleanup_claim_token is null));

alter table public.equipment_signature_operations enable row level security;
revoke all on table public.equipment_signature_operations from public, anon, authenticated;
create unique index equipment_signature_operations_pending_actor_idx
  on public.equipment_signature_operations(request_id, phase, actor_id)
  where state = 'pending';
create index equipment_signature_operations_request_idx
  on public.equipment_signature_operations(request_id, phase);
create index equipment_signature_operations_cleanup_claim_idx on public.equipment_signature_operations(cleanup_state, state, created_at);

create or replace function private.guard_equipment_request_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;

  if old.status not in ('new', 'preparing')
    and (
      new.class_schedule_id is distinct from old.class_schedule_id
      or new.semester is distinct from old.semester
      or new.registrant_id is distinct from old.registrant_id
      or new.responsible_lecturer_id is distinct from old.responsible_lecturer_id
      or new.phone_snapshot is distinct from old.phone_snapshot
      or new.email_snapshot is distinct from old.email_snapshot
      or new.receive_at is distinct from old.receive_at
      or new.return_at is distinct from old.return_at
      or new.note is distinct from old.note
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Chỉ có thể điều chỉnh phiếu trạng thái Mới hoặc Đã soạn.' using errcode = '42501';
  end if;

  if (select private.has_role('admin')) or (select private.has_role('staff')) then
    if new.status is distinct from old.status
      or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
      or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
      or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signature_storage_path is distinct from old.handover_recipient_signature_storage_path
      or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
      or new.handover_effective_at is distinct from old.handover_effective_at
      or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
      or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
      or new.return_recipient_signature is distinct from old.return_recipient_signature
      or new.return_recipient_signature_storage_path is distinct from old.return_recipient_signature_storage_path
      or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
      or new.return_effective_at is distinct from old.return_effective_at then
      raise exception 'Vui lòng dùng luồng xác nhận trạng thái phiếu.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.registrant_id is distinct from old.registrant_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.status is distinct from old.status
    or new.handover_file_url is distinct from old.handover_file_url
    or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
    or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
    or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signature_storage_path is distinct from old.handover_recipient_signature_storage_path
    or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
    or new.handover_effective_at is distinct from old.handover_effective_at
    or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
    or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
    or new.return_recipient_signature is distinct from old.return_recipient_signature
      or new.return_recipient_signature_storage_path is distinct from old.return_recipient_signature_storage_path
    or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
    or new.return_effective_at is distinct from old.return_effective_at
    or new.phone_snapshot is distinct from old.phone_snapshot
    or new.email_snapshot is distinct from old.email_snapshot then
    raise exception 'Người đăng ký chỉ được điều chỉnh nội dung phiếu.' using errcode = '42501';
  end if;

  select schedules.schedule_date, rooms.room_type_id
  into target_schedule_date, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id
    and schedules.schedule_status <> 'cancelled';

  if target_schedule_date is null
    or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
  end if;

  if (new.receive_at at time zone 'Asia/Ho_Chi_Minh')::date > target_schedule_date then
    raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode = '22023';
  end if;

  if new.responsible_lecturer_id <> new.registrant_id
    and not exists (
      select 1
      from public.list_scoped_lecturers(target_room_type_id) as lecturers
      where lecturers.id = new.responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace function public.manager_confirm_equipment_status(
  target_request_id uuid,
  target_status text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  current_rank integer;
  target_rank integer;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được chuyển trạng thái phiếu.' using errcode = '42501';
  end if;
  if target_status not in ('new','preparing','handed_over','returned','completed') then
    raise exception 'Trạng thái phiếu không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row from public.equipment_requests
  where id = target_request_id for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  current_rank := case current_row.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  target_rank := case target_status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_rank < current_rank then
    update public.equipment_requests
    set status = target_status,
        handover_staff_confirmed_by = case when target_rank >= 2 then handover_staff_confirmed_by else null end,
        handover_staff_confirmed_at = case when target_rank >= 2 then handover_staff_confirmed_at else null end,
        handover_recipient_signature = case when target_rank >= 2 then handover_recipient_signature else null end,
        handover_recipient_signature_storage_path = case when target_rank >= 2 then handover_recipient_signature_storage_path else null end,
        handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
        handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
        return_staff_confirmed_by = null,
        return_staff_confirmed_at = null,
        return_recipient_signature = null,
        return_recipient_signature_storage_path = null,
        return_recipient_signed_at = null,
        return_effective_at = null
    where id = target_request_id returning * into changed_row;
    return changed_row;
  end if;

  if target_status = current_row.status
    and target_status not in ('handed_over','returned') then
    return current_row;
  end if;
  if target_status = 'preparing' then
    update public.equipment_requests set status = 'preparing'
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'handed_over' then
    if current_row.status = 'new' then
      raise exception 'Phải chuyển phiếu sang Đã soạn trước khi xác nhận Đã giao.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_staff_confirmed_by = actor_id,
        handover_staff_confirmed_at = clock_timestamp(),
        status = case when handover_recipient_signature is not null or handover_recipient_signature_storage_path is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_staff_confirmed_by = actor_id,
        return_staff_confirmed_at = clock_timestamp(),
        status = case when return_recipient_signature is not null or return_recipient_signature_storage_path is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

create or replace function public.reserve_equipment_signature(
  target_request_id uuid,
  target_phase text
)
returns table(operation_id uuid, object_path text, state text)
language plpgsql security definer set search_path = '' as $$
declare
  request_row public.equipment_requests;
  existing public.equipment_signature_operations;
  current_actor_id uuid := (select auth.uid());
  new_id uuid := gen_random_uuid();
  new_path text;
begin
  if current_actor_id is null or not (select private.is_active_user()) then raise exception 'EQUIPMENT_SIGNATURE_AUTH_REQUIRED' using errcode = '42501'; end if;
  if target_phase not in ('handover', 'return') then raise exception 'EQUIPMENT_SIGNATURE_PHASE_INVALID' using errcode = '22023'; end if;
  select * into request_row from public.equipment_requests where id = target_request_id for update;
  if request_row.id is null then raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.class_schedules schedules where schedules.id = request_row.class_schedule_id and schedules.schedule_status <> 'cancelled') then raise exception 'EQUIPMENT_REQUEST_CANCELLED' using errcode = '22023'; end if;
  if current_actor_id not in (request_row.registrant_id, request_row.responsible_lecturer_id) then raise exception 'EQUIPMENT_SIGNATURE_SIGNER_REQUIRED' using errcode = '42501'; end if;
  if target_phase = 'handover' then
    if request_row.handover_recipient_signature is not null or request_row.handover_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode = '22023'; end if;
    if request_row.status not in ('new','preparing','handed_over') or (request_row.handover_staff_confirmed_at is null and request_row.status <> 'handed_over') then raise exception 'EQUIPMENT_HANDOVER_PREREQUISITE_REQUIRED' using errcode = '22023'; end if;
  else
    if request_row.return_recipient_signature is not null or request_row.return_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode = '22023'; end if;
    if request_row.status not in ('handed_over','returned') then raise exception 'EQUIPMENT_RETURN_PREREQUISITE_REQUIRED' using errcode = '22023'; end if;
  end if;
  select * into existing from public.equipment_signature_operations as operations where operations.request_id = target_request_id and operations.phase = target_phase and operations.actor_id = current_actor_id and operations.state = 'pending' for update;
  if existing.id is not null then return query select existing.id, existing.object_path, existing.state; return; end if;
  new_path := format('equipment-requests/%s/%s/%s.png', lower(target_request_id::text), target_phase, lower(new_id::text));
  insert into public.equipment_signature_operations(id,request_id,phase,actor_id,object_path,state) values (new_id,target_request_id,target_phase,current_actor_id,new_path,'pending');
  return query select new_id,new_path,'pending'::text;
end;
$$;

create or replace function public.get_equipment_signature_operation_status(target_operation_id uuid)
returns table(operation_id uuid, state text, request_id uuid, phase text, object_path text)
language sql security definer set search_path = '' as $$
  select id, state, request_id, phase, object_path
  from public.equipment_signature_operations
  where id = target_operation_id and actor_id = (select auth.uid())
$$;

create or replace function public.finalize_equipment_signature(target_operation_id uuid)
returns public.equipment_requests
language plpgsql security definer set search_path = '' as $$
declare
  operation_row public.equipment_signature_operations;
  request_row public.equipment_requests;
  changed_row public.equipment_requests;
  current_actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  class_start_at timestamptz;
begin
  if current_actor_id is null or not (select private.is_active_user()) then raise exception 'EQUIPMENT_SIGNATURE_AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into operation_row from public.equipment_signature_operations where id = target_operation_id for update;
  if operation_row.id is null then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation_row.actor_id <> current_actor_id then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_OWNER_REQUIRED' using errcode = '42501'; end if;
  select * into request_row from public.equipment_requests where id = operation_row.request_id for update;
  if request_row.id is null then raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.class_schedules schedules where schedules.id = request_row.class_schedule_id and schedules.schedule_status <> 'cancelled') then raise exception 'EQUIPMENT_REQUEST_CANCELLED' using errcode = '22023'; end if;
  if operation_row.state = 'adopted' then return request_row; end if;
  if operation_row.state <> 'pending' then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_REJECTED' using errcode = '22023'; end if;
  if current_actor_id not in (request_row.registrant_id, request_row.responsible_lecturer_id) then
    update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
    raise exception 'EQUIPMENT_SIGNATURE_SIGNER_REQUIRED' using errcode = '42501';
  end if;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  select ((s.schedule_date + s.start_time) at time zone 'Asia/Ho_Chi_Minh') into class_start_at from public.class_schedules s where s.id=request_row.class_schedule_id;
  if operation_row.phase = 'handover' then
    if request_row.handover_recipient_signature is not null or request_row.handover_recipient_signature_storage_path is not null or request_row.status not in ('new','preparing','handed_over') or (request_row.handover_staff_confirmed_at is null and request_row.status <> 'handed_over') then
      update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
      raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED_OR_INVALID' using errcode = '22023';
    end if;
    update public.equipment_requests set handover_recipient_signature_storage_path=operation_row.object_path,handover_recipient_signed_at=signed_at_value,handover_effective_at=case when signed_at_value>class_start_at then receive_at else signed_at_value end,status=case when handover_staff_confirmed_at is not null then 'handed_over' else status end where id=request_row.id returning * into changed_row;
  else
    if request_row.return_recipient_signature is not null or request_row.return_recipient_signature_storage_path is not null or request_row.status not in ('handed_over','returned') then
      update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
      raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED_OR_INVALID' using errcode = '22023';
    end if;
    update public.equipment_requests set return_recipient_signature_storage_path=operation_row.object_path,return_recipient_signed_at=signed_at_value,return_effective_at=case when signed_at_value<return_at then return_at else signed_at_value end,status=case when return_staff_confirmed_at is not null then 'completed' else status end where id=request_row.id returning * into changed_row;
  end if;
  update public.equipment_signature_operations set state='adopted', finalized_at=clock_timestamp() where id=operation_row.id;
  return changed_row;
end;
$$;

revoke execute on function public.registrant_confirm_equipment_handoff(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.reserve_equipment_signature(uuid,text) from public, anon;
grant execute on function public.reserve_equipment_signature(uuid,text) to authenticated;
revoke execute on function public.get_equipment_signature_operation_status(uuid) from public, anon;
grant execute on function public.get_equipment_signature_operation_status(uuid) to authenticated;
revoke execute on function public.finalize_equipment_signature(uuid) from public, anon;
grant execute on function public.finalize_equipment_signature(uuid) to authenticated;

create or replace function private.guard_equipment_signature_cleanup_fence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.cleanup_state = 'claimed' and new.state = 'adopted' then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_CLAIMED' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger equipment_signature_operations_cleanup_fence before update on public.equipment_signature_operations for each row execute function private.guard_equipment_signature_cleanup_fence();

create or replace function public.claim_equipment_signature_cleanup_candidates(target_pending_before timestamptz, target_rejected_before timestamptz, target_claimed_before timestamptz, target_limit integer, target_claim_token uuid)
returns table(operation_id uuid, request_id uuid, phase text, object_path text, operation_state text, cleanup_claim_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if target_pending_before is null or target_rejected_before is null or target_claimed_before is null or target_claim_token is null or target_limit not between 1 and 100 then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_INPUT_INVALID' using errcode = '22023'; end if;
  return query with candidates as (
    select o.id from public.equipment_signature_operations o where o.state in ('pending','rejected') and ((o.state='pending' and o.created_at < target_pending_before) or (o.state='rejected' and coalesce(o.finalized_at,o.created_at) < target_rejected_before)) and (o.cleanup_state in ('none','retry') or (o.cleanup_state='claimed' and o.cleanup_claimed_at < target_claimed_before and o.cleanup_claim_token is distinct from target_claim_token)) and not exists (select 1 from public.equipment_requests r where r.handover_recipient_signature_storage_path=o.object_path or r.return_recipient_signature_storage_path=o.object_path) order by o.created_at for update skip locked limit target_limit
  ), claimed as (
    update public.equipment_signature_operations o set cleanup_state='claimed', cleanup_claim_token=target_claim_token, cleanup_claimed_at=clock_timestamp(), cleanup_completed_at=null, cleanup_last_error=null from candidates c where o.id=c.id returning o.id,o.request_id,o.phase,o.object_path,o.state,o.cleanup_claim_token
  ) select claimed_rows.id,claimed_rows.request_id,claimed_rows.phase,claimed_rows.object_path,claimed_rows.state,claimed_rows.cleanup_claim_token from claimed as claimed_rows;
end;
$$;

create or replace function public.ack_equipment_signature_cleanup(target_operation_id uuid, target_claim_token uuid, target_outcome text, target_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare row public.equipment_signature_operations;
begin
  if target_operation_id is null or target_claim_token is null or target_outcome not in ('deleted','missing','retry') or length(coalesce(target_error,'')) > 500 then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_INPUT_INVALID' using errcode='22023'; end if;
  select * into row from public.equipment_signature_operations where id=target_operation_id for update;
  if row.id is null or row.cleanup_state <> 'claimed' or row.cleanup_claim_token <> target_claim_token then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_CLAIM_REQUIRED' using errcode='42501'; end if;
  update public.equipment_signature_operations set cleanup_state=target_outcome, cleanup_claim_token=null, cleanup_completed_at=case when target_outcome in ('deleted','missing') then clock_timestamp() else null end, cleanup_last_error=case when target_outcome='retry' then target_error else null end where id=row.id;
end;
$$;
revoke all on function private.guard_equipment_signature_cleanup_fence() from public, anon, authenticated;
revoke execute on function public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid) from public, anon, authenticated;
revoke execute on function public.ack_equipment_signature_cleanup(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid) to service_role;
grant execute on function public.ack_equipment_signature_cleanup(uuid,uuid,text,text) to service_role;
