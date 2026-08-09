-- pgTAP Test Suite: equipment_signature_cleanup.test.sql
begin;
select plan(52);
select has_column('public','equipment_signature_operations','cleanup_state','1 cleanup state exists');
select has_column('public','equipment_signature_operations','cleanup_claim_token','2 claim token exists');
select has_column('public','equipment_signature_operations','cleanup_claimed_at','3 claim time exists');
select has_column('public','equipment_signature_operations','cleanup_completed_at','4 completion time exists');
select has_column('public','equipment_signature_operations','cleanup_last_error','5 error metadata exists');
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
select ok(pg_get_functiondef('public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid)'::regprocedure) like '%target_limit not between 1 and 100%','23 claim limit is bounded');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%cleanup_claim_token <> target_claim_token%','24 ack token is bound');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%''deleted'',''missing'',''retry''%','25 ack outcomes are constrained');
select ok(pg_get_functiondef('public.ack_equipment_signature_cleanup(uuid,uuid,text,text)'::regprocedure) like '%length(coalesce(target_error,'''')) > 500%','26 retry error is bounded');
select ok(to_regprocedure('private.guard_equipment_signature_cleanup_fence()') is not null,'27 finalize fence trigger function exists');
select ok(pg_get_functiondef('private.guard_equipment_signature_cleanup_fence()'::regprocedure) like '%old.cleanup_state = ''claimed'' and new.state = ''adopted''%','28 active claim fences adoption');
select ok(exists(select 1 from pg_trigger where tgname='equipment_signature_operations_cleanup_fence' and not tgisinternal),'29 adoption fence trigger exists');
select ok((select count(*) from pg_constraint where conname='equipment_signature_operations_state_check')=1,'30 business state remains constrained');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname='equipment_signature_operations_state_check') like '%adopted%','31 adopted state retained');
select ok(not has_function_privilege('authenticated','public.registrant_confirm_equipment_handoff(uuid,text,text)','EXECUTE'),'32 legacy signing stays revoked');
select ok(has_function_privilege('authenticated','public.finalize_equipment_signature(uuid)','EXECUTE'),'33 normal finalize permission remains');
select ok(exists(select 1 from pg_indexes where indexname='equipment_signature_operations_cleanup_claim_idx'),'34 cleanup claim index exists');

insert into public.equipment_signature_operations (id,request_id,phase,actor_id,object_path,state,created_at,finalized_at) values
('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','handover','e3000000-0000-0000-0000-000000000001','equipment-requests/e2000000-0000-0000-0000-000000000001/handover/e1000000-0000-0000-0000-000000000001.png','pending','2000-01-01T00:00:00Z',null),
('e1000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','return','e3000000-0000-0000-0000-000000000002','equipment-requests/e2000000-0000-0000-0000-000000000002/return/e1000000-0000-0000-0000-000000000002.png','pending','2099-01-01T00:00:00Z',null),
('e1000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000003','handover','e3000000-0000-0000-0000-000000000003','equipment-requests/e2000000-0000-0000-0000-000000000003/handover/e1000000-0000-0000-0000-000000000003.png','rejected','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z'),
('e1000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000004','return','e3000000-0000-0000-0000-000000000004','equipment-requests/e2000000-0000-0000-0000-000000000004/return/e1000000-0000-0000-0000-000000000004.png','adopted','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z');
create temp table cleanup_claims as select * from public.claim_equipment_signature_cleanup_candidates('2001-01-01T00:00:00Z','2001-01-01T00:00:00Z','2001-01-01T00:00:00Z',10,'e4000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000001'),1,'35 stale pending is claimed');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000002'),0,'36 fresh pending is excluded');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000003'),1,'37 stale rejected is claimed');
select is((select count(*)::integer from cleanup_claims where operation_id='e1000000-0000-0000-0000-000000000004'),0,'38 adopted is excluded');
select is((select cleanup_state from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'claimed','39 claim state persists');
select is((select cleanup_claim_token from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'e4000000-0000-0000-0000-000000000001'::uuid,'40 claim token persists');
select ok((select cleanup_claimed_at is not null from public.equipment_signature_operations where id='e1000000-0000-0000-0000-000000000001'),'41 claim timestamp persists');
select throws_ok($$update public.equipment_signature_operations set state='adopted' where id='e1000000-0000-0000-0000-000000000001'$$,'55000','EQUIPMENT_SIGNATURE_CLEANUP_CLAIMED','42 active claim fences adoption');
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
select * from finish();
rollback;
