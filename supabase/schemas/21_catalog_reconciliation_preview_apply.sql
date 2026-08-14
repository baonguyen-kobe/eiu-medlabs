-- Server-authoritative, atomic catalog reconciliation. The file is supplied as
-- normalized JSON only; preview counts are always recomputed in the database.
create or replace function private.catalog_reconciliation_plan(target_domain text, target_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; names text[] := '{}'::text[]; normalized text; plan jsonb;
begin
  if target_domain = 'skills' then
    if not ((select private.is_admin()) or (select private.has_role('staff'))) then raise exception 'CATALOG_MANAGER_REQUIRED' using errcode = '42501'; end if;
  elsif target_domain = 'basic_medical' then
    if not (select private.can_manage_basic_medical()) then raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501'; end if;
  else raise exception 'INVALID_CATALOG_DOMAIN' using errcode = '22023'; end if;
  if jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) not between 1 and 5000 then raise exception 'INVALID_CATALOG_IMPORT' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(target_rows) loop
    normalized := lower(btrim(coalesce(item->>'commercial_name','')));
    if normalized = '' or btrim(coalesce(item->>'item_name','')) = '' or btrim(coalesce(item->>'unit','')) = '' then raise exception 'CATALOG_COMMERCIAL_NAME_AND_UNIT_REQUIRED' using errcode = '22023'; end if;
    if normalized = any(names) then raise exception 'DUPLICATE_CATALOG_IMPORT_COMMERCIAL_NAME' using errcode = '22023'; end if;
    names := array_append(names, normalized);
  end loop;
  if target_domain = 'skills' then
    with file_rows as (
      select lower(btrim(value->>'commercial_name')) key, jsonb_build_object(
        'commercial_name', btrim(value->>'commercial_name'), 'item_name', btrim(value->>'item_name'),
        'item_type', nullif(btrim(value->>'item_type'), ''), 'country_of_origin', nullif(btrim(value->>'country_of_origin'), ''),
        'manufacturer', nullif(btrim(value->>'manufacturer'), ''), 'model', nullif(btrim(value->>'model'), ''), 'unit', btrim(value->>'unit')
      ) payload from jsonb_array_elements(target_rows)
    ), current_rows as (
      select c.id, lower(btrim(c.commercial_name)) key, c.is_active,
        jsonb_build_object('item_name',c.item_name,'commercial_name',c.commercial_name,'item_type',c.item_type,'country_of_origin',c.country_of_origin,'manufacturer',c.manufacturer,'model',c.model,'unit',c.unit) metadata,
        exists(select 1 from public.equipment_request_items i where i.catalog_item_id = c.id) referenced
      from public.equipment_catalog c
    ), absent as (select c.* from current_rows c where not (c.key = any(names)))
    select jsonb_build_object('updated', count(*) filter(where c.id is not null and c.is_active), 'reactivated', count(*) filter(where c.id is not null and not c.is_active), 'inserted', count(*) filter(where c.id is null), 'deactivated', (select count(*) from absent where referenced), 'deleted', (select count(*) from absent where not referenced), 'fingerprint', md5(coalesce(jsonb_agg(f.payload order by f.key)::text,'[]') || coalesce((select jsonb_agg(jsonb_build_object('id',id,'key',key,'active',is_active,'referenced',referenced,'metadata',metadata) order by key)::text from current_rows),'[]'))) into plan from file_rows f left join current_rows c on c.key = f.key;
  else
    with file_rows as (
      select lower(btrim(value->>'commercial_name')) key, jsonb_build_object(
        'commercial_name', btrim(value->>'commercial_name'), 'item_name', btrim(value->>'item_name'),
        'item_type', nullif(btrim(value->>'item_type'), ''), 'country_of_origin', nullif(btrim(value->>'country_of_origin'), ''),
        'manufacturer', nullif(btrim(value->>'manufacturer'), ''), 'model', nullif(btrim(value->>'model'), ''), 'unit', btrim(value->>'unit')
      ) payload from jsonb_array_elements(target_rows)
    ), current_rows as (
      select c.id, lower(btrim(c.commercial_name)) key, c.is_active,
        jsonb_build_object('item_name',c.item_name,'commercial_name',c.commercial_name,'item_type',c.item_type,'country_of_origin',c.country_of_origin,'manufacturer',c.manufacturer,'model',c.model,'unit',c.unit) metadata,
        exists(select 1 from public.basic_medical_room_inventory i where i.catalog_item_id = c.id)
          or exists(select 1 from public.basic_medical_equipment_condition_logs logs where logs.catalog_item_id_snapshot = c.id) referenced
      from public.basic_medical_equipment_catalog c
    ), absent as (select c.* from current_rows c where not (c.key = any(names)))
    select jsonb_build_object('updated', count(*) filter(where c.id is not null and c.is_active), 'reactivated', count(*) filter(where c.id is not null and not c.is_active), 'inserted', count(*) filter(where c.id is null), 'deactivated', (select count(*) from absent where referenced), 'deleted', (select count(*) from absent where not referenced), 'fingerprint', md5(coalesce(jsonb_agg(f.payload order by f.key)::text,'[]') || coalesce((select jsonb_agg(jsonb_build_object('id',id,'key',key,'active',is_active,'referenced',referenced,'metadata',metadata) order by key)::text from current_rows),'[]'))) into plan from file_rows f left join current_rows c on c.key = f.key;
  end if;
  return plan;
end; $$;

create or replace function public.preview_catalog_reconciliation(target_domain text, target_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return private.catalog_reconciliation_plan(target_domain, target_rows); end; $$;

create or replace function public.apply_catalog_reconciliation(target_domain text, target_rows jsonb, target_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare plan jsonb; item jsonb; row_id uuid; names text[] := '{}'::text[]; actor_id uuid := (select auth.uid());
declare old_row record;
begin
  plan := private.catalog_reconciliation_plan(target_domain, target_rows);
  if nullif(btrim(coalesce(target_fingerprint,'')),'') is null or target_fingerprint <> plan->>'fingerprint' then raise exception 'CATALOG_RECONCILIATION_STALE_PREVIEW' using errcode = 'P0001'; end if;
  -- Locks make the verified plan and all mutations one transaction.
  if target_domain = 'skills' then lock table public.equipment_catalog, public.equipment_request_items in share row exclusive mode; else lock table public.basic_medical_equipment_catalog, public.basic_medical_room_inventory, public.basic_medical_equipment_condition_logs in share row exclusive mode; end if;
  plan := private.catalog_reconciliation_plan(target_domain, target_rows);
  if target_fingerprint <> plan->>'fingerprint' then raise exception 'CATALOG_RECONCILIATION_STALE_PREVIEW' using errcode = 'P0001'; end if;
  for item in select value from jsonb_array_elements(target_rows) loop
    names := array_append(names, lower(btrim(item->>'commercial_name')));
    if target_domain = 'skills' then
      select id into row_id from public.equipment_catalog where lower(btrim(commercial_name)) = lower(btrim(item->>'commercial_name')) for update;
      if row_id is null then insert into public.equipment_catalog(item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active) values(btrim(item->>'item_name'),btrim(item->>'commercial_name'),nullif(btrim(item->>'item_type'),''),nullif(btrim(item->>'country_of_origin'),''),nullif(btrim(item->>'manufacturer'),''),nullif(btrim(item->>'model'),''),btrim(item->>'unit'),true); else update public.equipment_catalog set item_name=btrim(item->>'item_name'),commercial_name=btrim(item->>'commercial_name'),item_type=nullif(btrim(item->>'item_type'),''),country_of_origin=nullif(btrim(item->>'country_of_origin'),''),manufacturer=nullif(btrim(item->>'manufacturer'),''),model=nullif(btrim(item->>'model'),''),unit=btrim(item->>'unit'),is_active=true where id=row_id; end if;
    else
      select id into row_id from public.basic_medical_equipment_catalog where lower(btrim(commercial_name)) = lower(btrim(item->>'commercial_name')) for update;
      if row_id is null then insert into public.basic_medical_equipment_catalog(item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active) values(btrim(item->>'item_name'),btrim(item->>'commercial_name'),nullif(btrim(item->>'item_type'),''),nullif(btrim(item->>'country_of_origin'),''),nullif(btrim(item->>'manufacturer'),''),nullif(btrim(item->>'model'),''),btrim(item->>'unit'),true); else update public.basic_medical_equipment_catalog set item_name=btrim(item->>'item_name'),commercial_name=btrim(item->>'commercial_name'),item_type=nullif(btrim(item->>'item_type'),''),country_of_origin=nullif(btrim(item->>'country_of_origin'),''),manufacturer=nullif(btrim(item->>'manufacturer'),''),model=nullif(btrim(item->>'model'),''),unit=btrim(item->>'unit'),is_active=true where id=row_id; end if;
    end if;
  end loop;
  if target_domain = 'skills' then
    for old_row in select c.id, exists(select 1 from public.equipment_request_items i where i.catalog_item_id=c.id) referenced from public.equipment_catalog c where not (lower(btrim(c.commercial_name)) = any(names)) loop
      if old_row.referenced then update public.equipment_catalog set is_active=false where id=old_row.id; else delete from public.equipment_catalog where id=old_row.id; end if;
    end loop;
  else
    for old_row in select c.id, exists(select 1 from public.basic_medical_room_inventory i where i.catalog_item_id=c.id) or exists(select 1 from public.basic_medical_equipment_condition_logs logs where logs.catalog_item_id_snapshot=c.id) referenced from public.basic_medical_equipment_catalog c where not (lower(btrim(c.commercial_name)) = any(names)) loop
      if old_row.referenced then update public.basic_medical_equipment_catalog set is_active=false where id=old_row.id; else delete from public.basic_medical_equipment_catalog where id=old_row.id; end if;
    end loop;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,metadata) values(actor_id,'catalog.reconciled',target_domain,plan);
  return plan;
end; $$;

revoke all on function private.catalog_reconciliation_plan(text,jsonb) from public,anon,authenticated;
revoke all on function public.preview_catalog_reconciliation(text,jsonb), public.apply_catalog_reconciliation(text,jsonb,text) from public,anon;
grant execute on function public.preview_catalog_reconciliation(text,jsonb), public.apply_catalog_reconciliation(text,jsonb,text) to authenticated;
