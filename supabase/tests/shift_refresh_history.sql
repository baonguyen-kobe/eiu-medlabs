begin;
select plan(9);

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

select * from finish();
rollback;
