-- Preserve the catalog identity and display name that existed when each new
-- Basic Medical condition log was written. Existing rows intentionally stay
-- NULL: deriving a historical name from today's mutable catalog would invent
-- evidence that was never recorded at the event time.
alter table public.basic_medical_equipment_condition_logs
  add column if not exists catalog_item_id_snapshot uuid,
  add column if not exists item_name_snapshot text,
  add column if not exists commercial_name_snapshot text,
  add column if not exists unit_snapshot text;

alter table public.basic_medical_equipment_condition_logs
  drop constraint if exists basic_medical_condition_log_catalog_snapshot_valid;

alter table public.basic_medical_equipment_condition_logs
  add constraint basic_medical_condition_log_catalog_snapshot_valid check (
    (
      catalog_item_id_snapshot is null
      and item_name_snapshot is null
      and commercial_name_snapshot is null
      and unit_snapshot is null
    )
    or (
      catalog_item_id_snapshot is not null
      and item_name_snapshot is not null
      and btrim(item_name_snapshot) <> ''
      and unit_snapshot is not null
      and btrim(unit_snapshot) <> ''
    )
  );

comment on column public.basic_medical_equipment_condition_logs.catalog_item_id_snapshot is
  'Catalog identity captured for new log events; NULL means the legacy row predates snapshot capture.';
comment on column public.basic_medical_equipment_condition_logs.item_name_snapshot is
  'Catalog item name captured at event time. Existing legacy rows are deliberately not backfilled.';
comment on column public.basic_medical_equipment_condition_logs.commercial_name_snapshot is
  'Optional commercial name captured at event time; NULL is also valid for a new event.';
comment on column public.basic_medical_equipment_condition_logs.unit_snapshot is
  'Catalog unit captured at event time. Existing legacy rows are deliberately not backfilled.';

create index if not exists basic_medical_condition_logs_catalog_snapshot_idx
  on public.basic_medical_equipment_condition_logs (catalog_item_id_snapshot, created_at desc);

create or replace function private.snapshot_basic_medical_condition_log_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select
    inventory.catalog_item_id,
    catalog.item_name,
    catalog.commercial_name,
    catalog.unit
  into
    new.catalog_item_id_snapshot,
    new.item_name_snapshot,
    new.commercial_name_snapshot,
    new.unit_snapshot
  from public.basic_medical_room_inventory as inventory
  join public.basic_medical_equipment_catalog as catalog
    on catalog.id = inventory.catalog_item_id
  where inventory.id = new.inventory_id;

  if new.catalog_item_id_snapshot is null then
    raise exception 'BASIC_MEDICAL_LOG_CATALOG_NOT_FOUND' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function private.snapshot_basic_medical_condition_log_catalog()
  from public, anon, authenticated;

drop trigger if exists basic_medical_condition_log_catalog_snapshot
  on public.basic_medical_equipment_condition_logs;
create trigger basic_medical_condition_log_catalog_snapshot
before insert on public.basic_medical_equipment_condition_logs
for each row execute function private.snapshot_basic_medical_condition_log_catalog();

create or replace function public.search_basic_medical_equipment(
  target_tab text,
  target_query text default null,
  target_room_id uuid default null,
  target_catalog_item_id uuid default null,
  target_event_type text default null,
  target_actor_id uuid default null,
  target_from_date date default null,
  target_to_date date default null,
  target_status text default null,
  target_page integer default 1,
  target_page_size integer default 50
)
returns table(row_data jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  normalized_query text := lower(btrim(coalesce(target_query, '')));
  safe_page integer := greatest(coalesce(target_page, 1), 1);
  safe_size integer := least(greatest(coalesce(target_page_size, 50), 1), 50);
  can_manage boolean := (select private.can_manage_basic_medical());
begin
  if not (select private.is_active_user())
    or not ((select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)) or can_manage) then
    raise exception 'BASIC_MEDICAL_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if target_tab not in ('inventory','rooms','damaged','logs') then
    raise exception 'INVALID_BASIC_MEDICAL_EQUIPMENT_TAB' using errcode = '22023';
  end if;
  if target_tab in ('inventory','damaged','logs') and not can_manage then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  if target_tab = 'inventory' then
    return query
    select to_jsonb(catalog), count(*) over()
    from public.basic_medical_equipment_catalog catalog
    where (target_status is null or target_status = ''
      or (target_status = 'active' and catalog.is_active)
      or (target_status = 'inactive' and not catalog.is_active))
      and (normalized_query = ''
        or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.commercial_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.item_type, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(coalesce(catalog.manufacturer, '')) like '%' || normalized_query || '%'
        or lower(coalesce(catalog.model, '')) like '%' || normalized_query || '%')
    order by catalog.item_name, catalog.id
    limit safe_size offset (safe_page - 1) * safe_size;
  elsif target_tab in ('rooms','damaged') then
    return query
    select jsonb_build_object(
      'id', inventory.id, 'room_id', inventory.room_id,
      'catalog_item_id', inventory.catalog_item_id,
      'total_quantity', inventory.total_quantity, 'good_quantity', inventory.good_quantity,
      'damaged_quantity', inventory.damaged_quantity, 'is_active', inventory.is_active,
      'last_damage_reported_at', inventory.last_damage_reported_at,
      'room', to_jsonb(rooms), 'catalog', to_jsonb(catalog),
      'last_damage_reporter', case when can_manage then to_jsonb(reporter) else null end
    ), count(*) over()
    from public.basic_medical_room_inventory inventory
    join public.rooms rooms on rooms.id = inventory.room_id
    join public.basic_medical_equipment_catalog catalog on catalog.id = inventory.catalog_item_id
    left join public.profiles reporter on reporter.id = inventory.last_damage_reporter_id
    where inventory.is_active
      and (target_tab <> 'damaged' or inventory.damaged_quantity > 0)
      and (target_room_id is null or inventory.room_id = target_room_id)
      and (target_catalog_item_id is null or inventory.catalog_item_id = target_catalog_item_id)
      and (normalized_query = ''
        or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.commercial_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(rooms.room_code) like '%' || normalized_query || '%'
        or lower(rooms.building_code) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(coalesce(rooms.room_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%')
    order by rooms.building_code, rooms.room_code, catalog.item_name
    limit safe_size offset (safe_page - 1) * safe_size;
  else
    return query
    select jsonb_build_object(
      'id', logs.id, 'event_type', logs.event_type,
      'total_before', logs.total_before, 'good_before', logs.good_before,
      'damaged_before', logs.damaged_before, 'total_after', logs.total_after,
      'good_after', logs.good_after, 'damaged_after', logs.damaged_after,
      'quantity_delta', logs.quantity_delta, 'note', logs.note,
      'created_at', logs.created_at,
      'inventory', jsonb_build_object(
        'room', to_jsonb(rooms),
        'catalog', jsonb_build_object(
          'id', logs.catalog_item_id_snapshot,
          'item_name', coalesce(logs.item_name_snapshot, 'Tên lịch sử không được ghi nhận'),
          'commercial_name', logs.commercial_name_snapshot,
          'unit', logs.unit_snapshot,
          'is_historical_snapshot', logs.item_name_snapshot is not null
        )
      ),
      'actor', to_jsonb(actor)
    ), count(*) over()
    from public.basic_medical_equipment_condition_logs logs
    join public.basic_medical_room_inventory inventory on inventory.id = logs.inventory_id
    join public.rooms rooms on rooms.id = inventory.room_id
    join public.profiles actor on actor.id = logs.actor_id
    where (target_room_id is null or inventory.room_id = target_room_id)
      and (target_catalog_item_id is null
        or coalesce(logs.catalog_item_id_snapshot, inventory.catalog_item_id) = target_catalog_item_id)
      and (target_actor_id is null or logs.actor_id = target_actor_id)
      and (target_event_type is null or target_event_type = '' or logs.event_type = target_event_type)
      and (target_from_date is null or logs.created_at >= target_from_date::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (target_to_date is null or logs.created_at < (target_to_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (normalized_query = ''
        or lower(extensions.unaccent(coalesce(logs.item_name_snapshot, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(rooms.room_code) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(actor.full_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(logs.note, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%')
    order by logs.created_at desc, logs.id
    limit safe_size offset (safe_page - 1) * safe_size;
  end if;
end;
$$;

revoke all on function public.search_basic_medical_equipment(
  text,text,uuid,uuid,text,uuid,date,date,text,integer,integer
) from public, anon;
grant execute on function public.search_basic_medical_equipment(
  text,text,uuid,uuid,text,uuid,date,date,text,integer,integer
) to authenticated;
