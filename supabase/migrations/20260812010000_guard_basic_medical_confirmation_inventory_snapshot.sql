-- BUG-Y-CONFIRM-UI-001: keep confirmation snapshots aligned with the signer display.

create or replace function private.assert_basic_medical_inventory_snapshot(
  target_room_id uuid,
  target_checks jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare inventory_row record; check_item jsonb;
begin
  lock table public.basic_medical_equipment_catalog, public.basic_medical_room_inventory in share row exclusive mode;
  if jsonb_array_length(target_checks) <> (select count(*) from public.basic_medical_room_inventory as inventory join public.basic_medical_equipment_catalog as catalog on catalog.id = inventory.catalog_item_id where inventory.room_id = target_room_id and inventory.is_active and catalog.is_active) then raise exception 'Thiết bị phòng đã thay đổi. Vui lòng tải lại trước khi ký xác nhận.' using errcode = '40001'; end if;
  if (select count(distinct item->>'inventory_id') from jsonb_array_elements(target_checks) as item) <> jsonb_array_length(target_checks) then raise exception 'Thiết bị phòng đã thay đổi. Vui lòng tải lại trước khi ký xác nhận.' using errcode = '40001'; end if;
  for inventory_row in
    select inventory.*, catalog.item_name, catalog.commercial_name, catalog.unit
    from public.basic_medical_room_inventory as inventory join public.basic_medical_equipment_catalog as catalog on catalog.id = inventory.catalog_item_id
    where inventory.room_id = target_room_id and inventory.is_active and catalog.is_active
    order by inventory.id for update of inventory, catalog
  loop
    select item into check_item from jsonb_array_elements(target_checks) as item
    where (item->>'inventory_id')::uuid = inventory_row.id;
    if check_item is null
      or (check_item->>'expected_catalog_item_id')::uuid is distinct from inventory_row.catalog_item_id
      or (check_item->>'expected_total_quantity')::integer is distinct from inventory_row.total_quantity
      or (check_item->>'expected_good_quantity')::integer is distinct from inventory_row.good_quantity
      or (check_item->>'expected_damaged_quantity')::integer is distinct from inventory_row.damaged_quantity
      or check_item->>'expected_item_name' is distinct from inventory_row.item_name
      or check_item->>'expected_commercial_name' is distinct from inventory_row.commercial_name
      or check_item->>'expected_unit' is distinct from inventory_row.unit then
      raise exception 'Thiết bị phòng đã thay đổi. Vui lòng tải lại trước khi ký xác nhận.' using errcode = '40001';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(target_checks) as item left join public.basic_medical_room_inventory as inventory on inventory.id = (item->>'inventory_id')::uuid and inventory.room_id = target_room_id and inventory.is_active left join public.basic_medical_equipment_catalog as catalog on catalog.id = inventory.catalog_item_id and catalog.is_active where inventory.id is null or catalog.id is null) then raise exception 'Thiết bị phòng đã thay đổi. Vui lòng tải lại trước khi ký xác nhận.' using errcode = '40001'; end if;
end;
$$;
revoke all on function private.assert_basic_medical_inventory_snapshot(uuid, jsonb) from public, anon, authenticated;

-- Keep the established authenticated RPC contract, adding a locked display-snapshot check before confirmation insertion.
create or replace function public.confirm_basic_medical_session(target_session_id uuid, target_signature_data text, target_checks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); signed_at_value timestamptz := clock_timestamp(); local_signed_at timestamp;
  earliest_confirmation_at timestamp; session_row record; inventory_row record; confirmation_id_value uuid;
  inventory_count integer; newly_damaged integer; signature_bytes bytea; damaged_items jsonb := '[]'::jsonb;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501'; end if;
  if target_signature_data is null or length(target_signature_data) not between 100 and 400000 or target_signature_data not like 'data:image/png;base64,%' then raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023'; end if;
  begin signature_bytes := decode(split_part(target_signature_data, ',', 2), 'base64'); exception when others then raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023'; end;
  if substring(signature_bytes from 1 for 8) <> decode('iVBORw0KGgo=', 'base64') then raise exception 'Chữ ký phải là ảnh PNG.' using errcode = '22023'; end if;
  if target_checks is null or jsonb_typeof(target_checks) <> 'array' then raise exception 'Danh sách tình trạng thiết bị không hợp lệ.' using errcode = '22023'; end if;
  select sessions.id, sessions.registration_id, sessions.class_schedule_id, sessions.teaching_lecturer_id, schedules.schedule_date, schedules.start_time, schedules.end_time, schedules.room_id, schedules.schedule_status, rooms.room_code, rooms.room_name, rooms.building_code into session_row from public.basic_medical_registration_sessions as sessions join public.class_schedules as schedules on schedules.id = sessions.class_schedule_id join public.rooms as rooms on rooms.id = schedules.room_id where sessions.id = target_session_id for update of sessions, schedules;
  if session_row.id is null or session_row.schedule_status = 'cancelled' then raise exception 'Không tìm thấy buổi học có thể xác nhận.' using errcode = 'P0002'; end if;
  if session_row.teaching_lecturer_id <> actor_id then raise exception 'Chỉ Giảng viên giảng dạy/hướng dẫn của buổi được ký xác nhận.' using errcode = '42501'; end if;
  local_signed_at := signed_at_value at time zone 'Asia/Ho_Chi_Minh'; earliest_confirmation_at := session_row.schedule_date + session_row.end_time - interval '1 hour';
  if local_signed_at < earliest_confirmation_at then raise exception 'Chỉ được xác nhận từ %.', to_char(earliest_confirmation_at, 'HH24:MI DD/MM/YYYY') using errcode = '22023'; end if;
  if exists (select 1 from public.basic_medical_session_confirmations where session_id = target_session_id and invalidated_at is null) then raise exception 'Buổi học đã được xác nhận.' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_array_elements(target_checks) as item
    where coalesce(item->>'inventory_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or coalesce(item->>'newly_damaged_quantity', '') !~ '^[0-9]+$'
       or length(coalesce(item->>'newly_damaged_quantity', '')) > 10
       or (length(coalesce(item->>'newly_damaged_quantity', '')) = 10 and item->>'newly_damaged_quantity' > '2147483647')
       or coalesce(item->>'expected_catalog_item_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or coalesce(item->>'expected_total_quantity', '') !~ '^[0-9]+$'
       or length(coalesce(item->>'expected_total_quantity', '')) > 10
       or (length(coalesce(item->>'expected_total_quantity', '')) = 10 and item->>'expected_total_quantity' > '2147483647')
       or coalesce(item->>'expected_good_quantity', '') !~ '^[0-9]+$'
       or length(coalesce(item->>'expected_good_quantity', '')) > 10
       or (length(coalesce(item->>'expected_good_quantity', '')) = 10 and item->>'expected_good_quantity' > '2147483647')
       or coalesce(item->>'expected_damaged_quantity', '') !~ '^[0-9]+$'
       or length(coalesce(item->>'expected_damaged_quantity', '')) > 10
       or (length(coalesce(item->>'expected_damaged_quantity', '')) = 10 and item->>'expected_damaged_quantity' > '2147483647')
       or jsonb_typeof(item->'expected_item_name') <> 'string'
       or jsonb_typeof(item->'expected_commercial_name') not in ('string', 'null')
       or jsonb_typeof(item->'expected_unit') <> 'string'
  ) or (select count(distinct item->>'inventory_id') from jsonb_array_elements(target_checks) as item)
       <> jsonb_array_length(target_checks) then
    raise exception 'Danh sách tình trạng thiết bị không khớp với phòng.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_checks) as item
    where (item->>'newly_damaged_quantity')::integer > (item->>'expected_good_quantity')::integer
  ) then
    raise exception 'Danh sách tình trạng thiết bị không khớp với phòng.' using errcode = '22023';
  end if;
  perform private.assert_basic_medical_inventory_snapshot(session_row.room_id, target_checks);
  insert into public.basic_medical_session_confirmations (session_id, registration_id_snapshot, class_schedule_id_snapshot, signer_id, signature_data, schedule_date_snapshot, start_time_snapshot, end_time_snapshot, room_id_snapshot, teaching_lecturer_id_snapshot, signed_at) values (session_row.id, session_row.registration_id, session_row.class_schedule_id, actor_id, target_signature_data, session_row.schedule_date, session_row.start_time, session_row.end_time, session_row.room_id, session_row.teaching_lecturer_id, signed_at_value) returning id into confirmation_id_value;
  for inventory_row in select inventory.*, catalog.item_name, catalog.commercial_name, catalog.unit from public.basic_medical_room_inventory as inventory join public.basic_medical_equipment_catalog as catalog on catalog.id = inventory.catalog_item_id where inventory.room_id = session_row.room_id and inventory.is_active and catalog.is_active order by inventory.id loop
    select (item->>'newly_damaged_quantity')::integer into newly_damaged from jsonb_array_elements(target_checks) as item where (item->>'inventory_id')::uuid = inventory_row.id;
    if newly_damaged is null or newly_damaged < 0 or newly_damaged > inventory_row.good_quantity then raise exception 'Số lượng hư mới của % không hợp lệ.', inventory_row.item_name using errcode = '22023'; end if;
    insert into public.basic_medical_session_equipment_checks (confirmation_id, inventory_id, item_name_snapshot, commercial_name_snapshot, unit_snapshot, total_before, good_before, damaged_before, newly_damaged_quantity, good_after, damaged_after) values (confirmation_id_value, inventory_row.id, inventory_row.item_name, inventory_row.commercial_name, inventory_row.unit, inventory_row.total_quantity, inventory_row.good_quantity, inventory_row.damaged_quantity, newly_damaged, inventory_row.good_quantity - newly_damaged, inventory_row.damaged_quantity + newly_damaged);
    if newly_damaged > 0 then update public.basic_medical_room_inventory set good_quantity = good_quantity - newly_damaged, damaged_quantity = damaged_quantity + newly_damaged, last_damage_reporter_id = actor_id, last_damage_reported_at = signed_at_value where id = inventory_row.id; insert into public.basic_medical_equipment_condition_logs (inventory_id, confirmation_id, event_type, total_before, good_before, damaged_before, total_after, good_after, damaged_after, quantity_delta, actor_id, note) values (inventory_row.id, confirmation_id_value, 'damage_report', inventory_row.total_quantity, inventory_row.good_quantity, inventory_row.damaged_quantity, inventory_row.total_quantity, inventory_row.good_quantity - newly_damaged, inventory_row.damaged_quantity + newly_damaged, newly_damaged, actor_id, 'Giảng viên báo hư khi xác nhận buổi học.'); damaged_items := damaged_items || jsonb_build_array(jsonb_build_object('inventory_id', inventory_row.id, 'item_name', inventory_row.item_name, 'commercial_name', inventory_row.commercial_name, 'unit', inventory_row.unit, 'newly_damaged_quantity', newly_damaged, 'good_quantity', inventory_row.good_quantity - newly_damaged, 'damaged_quantity', inventory_row.damaged_quantity + newly_damaged)); end if;
  end loop;
  if jsonb_array_length(damaged_items) > 0 then perform private.enqueue_basic_medical_damage_outbox_event(confirmation_id_value, actor_id); end if;
  return jsonb_build_object('confirmation_id', confirmation_id_value, 'signed_at', signed_at_value, 'room_id', session_row.room_id, 'room_code', session_row.room_code, 'room_name', session_row.room_name, 'building_code', session_row.building_code, 'damaged_items', damaged_items);
end;
$$;
revoke all on function public.confirm_basic_medical_session(uuid, text, jsonb) from public, anon;
grant execute on function public.confirm_basic_medical_session(uuid, text, jsonb) to authenticated;
