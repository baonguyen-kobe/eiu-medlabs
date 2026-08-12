begin;
select plan(16);

insert into public.staff_shift_patterns (
  id, staff_id, weekday, start_time, end_time, shift_type,
  effective_from, effective_to, note, created_by
)
select
  '90000000-0000-0000-0000-000000000001'::uuid,
  profiles.id, 1, time '08:30', time '11:30', 'MORNING',
  date '2050-01-03', date '2050-01-23', 'pgtap-history', profiles.id
from public.profiles profiles where profiles.email = 'staff@campus.local';

select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000001'::uuid);

update public.staff_shifts set status = 'completed'
where id = (
  select id from public.staff_shifts
  where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid
  order by shift_date limit 1
);
update public.staff_shifts set
  status = 'cancelled',
  cancelled_by = (select id from public.profiles where email = 'staff@campus.local'),
  cancelled_at = timestamptz '2050-01-01 08:00:00+07'
where id = (
  select id from public.staff_shifts
  where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid
  order by shift_date offset 1 limit 1
);

select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000001'::uuid);
select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000001'::uuid);

select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid),
  3,
  'refresh idempotent and does not duplicate generated occurrences'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'completed'),
  1,
  'completed shift remains completed'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'cancelled'),
  1,
  'cancelled shift is not resurrected'
);
select isnt(
  (select cancelled_by from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'cancelled'),
  null::uuid,
  'cancellation actor is preserved'
);
select isnt(
  (select cancelled_at from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'cancelled'),
  null::timestamptz,
  'cancellation timestamp is preserved'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id from public.profiles where email = 'staff@campus.local'),
    'role', 'authenticated'
  )::text,
  true
);

select * from public.register_own_shift_pattern(
  1::smallint, 'MORNING', date '2050-01-03', date '2050-01-23', 'pgtap-replacement'
);

select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid),
  2,
  'replacing a pattern only removes unused future generated shifts'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'completed'),
  1,
  'replacement preserves completed history'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid and status = 'cancelled'),
  1,
  'replacement preserves cancelled history'
);

select public.cancel_own_shift_pattern(id)
from public.staff_shift_patterns
where note = 'pgtap-replacement' and is_active;

select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000001'::uuid),
  2,
  'cancelling the replacement cannot delete old completed/cancelled history'
);

create temporary table third_followup_clock as
select now() at time zone 'Asia/Ho_Chi_Minh' as business_now;

insert into public.staff_shift_patterns (
  id, staff_id, weekday, start_time, end_time, shift_type,
  effective_from, effective_to, note, created_by
)
select
  '90000000-0000-0000-0000-000000000010'::uuid,
  profiles.id,
  extract(isodow from clock.business_now::date - 1)::smallint,
  time '08:00', time '09:00',
  'MORNING', clock.business_now::date - 1, clock.business_now::date - 1,
  'pgtap-today-started', profiles.id
from public.profiles profiles cross join third_followup_clock clock
where profiles.email = 'admin.other@campus.local';

insert into public.staff_shift_patterns (
  id, staff_id, weekday, start_time, end_time, shift_type,
  effective_from, effective_to, note, created_by
)
select
  '90000000-0000-0000-0000-000000000011'::uuid,
  profiles.id,
  extract(isodow from clock.business_now::date + 1)::smallint,
  time '13:00', time '14:00',
  'AFTERNOON', clock.business_now::date + 1, clock.business_now::date + 1,
  'pgtap-today-future', profiles.id
from public.profiles profiles cross join third_followup_clock clock
where profiles.email = 'giangvien@campus.local';

select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000010'::uuid);
select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000011'::uuid);

select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000010'::uuid),
  0,
  'materializer does not create an occurrence whose date is already past'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000011'::uuid),
  1,
  'materializer creates an occurrence whose date is still future'
);

insert into public.staff_shifts (
  staff_id, shift_date, start_time, end_time, shift_type,
  shift_pattern_id, note, status, registration_source, created_by
)
select profiles.id, clock.business_now::date - 1,
  time '08:00', time '09:00',
  'MORNING', '90000000-0000-0000-0000-000000000010'::uuid,
  'started occurrence', 'scheduled', 'generated', profiles.id
from public.profiles profiles cross join third_followup_clock clock
where profiles.email = 'admin.other@campus.local';

select private.materialize_shift_pattern('90000000-0000-0000-0000-000000000010'::uuid);
select is(
  (select note from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000010'::uuid),
  'started occurrence',
  'refresh does not recreate or update a same-day occurrence that already started'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id from public.profiles where email = 'admin.other@campus.local'),
    'role', 'authenticated'
  )::text,
  true
);
select * from public.register_own_shift_pattern(
  extract(isodow from (select business_now from third_followup_clock))::smallint,
  'MORNING',
  (select business_now::date from third_followup_clock),
  (select business_now::date from third_followup_clock),
  'pgtap-today-replacement'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000010'::uuid),
  1,
  'pattern replacement preserves a same-day occurrence that already started'
);

select public.cancel_own_shift_pattern(id)
from public.staff_shift_patterns
where note = 'pgtap-today-replacement' and is_active;
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000010'::uuid),
  1,
  'pattern cancellation preserves a same-day occurrence that already started'
);

delete from public.staff_shifts
where shift_pattern_id in (
  '90000000-0000-0000-0000-000000000010'::uuid,
  '90000000-0000-0000-0000-000000000011'::uuid
);

select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000010'::uuid),
  1,
  'delete guard preserves a same-day generated occurrence that already started'
);
select is(
  (select count(*)::integer from public.staff_shifts where shift_pattern_id = '90000000-0000-0000-0000-000000000011'::uuid),
  0,
  'delete guard permits removal of a same-day generated occurrence still in the future'
);

select * from finish();
rollback;
