set check_function_bodies = false;

create table public.basic_medical_equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  item_name text not null check (btrim(item_name) <> ''),
  commercial_name text,
  item_type text,
  country_of_origin text,
  manufacturer text,
  model text,
  unit text not null check (btrim(unit) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (item_name, commercial_name, model)
);

create table public.basic_medical_room_inventory (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  catalog_item_id uuid not null references public.basic_medical_equipment_catalog(id) on delete restrict,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  good_quantity integer not null default 0 check (good_quantity >= 0),
  damaged_quantity integer not null default 0 check (damaged_quantity >= 0),
  is_active boolean not null default true,
  last_damage_reporter_id uuid references public.profiles(id) on delete set null,
  last_damage_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint basic_medical_inventory_quantity_balance
    check (total_quantity = good_quantity + damaged_quantity),
  unique (room_id, catalog_item_id)
);

create table public.basic_medical_session_confirmations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.basic_medical_registration_sessions(id) on delete set null,
  registration_id_snapshot uuid not null,
  class_schedule_id_snapshot uuid not null,
  signer_id uuid not null references public.profiles(id) on delete restrict,
  signature_data text not null check (
    length(signature_data) between 100 and 400000
    and signature_data like 'data:image/png;base64,%'
  ),
  schedule_date_snapshot date not null,
  start_time_snapshot time not null,
  end_time_snapshot time not null,
  room_id_snapshot uuid not null references public.rooms(id) on delete restrict,
  teaching_lecturer_id_snapshot uuid not null references public.profiles(id) on delete restrict,
  signed_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  created_at timestamptz not null default now()
);

create unique index basic_medical_confirmations_active_session_idx
  on public.basic_medical_session_confirmations (session_id)
  where session_id is not null and invalidated_at is null;
create index basic_medical_confirmations_registration_idx
  on public.basic_medical_session_confirmations (registration_id_snapshot, invalidated_at, signed_at desc);

create table public.basic_medical_session_equipment_checks (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.basic_medical_session_confirmations(id) on delete cascade,
  inventory_id uuid not null references public.basic_medical_room_inventory(id) on delete restrict,
  item_name_snapshot text not null,
  commercial_name_snapshot text,
  unit_snapshot text not null,
  total_before integer not null check (total_before >= 0),
  good_before integer not null check (good_before >= 0),
  damaged_before integer not null check (damaged_before >= 0),
  newly_damaged_quantity integer not null default 0 check (newly_damaged_quantity >= 0),
  good_after integer not null check (good_after >= 0),
  damaged_after integer not null check (damaged_after >= 0),
  created_at timestamptz not null default now(),
  unique (confirmation_id, inventory_id),
  constraint basic_medical_checks_before_balance
    check (total_before = good_before + damaged_before),
  constraint basic_medical_checks_after_balance
    check (total_before = good_after + damaged_after)
);

create table public.basic_medical_equipment_condition_logs (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.basic_medical_room_inventory(id) on delete restrict,
  confirmation_id uuid references public.basic_medical_session_confirmations(id) on delete set null,
  event_type text not null check (
    event_type in ('damage_report', 'condition_adjustment', 'stock_adjustment')
  ),
  total_before integer not null check (total_before >= 0),
  good_before integer not null check (good_before >= 0),
  damaged_before integer not null check (damaged_before >= 0),
  total_after integer not null check (total_after >= 0),
  good_after integer not null check (good_after >= 0),
  damaged_after integer not null check (damaged_after >= 0),
  quantity_delta integer not null default 0,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  constraint basic_medical_logs_before_balance
    check (total_before = good_before + damaged_before),
  constraint basic_medical_logs_after_balance
    check (total_after = good_after + damaged_after)
);

create index basic_medical_catalog_active_name_idx
  on public.basic_medical_equipment_catalog (is_active, item_name, commercial_name);
create index basic_medical_inventory_room_idx
  on public.basic_medical_room_inventory (room_id, is_active, catalog_item_id);
create index basic_medical_inventory_damaged_idx
  on public.basic_medical_room_inventory (damaged_quantity desc, last_damage_reported_at desc)
  where damaged_quantity > 0;
create index basic_medical_checks_confirmation_idx
  on public.basic_medical_session_equipment_checks (confirmation_id, inventory_id);
create index basic_medical_condition_logs_inventory_idx
  on public.basic_medical_equipment_condition_logs (inventory_id, created_at desc);
create index basic_medical_condition_logs_actor_idx
  on public.basic_medical_equipment_condition_logs (actor_id, created_at desc);

create trigger basic_medical_equipment_catalog_set_updated_at
before update on public.basic_medical_equipment_catalog
for each row execute function private.set_updated_at();

create trigger basic_medical_room_inventory_set_updated_at
before update on public.basic_medical_room_inventory
for each row execute function private.set_updated_at();

alter table public.basic_medical_equipment_catalog enable row level security;
alter table public.basic_medical_room_inventory enable row level security;
alter table public.basic_medical_session_confirmations enable row level security;
alter table public.basic_medical_session_equipment_checks enable row level security;
alter table public.basic_medical_equipment_condition_logs enable row level security;

create policy basic_medical_equipment_catalog_select
on public.basic_medical_equipment_catalog for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)
    )
  )
);

create policy basic_medical_equipment_catalog_manage
on public.basic_medical_equipment_catalog for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')))
with check ((select private.has_role('admin')) or (select private.has_role('staff')));

create policy basic_medical_room_inventory_select
on public.basic_medical_room_inventory for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)
    )
  )
);

create policy basic_medical_room_inventory_manage
on public.basic_medical_room_inventory for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')))
with check ((select private.has_role('admin')) or (select private.has_role('staff')));

create policy basic_medical_session_confirmations_select
on public.basic_medical_session_confirmations for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)
    )
  )
);

create policy basic_medical_session_checks_select
on public.basic_medical_session_equipment_checks for select to authenticated
using (
  exists (
    select 1
    from public.basic_medical_session_confirmations as confirmations
    where confirmations.id = confirmation_id
  )
);

create policy basic_medical_condition_logs_manager_select
on public.basic_medical_equipment_condition_logs for select to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')));

grant select, insert, update, delete
  on public.basic_medical_equipment_catalog, public.basic_medical_room_inventory
  to authenticated;
grant select
  on public.basic_medical_session_confirmations,
     public.basic_medical_session_equipment_checks,
     public.basic_medical_equipment_condition_logs
  to authenticated;
grant select, insert, update, delete
  on public.basic_medical_equipment_catalog,
     public.basic_medical_room_inventory,
     public.basic_medical_session_confirmations,
     public.basic_medical_session_equipment_checks,
     public.basic_medical_equipment_condition_logs
  to service_role;

drop policy if exists basic_medical_registrations_select
on public.basic_medical_registrations;

create policy basic_medical_registrations_select
on public.basic_medical_registrations for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      (
        select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)
      )
      and (
        created_by = (select auth.uid())
        or registrant_id = (select auth.uid())
        or responsible_lecturer_id = (select auth.uid())
        or (select private.has_role('viewer'))
        or exists (
          select 1
          from public.basic_medical_registration_sessions as sessions
          where sessions.registration_id = basic_medical_registrations.id
            and sessions.teaching_lecturer_id = (select auth.uid())
        )
      )
    )
  )
);

create or replace function private.invalidate_basic_medical_confirmation_on_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.room_id is distinct from new.room_id
    or old.schedule_date is distinct from new.schedule_date
    or old.start_time is distinct from new.start_time
    or old.end_time is distinct from new.end_time
    or old.lecturer_id is distinct from new.lecturer_id then
    update public.basic_medical_session_confirmations as confirmations
    set invalidated_at = coalesce(confirmations.invalidated_at, clock_timestamp()),
        invalidated_reason = coalesce(
          confirmations.invalidated_reason,
          'Thông tin phòng, thời gian hoặc Giảng viên giảng dạy/hướng dẫn đã thay đổi.'
        )
    from public.basic_medical_registration_sessions as sessions
    where sessions.class_schedule_id = new.id
      and confirmations.session_id = sessions.id
      and confirmations.invalidated_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists class_schedules_invalidate_basic_medical_confirmation
on public.class_schedules;
create trigger class_schedules_invalidate_basic_medical_confirmation
after update of room_id, schedule_date, start_time, end_time, lecturer_id
on public.class_schedules
for each row execute function private.invalidate_basic_medical_confirmation_on_schedule_change();

create or replace function private.invalidate_basic_medical_confirmation_on_session_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.basic_medical_session_confirmations
  set invalidated_at = coalesce(invalidated_at, clock_timestamp()),
      invalidated_reason = coalesce(invalidated_reason, 'Buổi học đã bị xóa hoặc thay thế.'),
      session_id = null
  where session_id = old.id;
  return old;
end;
$$;

drop trigger if exists basic_medical_sessions_invalidate_confirmation_on_delete
on public.basic_medical_registration_sessions;
create trigger basic_medical_sessions_invalidate_confirmation_on_delete
before delete on public.basic_medical_registration_sessions
for each row execute function private.invalidate_basic_medical_confirmation_on_session_delete();

create or replace function public.confirm_basic_medical_session(
  target_session_id uuid,
  target_signature_data text,
  target_checks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  local_signed_at timestamp;
  earliest_confirmation_at timestamp;
  session_row record;
  inventory_row record;
  confirmation_id_value uuid;
  inventory_count integer;
  newly_damaged integer;
  signature_bytes bytea;
  damaged_items jsonb := '[]'::jsonb;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501';
  end if;
  if target_signature_data is null
    or length(target_signature_data) not between 100 and 400000
    or target_signature_data not like 'data:image/png;base64,%' then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end if;
  begin
    signature_bytes := decode(split_part(target_signature_data, ',', 2), 'base64');
  exception when others then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end;
  if substring(signature_bytes from 1 for 8) <> decode('iVBORw0KGgo=', 'base64') then
    raise exception 'Chữ ký phải là ảnh PNG.' using errcode = '22023';
  end if;
  if target_checks is null or jsonb_typeof(target_checks) <> 'array' then
    raise exception 'Danh sách tình trạng thiết bị không hợp lệ.' using errcode = '22023';
  end if;

  select sessions.id, sessions.registration_id, sessions.class_schedule_id,
         sessions.teaching_lecturer_id, schedules.schedule_date,
         schedules.start_time, schedules.end_time, schedules.room_id,
         schedules.schedule_status, rooms.room_code, rooms.room_name,
         rooms.building_code
  into session_row
  from public.basic_medical_registration_sessions as sessions
  join public.class_schedules as schedules on schedules.id = sessions.class_schedule_id
  join public.rooms as rooms on rooms.id = schedules.room_id
  where sessions.id = target_session_id
  for update of sessions, schedules;

  if session_row.id is null or session_row.schedule_status = 'cancelled' then
    raise exception 'Không tìm thấy buổi học có thể xác nhận.' using errcode = 'P0002';
  end if;
  if session_row.teaching_lecturer_id <> actor_id then
    raise exception 'Chỉ Giảng viên giảng dạy/hướng dẫn của buổi được ký xác nhận.' using errcode = '42501';
  end if;
  local_signed_at := signed_at_value at time zone 'Asia/Ho_Chi_Minh';
  earliest_confirmation_at :=
    session_row.schedule_date + session_row.end_time - interval '1 hour';
  if local_signed_at < earliest_confirmation_at then
    raise exception 'Chỉ được xác nhận từ %.',
      to_char(earliest_confirmation_at, 'HH24:MI DD/MM/YYYY')
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.basic_medical_session_confirmations
    where session_id = target_session_id and invalidated_at is null
  ) then
    raise exception 'Buổi học đã được xác nhận.' using errcode = '23505';
  end if;

  select count(*)::integer into inventory_count
  from public.basic_medical_room_inventory as inventory
  join public.basic_medical_equipment_catalog as catalog
    on catalog.id = inventory.catalog_item_id
  where inventory.room_id = session_row.room_id
    and inventory.is_active
    and catalog.is_active;

  if jsonb_array_length(target_checks) <> inventory_count
    or exists (
      select 1
      from jsonb_array_elements(target_checks) as item
      where coalesce(item->>'inventory_id', '') !~
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         or coalesce(item->>'newly_damaged_quantity', '') !~ '^\d+$'
    )
    or (
      select count(distinct item->>'inventory_id')
      from jsonb_array_elements(target_checks) as item
    ) <> inventory_count
    or exists (
      select 1
      from jsonb_array_elements(target_checks) as item
      left join public.basic_medical_room_inventory as inventory
        on inventory.id = (item->>'inventory_id')::uuid
       and inventory.room_id = session_row.room_id
       and inventory.is_active
      left join public.basic_medical_equipment_catalog as catalog
        on catalog.id = inventory.catalog_item_id and catalog.is_active
      where inventory.id is null or catalog.id is null
    ) then
    raise exception 'Danh sách tình trạng thiết bị không khớp với phòng.' using errcode = '22023';
  end if;

  insert into public.basic_medical_session_confirmations (
    session_id, registration_id_snapshot, class_schedule_id_snapshot,
    signer_id, signature_data, schedule_date_snapshot,
    start_time_snapshot, end_time_snapshot, room_id_snapshot,
    teaching_lecturer_id_snapshot, signed_at
  ) values (
    session_row.id, session_row.registration_id, session_row.class_schedule_id,
    actor_id, target_signature_data, session_row.schedule_date,
    session_row.start_time, session_row.end_time, session_row.room_id,
    session_row.teaching_lecturer_id, signed_at_value
  ) returning id into confirmation_id_value;

  for inventory_row in
    select inventory.*, catalog.item_name, catalog.commercial_name, catalog.unit
    from public.basic_medical_room_inventory as inventory
    join public.basic_medical_equipment_catalog as catalog
      on catalog.id = inventory.catalog_item_id
    where inventory.room_id = session_row.room_id
      and inventory.is_active
      and catalog.is_active
    order by inventory.id
    for update of inventory
  loop
    select (item->>'newly_damaged_quantity')::integer
    into newly_damaged
    from jsonb_array_elements(target_checks) as item
    where (item->>'inventory_id')::uuid = inventory_row.id;

    if newly_damaged is null or newly_damaged < 0
      or newly_damaged > inventory_row.good_quantity then
      raise exception 'Số lượng hư mới của % không hợp lệ.', inventory_row.item_name
        using errcode = '22023';
    end if;

    insert into public.basic_medical_session_equipment_checks (
      confirmation_id, inventory_id, item_name_snapshot,
      commercial_name_snapshot, unit_snapshot, total_before,
      good_before, damaged_before, newly_damaged_quantity,
      good_after, damaged_after
    ) values (
      confirmation_id_value, inventory_row.id, inventory_row.item_name,
      inventory_row.commercial_name, inventory_row.unit,
      inventory_row.total_quantity, inventory_row.good_quantity,
      inventory_row.damaged_quantity, newly_damaged,
      inventory_row.good_quantity - newly_damaged,
      inventory_row.damaged_quantity + newly_damaged
    );

    if newly_damaged > 0 then
      update public.basic_medical_room_inventory
      set good_quantity = good_quantity - newly_damaged,
          damaged_quantity = damaged_quantity + newly_damaged,
          last_damage_reporter_id = actor_id,
          last_damage_reported_at = signed_at_value
      where id = inventory_row.id;

      insert into public.basic_medical_equipment_condition_logs (
        inventory_id, confirmation_id, event_type,
        total_before, good_before, damaged_before,
        total_after, good_after, damaged_after,
        quantity_delta, actor_id, note
      ) values (
        inventory_row.id, confirmation_id_value, 'damage_report',
        inventory_row.total_quantity, inventory_row.good_quantity,
        inventory_row.damaged_quantity, inventory_row.total_quantity,
        inventory_row.good_quantity - newly_damaged,
        inventory_row.damaged_quantity + newly_damaged,
        newly_damaged, actor_id,
        'Giảng viên báo hư khi xác nhận buổi học.'
      );

      damaged_items := damaged_items || jsonb_build_array(jsonb_build_object(
        'inventory_id', inventory_row.id,
        'item_name', inventory_row.item_name,
        'commercial_name', inventory_row.commercial_name,
        'unit', inventory_row.unit,
        'newly_damaged_quantity', newly_damaged,
        'good_quantity', inventory_row.good_quantity - newly_damaged,
        'damaged_quantity', inventory_row.damaged_quantity + newly_damaged
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'confirmation_id', confirmation_id_value,
    'signed_at', signed_at_value,
    'room_id', session_row.room_id,
    'room_code', session_row.room_code,
    'room_name', session_row.room_name,
    'building_code', session_row.building_code,
    'damaged_items', damaged_items
  );
end;
$$;

revoke all on function public.confirm_basic_medical_session(uuid, text, jsonb)
from public, anon;
grant execute on function public.confirm_basic_medical_session(uuid, text, jsonb)
to authenticated;

create or replace function public.set_basic_medical_room_inventory(
  target_inventory_id uuid,
  target_room_id uuid,
  target_catalog_item_id uuid,
  target_total_quantity integer,
  target_damaged_quantity integer,
  target_is_active boolean,
  target_note text default null
)
returns public.basic_medical_room_inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_row public.basic_medical_room_inventory;
  changed_row public.basic_medical_room_inventory;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if actor_id is null
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được cập nhật thiết bị Y cơ sở.' using errcode = '42501';
  end if;
  if target_total_quantity is null or target_total_quantity < 0
    or target_damaged_quantity is null or target_damaged_quantity < 0
    or target_damaged_quantity > target_total_quantity then
    raise exception 'Số lượng Tổng/Tốt/Hư không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rooms
    where id = target_room_id and room_type_id = basic_medical_room_type_id
  ) then
    raise exception 'Phòng Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.basic_medical_equipment_catalog
    where id = target_catalog_item_id
  ) then
    raise exception 'Thiết bị Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;

  if target_inventory_id is null then
    insert into public.basic_medical_room_inventory (
      room_id, catalog_item_id, total_quantity, good_quantity,
      damaged_quantity, is_active,
      last_damage_reporter_id, last_damage_reported_at
    ) values (
      target_room_id, target_catalog_item_id, target_total_quantity,
      target_total_quantity - target_damaged_quantity,
      target_damaged_quantity, coalesce(target_is_active, true),
      case when target_damaged_quantity > 0 then actor_id end,
      case when target_damaged_quantity > 0 then clock_timestamp() end
    ) returning * into changed_row;

    insert into public.basic_medical_equipment_condition_logs (
      inventory_id, event_type, total_before, good_before, damaged_before,
      total_after, good_after, damaged_after, quantity_delta, actor_id, note
    ) values (
      changed_row.id, 'stock_adjustment', 0, 0, 0,
      changed_row.total_quantity, changed_row.good_quantity,
      changed_row.damaged_quantity, changed_row.total_quantity,
      actor_id, nullif(btrim(target_note), '')
    );
  else
    select * into current_row
    from public.basic_medical_room_inventory
    where id = target_inventory_id for update;
    if current_row.id is null then
      raise exception 'Không tìm thấy phân bổ thiết bị.' using errcode = 'P0002';
    end if;
    if (current_row.room_id <> target_room_id
        or current_row.catalog_item_id <> target_catalog_item_id)
      and exists (
        select 1 from public.basic_medical_equipment_condition_logs
        where inventory_id = current_row.id
      ) then
      raise exception 'Thiết bị đã có lịch sử; hãy ngừng sử dụng và tạo phân bổ mới.' using errcode = '22023';
    end if;

    update public.basic_medical_room_inventory
    set room_id = target_room_id,
        catalog_item_id = target_catalog_item_id,
        total_quantity = target_total_quantity,
        good_quantity = target_total_quantity - target_damaged_quantity,
        damaged_quantity = target_damaged_quantity,
        is_active = coalesce(target_is_active, true),
        last_damage_reporter_id = case
          when target_damaged_quantity > current_row.damaged_quantity then actor_id
          else last_damage_reporter_id end,
        last_damage_reported_at = case
          when target_damaged_quantity > current_row.damaged_quantity then clock_timestamp()
          else last_damage_reported_at end
    where id = target_inventory_id
    returning * into changed_row;

    if (current_row.total_quantity, current_row.good_quantity,
        current_row.damaged_quantity, current_row.is_active)
       is distinct from
       (changed_row.total_quantity, changed_row.good_quantity,
        changed_row.damaged_quantity, changed_row.is_active) then
      insert into public.basic_medical_equipment_condition_logs (
        inventory_id, event_type, total_before, good_before, damaged_before,
        total_after, good_after, damaged_after, quantity_delta, actor_id, note
      ) values (
        changed_row.id, 'stock_adjustment', current_row.total_quantity,
        current_row.good_quantity, current_row.damaged_quantity,
        changed_row.total_quantity, changed_row.good_quantity,
        changed_row.damaged_quantity,
        changed_row.total_quantity - current_row.total_quantity,
        actor_id, nullif(btrim(target_note), '')
      );
    end if;
  end if;
  return changed_row;
exception
  when unique_violation then
    raise exception 'Thiết bị này đã được phân bổ cho phòng.' using errcode = '23505';
end;
$$;

revoke all on function public.set_basic_medical_room_inventory(uuid, uuid, uuid, integer, integer, boolean, text)
from public, anon;
grant execute on function public.set_basic_medical_room_inventory(uuid, uuid, uuid, integer, integer, boolean, text)
to authenticated;

create or replace function public.adjust_basic_medical_inventory_condition(
  target_inventory_id uuid,
  target_good_quantity integer,
  target_damaged_quantity integer,
  target_note text default null
)
returns public.basic_medical_room_inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_row public.basic_medical_room_inventory;
  changed_row public.basic_medical_room_inventory;
begin
  if actor_id is null
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được điều chỉnh tình trạng thiết bị.' using errcode = '42501';
  end if;
  select * into current_row
  from public.basic_medical_room_inventory
  where id = target_inventory_id for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy thiết bị trong phòng.' using errcode = 'P0002';
  end if;
  if target_good_quantity is null or target_damaged_quantity is null
    or target_good_quantity < 0 or target_damaged_quantity < 0
    or target_good_quantity + target_damaged_quantity <> current_row.total_quantity then
    raise exception 'Số lượng Tốt và Hư phải có tổng bằng %.', current_row.total_quantity
      using errcode = '22023';
  end if;

  update public.basic_medical_room_inventory
  set good_quantity = target_good_quantity,
      damaged_quantity = target_damaged_quantity,
      last_damage_reporter_id = case
        when target_damaged_quantity > current_row.damaged_quantity then actor_id
        else last_damage_reporter_id end,
      last_damage_reported_at = case
        when target_damaged_quantity > current_row.damaged_quantity then clock_timestamp()
        else last_damage_reported_at end
  where id = target_inventory_id returning * into changed_row;

  if (current_row.good_quantity, current_row.damaged_quantity)
     is distinct from
     (changed_row.good_quantity, changed_row.damaged_quantity) then
    insert into public.basic_medical_equipment_condition_logs (
      inventory_id, event_type, total_before, good_before, damaged_before,
      total_after, good_after, damaged_after, quantity_delta, actor_id, note
    ) values (
      changed_row.id, 'condition_adjustment', current_row.total_quantity,
      current_row.good_quantity, current_row.damaged_quantity,
      changed_row.total_quantity, changed_row.good_quantity,
      changed_row.damaged_quantity,
      changed_row.damaged_quantity - current_row.damaged_quantity,
      actor_id, nullif(btrim(target_note), '')
    );
  end if;
  return changed_row;
end;
$$;

revoke all on function public.adjust_basic_medical_inventory_condition(uuid, integer, integer, text)
from public, anon;
grant execute on function public.adjust_basic_medical_inventory_condition(uuid, integer, integer, text)
to authenticated;

create or replace view public.basic_medical_registration_completion
with (security_invoker = true)
as
select registrations.id as registration_id,
       count(sessions.id)::integer as session_count,
       count(confirmations.id)::integer as confirmed_session_count,
       (
         count(sessions.id) > 0
         and count(sessions.id) = count(confirmations.id)
       ) as is_completed
from public.basic_medical_registrations as registrations
left join public.basic_medical_registration_sessions as sessions
  on sessions.registration_id = registrations.id
left join public.basic_medical_session_confirmations as confirmations
  on confirmations.session_id = sessions.id
 and confirmations.invalidated_at is null
group by registrations.id;

grant select on public.basic_medical_registration_completion to authenticated, service_role;

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
  existing_session record;
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
          or (select private.has_role('importer'))
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
  if target_start_date is null or target_end_date is null
    or target_end_date < target_start_date then
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

    registration_id_value := target_registration_id;

    -- Delete only removed/materially changed sessions before inserting their
    -- replacements. The session delete trigger preserves the old confirmation
    -- as an invalidated historical record.
    delete from public.class_schedules as schedules
    using public.basic_medical_registration_sessions as sessions
    where sessions.registration_id = target_registration_id
      and schedules.id = sessions.class_schedule_id
      and not exists (
        select 1
        from jsonb_array_elements(target_sessions)
          with ordinality as target_item(value, session_number)
        where target_item.session_number::integer = sessions.session_number
          and schedules.room_id = target_room_id
          and schedules.schedule_date = (target_item.value->>'schedule_date')::date
          and schedules.start_time = (target_item.value->>'start_time')::time
          and schedules.end_time = (target_item.value->>'end_time')::time
          and schedules.lecturer_id = (target_item.value->>'teaching_lecturer_id')::uuid
      );

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

    select sessions.id, sessions.class_schedule_id
    into existing_session
    from public.basic_medical_registration_sessions as sessions
    where sessions.registration_id = registration_id_value
      and sessions.session_number = session_number_value;

    if existing_session.id is not null then
      update public.class_schedules
      set course_id = target_course_id,
          course_code_snapshot = course_code_value,
          course_name_snapshot = course_name_value,
          note = nullif(btrim(target_note), ''),
          student_count = target_student_count
      where id = existing_session.class_schedule_id;

      update public.basic_medical_registration_sessions
      set lesson_title = btrim(session_row.lesson_title),
          teaching_lecturer_id = session_row.teaching_lecturer_id
      where id = existing_session.id;
    else
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
    end if;
  end loop;

  return registration_id_value;
end;
$$;

revoke all on function public.save_basic_medical_registration(
  uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb
) from public, anon;
grant execute on function public.save_basic_medical_registration(
  uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb
) to authenticated;
