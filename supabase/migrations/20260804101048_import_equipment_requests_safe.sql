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

      insert into public.equipment_requests (
        class_schedule_id,
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
