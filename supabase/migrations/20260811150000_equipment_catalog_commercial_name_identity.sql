do $$
declare
  invalid_row_count integer;
  duplicate_group_count integer;
begin
  select count(*)
  into invalid_row_count
  from public.equipment_catalog
  where commercial_name is null or btrim(commercial_name) = '';

  if invalid_row_count > 0 then
    raise exception
      'equipment_catalog commercial_name identity preflight failed: % null or blank rows',
      invalid_row_count
      using errcode = '23514';
  end if;

  select count(*)
  into duplicate_group_count
  from (
    select lower(btrim(commercial_name))
    from public.equipment_catalog
    group by lower(btrim(commercial_name))
    having count(*) > 1
  ) as duplicate_groups;

  if duplicate_group_count > 0 then
    raise exception
      'equipment_catalog commercial_name identity preflight failed: % duplicate normalized commercial names',
      duplicate_group_count
      using errcode = '23505';
  end if;
end;
$$;

alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_item_name_commercial_name_model_key;

alter table public.equipment_catalog
  alter column commercial_name set not null;

alter table public.equipment_catalog
  add constraint equipment_catalog_commercial_name_not_blank
  check (btrim(commercial_name) <> '');

create unique index equipment_catalog_commercial_name_normalized_key
  on public.equipment_catalog (lower(btrim(commercial_name)));
