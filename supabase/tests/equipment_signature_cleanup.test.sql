-- pgTAP Test Suite: equipment_signature_cleanup.test.sql
begin;
select plan(105);
select has_column('public','equipment_signature_operations','cleanup_state','1 cleanup state exists');
select has_column('public','equipment_signature_operations','cleanup_claim_token','2 claim token exists');
select has_column('public','equipment_signature_operations','cleanup_claimed_at','3 claim time exists');
select has_column('public','equipment_signature_operations','cleanup_completed_at','4 completion time exists');
select has_column('public','equipment_signature_operations','cleanup_last_error','5 error metadata exists');
select has_column('public','equipment_signature_operations','last_reserved_at','5a reservation lease exists');
select ok(exists(select 1 from pg_constraint where conname='equipment_signature_operations_cleanup_coherence'),'6 cleanup coherence constraint exists');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname='equipment_signature_operations_cleanup_coherence') like '%claimed%','7 claimed coherence is constrained');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname='equipment_signature_operations_cleanup_coherence') like '%deleted%','8 terminal coherence is constrained');
select ok(not has_table_privilege('authenticated','public.equipment_signature_operations','UPDATE'),'9 authenticated cannot update cleanup metadata');
select ok(not has_function_privilege('authenticated','public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)','EXECUTE'),'10 authenticated cannot claim');
select ok(not has_function_privilege('authenticated','public.ack_equipment_signature_cleanup(uuid,uuid,text,text)','EXECUTE'),'11 authenticated cannot ack');
select ok(not has_function_privilege('anon','public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)','EXECUTE'),'12 anon cannot claim');
select ok(not has_function_privilege('anon','public.ack_equipment_signature_cleanup(uuid,uuid,text,text)','EXECUTE'),'13 anon cannot ack');
select ok(has_function_privilege('service_role','public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)','EXECUTE'),'13a service role can claim');
select ok(has_function_privilege('service_role','public.ack_equipment_signature_cleanup(uuid,uuid,text,text)','EXECUTE'),'13b service role can ack');
select ok(to_regprocedure('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)') is not null,'14 claim RPC exists');
select ok(to_regprocedure('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)') is not null,'15 ack RPC exists');
select is((select pronargs from pg_proc where oid='public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure),5::smallint,'16 claim takes cutoffs limit token');
select is((select pronargs from pg_proc where oid='public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure),4::smallint,'17 ack takes operation token outcome error');
select ok(lower(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure)) like '%for update skip locked%','18 claim locks with skip locked');
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%state in (''pending'',''rejected'')%','19 only pending rejected are candidates');
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%handover_recipient_signature_storage_path%','20 handover reference blocks claim');
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%return_recipient_signature_storage_path%','21 return reference blocks claim');
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%target_claimed_before%','22 expired claims use caller cutoff');
select ok(lower(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure)) like '%last_reserved_at%target_pending_before%','22a pending eligibility uses the reservation lease');
select ok(lower(pg_get_functiondef('public.reserve_equipment_signature(uuid,text)'::regprocedure)) like '%last_reserved_at%clock_timestamp()%','22b reused reservations renew the lease');
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%target_limit not between 1 and 100%','23 claim limit is bounded');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%cleanup_claim_token <> target_claim_token%','24 ack token is bound');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%''deleted'',''missing'',''retry''%','25 ack outcomes are constrained');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%length(coalesce(target_error,'''')) > 500%','26 retry error is bounded');
select ok(to_regprocedure('private.guard_equipment_signature_cleanup_fence()') is not null,'27 finalize fence trigger function exists');
select ok(regexp_replace(lower(pg_get_functiondef('private.guard_equipment_signature_cleanup_fence()'::regprocedure)), '\s+', '', 'g') like '%old.cleanup_state<>''none''%','28 cleanup lifecycle fences adoption');
select ok(pg_get_functiondef('public.finalize_equipment_signature(uuid)'::regprocedure) like '%EQUIPMENT_SIGNATURE_CLEANUP_OWNED%','28a finalize returns a stable cleanup-owned error');
select ok(exists(select 1 from pg_trigger where tgname='equipment_signature_operations_cleanup_fence' and not tgisinternal),'29 adoption fence trigger exists');
select ok((select count(*) from pg_constraint where conname='equipment_signature_operations_state_check')=1,'30 business state remains constrained');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname='equipment_signature_operations_state_check') like '%adopted%','31 adopted state retained');
select ok(not has_function_privilege('authenticated','public.registrant_confirm_equipment_handoff(uuid,text,text)','EXECUTE'),'32 legacy signing stays revoked');
select ok(has_function_privilege('authenticated','public.finalize_equipment_signature(uuid)','EXECUTE'),'33 normal finalize permission remains');
select ok(exists(select 1 from pg_indexes where indexname='equipment_signature_operations_cleanup_claim_idx'),'34 cleanup claim index exists');
select ok(
  replace(
    regexp_replace(
      lower((
        select pg_get_expr(indexes.indpred, indexes.indrelid)
        from pg_index as indexes
        where indexes.indexrelid = 'public.equipment_signature_operations_pending_actor_idx'::regclass
      )),
      '\s+',
      '',
      'g'
    ),
    '::text',
    ''
  ) like '%state=''pending''%'
  and replace(
    regexp_replace(
      lower((
        select pg_get_expr(indexes.indpred, indexes.indrelid)
        from pg_index as indexes
        where indexes.indexrelid = 'public.equipment_signature_operations_pending_actor_idx'::regclass
      )),
      '\s+',
      '',
      'g'
    ),
    '::text',
    ''
  ) like '%cleanup_state=''none''%',
  'pending reservation index requires pending and cleanup_state none'
);

insert into public.profile_room_types (profile_id, room_type_id)
select
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid),
  '40000000-0000-0000-0000-000000000001'::uuid
on conflict do nothing;

insert into public.class_schedules (
  id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time,
  student_count, course_code_snapshot, course_name_snapshot, schedule_status,
  published_at, published_by, source, created_by
)
values (
  'e5000000-0000-0000-0000-000000000001',
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid order by id limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid order by id limit 1),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid),
  current_date + 30, '07:30', '11:30', 25, 'SIGNATURE-REGRESSION',
  'Signature reservation regression', 'published', clock_timestamp(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

insert into public.equipment_requests (
  id, class_schedule_id, registrant_id, responsible_lecturer_id, semester,
  phone_snapshot, email_snapshot, receive_at, return_at, status, created_by
)
values (
  'e2000000-0000-0000-0000-000000000101',
  'e5000000-0000-0000-0000-000000000001',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid),
  'HK1', '0901234567', 'admin@campus.local',
  ((current_date + 30)::text || ' 09:00:00 Asia/Ho_Chi_Minh')::timestamptz,
  ((current_date + 30)::text || ' 11:00:00 Asia/Ho_Chi_Minh')::timestamptz,
  'new',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

set local role authenticated;
select throws_ok(
  $$select public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover')$$,
  '22023',
  'EQUIPMENT_HANDOVER_PREREQUISITE_REQUIRED',
  'handover reserve requires staff confirmation'
);
select lives_ok(
  $$select public.manager_confirm_equipment_status('e2000000-0000-0000-0000-000000000101', 'preparing')$$,
  'manager can prepare the signature regression request'
);
select lives_ok(
  $$select public.manager_confirm_equipment_status('e2000000-0000-0000-0000-000000000101', 'handed_over')$$,
  'manager can record handover staff confirmation'
);
select throws_ok(
  $$select public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'return')$$,
  '22023',
  'EQUIPMENT_RETURN_PREREQUISITE_REQUIRED',
  'return reserve requires a completed handover'
);

create temp table reservation_a as
select * from public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover');
set local role postgres;
update public.equipment_signature_operations
set last_reserved_at = clock_timestamp() - interval '2 hours'
where id = (select operation_id from reservation_a);
create temp table reservation_a_stale_lease as
select last_reserved_at from public.equipment_signature_operations
where id = (select operation_id from reservation_a);
set local role authenticated;
create temp table reservation_a_reuse as
select * from public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover');
set local role postgres;

select is((select operation_id from reservation_a_reuse), (select operation_id from reservation_a), 'normal pending reservation reuses its operation');
select is((select object_path from reservation_a_reuse), (select object_path from reservation_a), 'normal pending reservation reuses its object path');
select is((select state from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'pending', 'normal reservation remains pending');
select is((select cleanup_state from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'none', 'normal reservation remains outside cleanup');
select ok((select last_reserved_at > (select last_reserved_at from reservation_a_stale_lease) from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'reusing a stale operation renews its lease');

set local role service_role;
create temp table renewed_lease_claim as
select * from public.claim_equipment_signature_cleanup_candidates(
  (select last_reserved_at + interval '1 hour' from reservation_a_stale_lease),
  clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 hour',
  10,
  'e4000000-0000-0000-0000-000000000100'
);
set local role postgres;
select is((select count(*)::integer from renewed_lease_claim), 0, 'a cutoff between stale and renewed leases cannot claim the reused operation');

set local role service_role;
create temp table reservation_a_claim as
select * from public.claim_equipment_signature_cleanup_candidates(
  clock_timestamp() + interval '1 hour',
  clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 hour',
  10,
  'e4000000-0000-0000-0000-000000000101'
);
set local role authenticated;
create temp table reservation_b as
select * from public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover');
set local role postgres;

select isnt((select operation_id from reservation_b), (select operation_id from reservation_a), 'claimed reservation is not reused');
select isnt((select object_path from reservation_b), (select object_path from reservation_a), 'claimed reservation does not reuse its object path');
select is((select state from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'pending', 'claimed reservation remains pending');
select is((select cleanup_state from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'claimed', 'claimed reservation remains cleanup owned');
select is((select cleanup_claim_token from public.equipment_signature_operations where id = (select operation_id from reservation_a)), 'e4000000-0000-0000-0000-000000000101'::uuid, 'claimed reservation preserves its cleanup token');
select is((select state from public.equipment_signature_operations where id = (select operation_id from reservation_b)), 'pending', 'fresh reservation after claim is pending');
select is((select cleanup_state from public.equipment_signature_operations where id = (select operation_id from reservation_b)), 'none', 'fresh reservation after claim is outside cleanup');

set local role service_role;
create temp table reservation_b_claim as
select * from public.claim_equipment_signature_cleanup_candidates(
  clock_timestamp() + interval '1 hour',
  clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 hour',
  10,
  'e4000000-0000-0000-0000-000000000102'
);
select public.ack_equipment_signature_cleanup(
  (select operation_id from reservation_b_claim),
  'e4000000-0000-0000-0000-000000000102',
  'retry',
  'transient cleanup failure'
);
set local role authenticated;
create temp table reservation_c as
select * from public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover');
set local role postgres;

select isnt((select operation_id from reservation_c), (select operation_id from reservation_b), 'retry reservation is not reused');
select isnt((select object_path from reservation_c), (select object_path from reservation_b), 'retry reservation does not reuse its object path');
select is((select state from public.equipment_signature_operations where id = (select operation_id from reservation_b)), 'pending', 'retry reservation remains pending');
select is((select cleanup_state from public.equipment_signature_operations where id = (select operation_id from reservation_b)), 'retry', 'retry reservation remains in cleanup lifecycle');
select is((select state from public.equipment_signature_operations where id = (select operation_id from reservation_c)), 'pending', 'fresh reservation after retry is pending');
select is((select cleanup_state from public.equipment_signature_operations where id = (select operation_id from reservation_c)), 'none', 'fresh reservation after retry is outside cleanup');

set local role authenticated;
select lives_ok(
  $$select public.finalize_equipment_signature((select operation_id from reservation_c))$$,
  'finalizing the fresh reservation records signature evidence'
);
select throws_ok(
  $$select public.reserve_equipment_signature('e2000000-0000-0000-0000-000000000101', 'handover')$$,
  '22023',
  'EQUIPMENT_SIGNATURE_ALREADY_SIGNED',
  'signature evidence preserves the already signed error contract'
);
set local role postgres;

insert into public.equipment_signature_operations (
  id, request_id, phase, actor_id, object_path, state, created_at,
  last_reserved_at, cleanup_state, cleanup_claim_token, cleanup_claimed_at,
  cleanup_completed_at
)
values
  ('e1000000-0000-0000-0000-000000000010', 'e2000000-0000-0000-0000-000000000101', 'handover', (select registrant_id from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), 'equipment-requests/e2000000-0000-0000-0000-000000000101/handover/e1000000-0000-0000-0000-000000000010.png', 'pending', clock_timestamp(), clock_timestamp(), 'claimed', 'e4000000-0000-0000-0000-000000000010', clock_timestamp(), null),
  ('e1000000-0000-0000-0000-000000000011', 'e2000000-0000-0000-0000-000000000101', 'handover', (select registrant_id from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), 'equipment-requests/e2000000-0000-0000-0000-000000000101/handover/e1000000-0000-0000-0000-000000000011.png', 'pending', clock_timestamp(), clock_timestamp(), 'retry', null, null, null),
  ('e1000000-0000-0000-0000-000000000012', 'e2000000-0000-0000-0000-000000000101', 'handover', (select registrant_id from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), 'equipment-requests/e2000000-0000-0000-0000-000000000101/handover/e1000000-0000-0000-0000-000000000012.png', 'pending', clock_timestamp(), clock_timestamp(), 'deleted', null, null, clock_timestamp()),
  ('e1000000-0000-0000-0000-000000000013', 'e2000000-0000-0000-0000-000000000101', 'handover', (select registrant_id from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), 'equipment-requests/e2000000-0000-0000-0000-000000000101/handover/e1000000-0000-0000-0000-000000000013.png', 'pending', clock_timestamp(), clock_timestamp(), 'missing', null, null, clock_timestamp());

set local role authenticated;
select throws_ok($$select public.finalize_equipment_signature('e1000000-0000-0000-0000-000000000010')$$, '55000', 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED', 'claimed cleanup ownership cannot be adopted');
select throws_ok($$select public.finalize_equipment_signature('e1000000-0000-0000-0000-000000000011')$$, '55000', 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED', 'retry cleanup ownership cannot be adopted');
select throws_ok($$select public.finalize_equipment_signature('e1000000-0000-0000-0000-000000000012')$$, '55000', 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED', 'deleted cleanup ownership cannot be adopted');
select throws_ok($$select public.finalize_equipment_signature('e1000000-0000-0000-0000-000000000013')$$, '55000', 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED', 'missing cleanup ownership cannot be adopted');
set local role postgres;
select is((select handover_recipient_signature_storage_path from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), (select object_path from reservation_c), 'claimed finalize leaves the request path unchanged');
select is((select handover_recipient_signature_storage_path from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), (select object_path from reservation_c), 'retry finalize leaves the request path unchanged');
select is((select handover_recipient_signature_storage_path from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), (select object_path from reservation_c), 'deleted finalize leaves the request path unchanged');
select is((select handover_recipient_signature_storage_path from public.equipment_requests where id = 'e2000000-0000-0000-0000-000000000101'), (select object_path from reservation_c), 'missing finalize leaves the request path unchanged');

insert into public.equipment_signature_operations (id,request_id,phase,actor_id,object_path,state,created_at,last_reserved_at,finalized_at) values
('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','handover','e3000000-0000-0000-0000-000000000001','equipment-requests/e2000000-0000-0000-0000-000000000001/handover/e1000000-0000-0000-0000-000000000001.png','pending','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z',null),
('e1000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','return','e3000000-0000-0000-0000-000000000002','equipment-requests/e2000000-0000-0000-0000-000000000002/return/e1000000-0000-0000-0000-000000000002.png','pending','2099-01-01T00:00:00Z','2099-01-01T00:00:00Z',null),
('e1000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000003','handover','e3000000-0000-0000-0000-000000000003','equipment-requests/e2000000-0000-0000-0000-000000000003/handover/e1000000-0000-0000-0000-000000000003.png','rejected','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z'),
('e1000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000004','return','e3000000-0000-0000-0000-000000000004','equipment-requests/e2000000-0000-0000-0000-000000000004/return/e1000000-0000-0000-0000-000000000004.png','adopted','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z');
create temp table cleanup_claims as select * from public.claim_equipment_signature_cleanup_candidates('2001-01-01T00:00:00Z','2001-01-01T00:00:00Z','2001-01-01T00:00:00Z',10,'e4000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000001'),1,'35 stale pending is claimed');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000002'),0,'36 fresh pending is excluded');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000003'),1,'37 stale rejected is claimed');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000004'),0,'38 adopted is excluded');
select is((select cleanup_state from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'claimed','39 claim state persists');
select is((select cleanup_claim_token from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'e4000000-0000-0000-0000-000000000001'::uuid,'40 claim token persists');
select ok((select cleanup_claimed_at is not null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'41 claim timestamp persists');
select throws_ok($$update public.equipment_signature_operations set state='adopted' where id='e1000000-0000-0000-0000-000000000001'$$,'55000','EQUIPMENT_SIGNATURE_CLEANUP_OWNED','42 active claim fences adoption');
select is((select state from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'pending','43 fenced row remains pending');
select throws_ok($$select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000099','deleted',null)$$,'42501','EQUIPMENT_SIGNATURE_CLEANUP_CLAIM_REQUIRED','44 wrong token is rejected');
select lives_ok($$select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','retry','retry')$$,'45 retry releases claim');
select is((select cleanup_state from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'retry','46 retry state persists');
update public.equipment_signature_operations set cleanup_state='claimed',cleanup_claim_token='e4000000-0000-0000-0000-000000000001',cleanup_claimed_at='2000-01-01T00:00:00Z',cleanup_last_error=null where id='e1000000-0000-0000-0000-000000000001';
create temp table same_token_claim as select * from public.claim_equipment_signature_cleanup_candidates('2001-01-01T00:00:00Z','2001-01-01T00:00:00Z','2001-01-01T00:00:00Z',10,'e4000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from same_token_claim),0,'47 expired claim cannot be reclaimed with the same token');
create temp table new_token_claim as select * from public.claim_equipment_signature_cleanup_candidates('2001-01-01T00:00:00Z','2001-01-01T00:00:00Z','2001-01-01T00:00:00Z',10,'e4000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from new_token_claim where operation_id='e1000000-0000-0000-0000-000000000001'),1,'48 expired claim is reclaimed with a new token');
select is((select cleanup_claim_token from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'e4000000-0000-0000-0000-000000000002'::uuid,'49 new token becomes authoritative');
select throws_ok($$select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','deleted',null)$$,'42501','EQUIPMENT_SIGNATURE_CLEANUP_CLAIM_REQUIRED','50 stale token cannot acknowledge after reclaim');

select has_column('public','equipment_signature_operations','cleanup_compensation_required_at','91 compensation marker exists');
select ok(
  not has_function_privilege('authenticated','public.mark_equipment_signature_cleanup_compensation(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.mark_equipment_signature_cleanup_compensation(uuid)','EXECUTE'),
  '92 authenticated and anon cannot mark compensation'
);
select ok(has_function_privilege('service_role','public.mark_equipment_signature_cleanup_compensation(uuid)','EXECUTE'),'93 service role can mark compensation');
select is(
  (select pg_get_function_identity_arguments('public.mark_equipment_signature_cleanup_compensation(uuid)'::regprocedure)),
  'target_operation_id uuid',
  '94 compensation marker takes operation identity only'
);

insert into public.equipment_signature_operations (
  id, request_id, phase, actor_id, object_path, state, created_at,
  last_reserved_at, cleanup_state, cleanup_claim_token, cleanup_claimed_at,
  cleanup_completed_at
)
values
  ('e1000000-0000-0000-0000-000000000020','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000020.png','pending',clock_timestamp(),clock_timestamp(),'claimed','e4000000-0000-0000-0000-000000000020',clock_timestamp(),null),
  ('e1000000-0000-0000-0000-000000000021','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000021.png','pending','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z','claimed','e4000000-0000-0000-0000-000000000021','2000-01-01T00:00:00Z',null),
  ('e1000000-0000-0000-0000-000000000022','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000022.png','pending',clock_timestamp(),clock_timestamp(),'missing',null,null,clock_timestamp()),
  ('e1000000-0000-0000-0000-000000000023','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000023.png','pending',clock_timestamp(),clock_timestamp(),'deleted',null,null,clock_timestamp()),
  ('e1000000-0000-0000-0000-000000000024','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000024.png','pending',clock_timestamp(),clock_timestamp(),'retry',null,null,null),
  ('e1000000-0000-0000-0000-000000000025','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000025.png','pending',clock_timestamp(),clock_timestamp(),'retry',null,null,null),
  ('e1000000-0000-0000-0000-000000000026','e2000000-0000-0000-0000-000000000101','return',(select registrant_id from public.equipment_requests where id='e2000000-0000-0000-0000-000000000101'),'equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000026.png','pending',clock_timestamp(),clock_timestamp(),'retry',null,null,null);

set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000020');
set local role postgres;
create temp table active_compensation_marker as
select cleanup_claimed_at, cleanup_compensation_required_at
from public.equipment_signature_operations
where id='e1000000-0000-0000-0000-000000000020';
select ok(
  (select state='pending' and cleanup_state='claimed' and cleanup_claim_token='e4000000-0000-0000-0000-000000000020'::uuid and cleanup_claimed_at=(select cleanup_claimed_at from active_compensation_marker) and cleanup_compensation_required_at is not null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000020'),
  '95 marking preserves business state and active claim ownership'
);
set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000020');
set local role postgres;
select is((select cleanup_compensation_required_at from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000020'),(select cleanup_compensation_required_at from active_compensation_marker),'96 marking is idempotent');
set local role service_role;
create temp table active_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000027');
set local role postgres;
select is((select count(*)::integer from active_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000020'),0,'97 active claimed compensation is not stolen');

set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000021');
create temp table expired_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000028');
set local role postgres;
select ok((select count(*)=1 from expired_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000021') and (select cleanup_claim_token='e4000000-0000-0000-0000-000000000028'::uuid from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000021'),'98 expired claimed compensation is reclaimed by a new token');

set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000022');
create temp table missing_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000029');
set local role postgres;
select is((select count(*)::integer from missing_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000022'),1,'99 terminal missing compensation is reclaimed');
set local role service_role;
select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000022','e4000000-0000-0000-0000-000000000029','missing',null);

select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000023');
create temp table deleted_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000030');
set local role postgres;
select is((select count(*)::integer from deleted_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000023'),1,'100 terminal deleted compensation is reclaimed');
set local role service_role;
select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000023','e4000000-0000-0000-0000-000000000030','deleted',null);

select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000024');
create temp table retry_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000031');
set local role postgres;
select is((select count(*)::integer from retry_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000024'),1,'101 retry compensation is reclaimed');
set local role service_role;
select public.ack_equipment_signature_cleanup('e1000000-0000-0000-0000-000000000024','e4000000-0000-0000-0000-000000000031','retry','retry compensation cleanup');
set local role postgres;
select ok(
  (select cleanup_compensation_required_at is null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000022')
  and (select cleanup_compensation_required_at is null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000023'),
  '102 deleted and missing acknowledgements clear compensation recovery'
);
select ok((select cleanup_compensation_required_at is not null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000024'),'103 retry acknowledgement retains compensation recovery');

select set_config('app.equipment_confirmation_rpc','true',true);
update public.equipment_requests
set return_recipient_signature_storage_path='equipment-requests/e2000000-0000-0000-0000-000000000101/return/e1000000-0000-0000-0000-000000000025.png'
where id='e2000000-0000-0000-0000-000000000101';
set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000025');
create temp table referenced_compensation_claim as
select * from public.claim_equipment_signature_cleanup_candidates(clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',10,'e4000000-0000-0000-0000-000000000032');
set local role postgres;
select is((select count(*)::integer from referenced_compensation_claim where operation_id='e1000000-0000-0000-0000-000000000025'),0,'104 active storage references block compensation cleanup');
set local role service_role;
select public.mark_equipment_signature_cleanup_compensation('e1000000-0000-0000-0000-000000000026');
set local role postgres;
select throws_ok($$update public.equipment_signature_operations set state='adopted' where id='e1000000-0000-0000-0000-000000000026'$$,'55000','EQUIPMENT_SIGNATURE_CLEANUP_OWNED','105 compensation cleanup ownership cannot be adopted');
select * from finish();
rollback;
