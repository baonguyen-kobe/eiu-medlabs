-- Keep this forward migration semantically identical to schema 18. The
-- previous catalog uniqueness was a multi-field fingerprint; from this point
-- commercial_name is the durable identity for active and inactive rows.
do $$
declare
  invalid_row_count integer;
  duplicate_group_count integer;
begin
  select count(*) into invalid_row_count
  from public.basic_medical_equipment_catalog
  where commercial_name is null or btrim(commercial_name) = '';

  if invalid_row_count > 0 then
    raise exception
      'basic_medical_equipment_catalog commercial_name identity preflight failed: % null or blank rows',
      invalid_row_count using errcode = '23514';
  end if;

  select count(*) into duplicate_group_count
  from (
    select lower(btrim(commercial_name))
    from public.basic_medical_equipment_catalog
    group by lower(btrim(commercial_name))
    having count(*) > 1
  ) duplicate_groups;

  if duplicate_group_count > 0 then
    raise exception
      'basic_medical_equipment_catalog commercial_name identity preflight failed: % duplicate normalized commercial names',
      duplicate_group_count using errcode = '23505';
  end if;
end;
$$;

alter table public.basic_medical_equipment_catalog
  drop constraint if exists basic_medical_equipment_catal_item_name_commercial_name_mod_key;

alter table public.basic_medical_equipment_catalog
  alter column commercial_name set not null;

alter table public.basic_medical_equipment_catalog
  add constraint basic_medical_catalog_commercial_name_not_blank
  check (btrim(commercial_name) <> '');

create unique index basic_medical_catalog_commercial_name_normalized_key
  on public.basic_medical_equipment_catalog (lower(btrim(commercial_name)));

create or replace function public.apply_basic_medical_catalog_import(
  target_mode text,
  target_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  item jsonb;
  normalized_rows jsonb := '[]'::jsonb;
  item_name_value text;
  commercial_name_value text;
  normalized_commercial_name text;
  unit_value text;
  commercial_names text[] := '{}'::text[];
  current_id uuid;
  inserted_count integer := 0;
  updated_count integer := 0;
  inactivated_count integer := 0;
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if target_mode not in ('new','all') or target_rows is null
    or jsonb_typeof(target_rows) <> 'array'
    or jsonb_array_length(target_rows) not between 1 and 5000 then
    raise exception 'INVALID_BASIC_MEDICAL_CATALOG_IMPORT' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(target_rows)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'INVALID_BASIC_MEDICAL_CATALOG_IMPORT_ROW' using errcode = '22023';
    end if;
    item_name_value := btrim(coalesce(item->>'item_name', ''));
    commercial_name_value := btrim(coalesce(item->>'commercial_name', ''));
    normalized_commercial_name := lower(commercial_name_value);
    unit_value := btrim(coalesce(item->>'unit', ''));
    if item_name_value = '' or commercial_name_value = '' or unit_value = '' then
      raise exception 'BASIC_MEDICAL_CATALOG_ITEM_COMMERCIAL_NAME_AND_UNIT_REQUIRED' using errcode = '22023';
    end if;
    if normalized_commercial_name = any(commercial_names) then
      raise exception 'DUPLICATE_BASIC_MEDICAL_CATALOG_IMPORT_COMMERCIAL_NAME' using errcode = '22023';
    end if;
    commercial_names := array_append(commercial_names, normalized_commercial_name);
    normalized_rows := normalized_rows || jsonb_build_array(jsonb_build_object(
      'item_name', item_name_value, 'commercial_name', commercial_name_value,
      'normalized_commercial_name', normalized_commercial_name,
      'item_type', nullif(btrim(coalesce(item->>'item_type', '')), ''),
      'country_of_origin', nullif(btrim(coalesce(item->>'country_of_origin', '')), ''),
      'manufacturer', nullif(btrim(coalesce(item->>'manufacturer', '')), ''),
      'model', nullif(btrim(coalesce(item->>'model', '')), ''), 'unit', unit_value
    ));
  end loop;
  for item in select value from jsonb_array_elements(normalized_rows)
  loop
    select catalog.id into current_id from public.basic_medical_equipment_catalog catalog
    where lower(btrim(catalog.commercial_name)) = item->>'normalized_commercial_name' for update;
    if current_id is null then
      insert into public.basic_medical_equipment_catalog(item_name, commercial_name, item_type, country_of_origin, manufacturer, model, unit, is_active)
      values (item->>'item_name', item->>'commercial_name', nullif(item->>'item_type',''), nullif(item->>'country_of_origin',''), nullif(item->>'manufacturer',''), nullif(item->>'model',''), item->>'unit', true);
      inserted_count := inserted_count + 1;
    elsif target_mode = 'all' then
      update public.basic_medical_equipment_catalog set item_name = item->>'item_name', commercial_name = item->>'commercial_name', item_type = nullif(item->>'item_type',''), country_of_origin = nullif(item->>'country_of_origin',''), manufacturer = nullif(item->>'manufacturer',''), model = nullif(item->>'model',''), unit = item->>'unit', is_active = true where id = current_id;
      updated_count := updated_count + 1;
    end if;
  end loop;
  if target_mode = 'all' then
    update public.basic_medical_equipment_catalog catalog set is_active = false where catalog.is_active and not (lower(btrim(catalog.commercial_name)) = any(commercial_names));
    get diagnostics inactivated_count = row_count;
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, metadata) values (actor_id, 'basic_medical.catalog_imported', 'basic_medical_equipment_catalog', jsonb_build_object('mode', target_mode, 'inserted', inserted_count, 'updated', updated_count, 'inactivated', inactivated_count));
  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count, 'inactivated', inactivated_count, 'processed', inserted_count + updated_count);
end;
$$;
revoke all on function public.apply_basic_medical_catalog_import(text,jsonb) from public, anon;
grant execute on function public.apply_basic_medical_catalog_import(text,jsonb) to authenticated;
