-- pgTAP Test Suite: equipment_signatures_storage.test.sql
-- SIGNATURE-A: Equipment Signature Storage Access Policy Hardening Verification

begin;
select plan(9);

-- Test 1: equipment_signatures bucket exists
select ok(
  exists (select 1 from storage.buckets where id = 'equipment_signatures'),
  'Test 1. equipment_signatures bucket exists'
);

-- Test 2: equipment_signatures bucket is private (public = false)
select is(
  (select public from storage.buckets where id = 'equipment_signatures'),
  false,
  'Test 2. equipment_signatures bucket is private (public = false)'
);

-- Test 3: equipment_signatures file_size_limit is 524288 bytes (512 KB)
select is(
  (select file_size_limit from storage.buckets where id = 'equipment_signatures'),
  524288::bigint,
  'Test 3. equipment_signatures file_size_limit is 524288 (512 KB)'
);

-- Test 4: authenticated SELECT policy for equipment_signatures does not exist
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%Signatures are viewable%'),
  0,
  'Test 4. Old SELECT policy for equipment_signatures no longer exists'
);

-- Test 5: authenticated INSERT policy for equipment_signatures does not exist
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%Signatures can be uploaded%'),
  0,
  'Test 5. Old INSERT policy for equipment_signatures no longer exists'
);

-- Test 6: authenticated DELETE policy for equipment_signatures does not exist
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%Signatures can be deleted%'),
  0,
  'Test 6. Old DELETE policy for equipment_signatures no longer exists'
);

-- Test 7: Total RLS policies on storage.objects for equipment_signatures is exactly 0
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%equipment_signatures%' or with_check ilike '%equipment_signatures%')),
  0,
  'Test 7. Zero RLS policies exist on storage.objects for equipment_signatures'
);

-- Test 8: Other storage bucket policies (e.g. equipment_handovers) remain intact
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (qual ilike '%equipment_handovers%' or with_check ilike '%equipment_handovers%')
  ),
  'Test 8. RLS policies for other storage buckets (equipment_handovers) remain intact'
);

-- Test 9: Direct authenticated SELECT on storage.objects for equipment_signatures yields 0 rows
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'equipment_signatures'),
  0,
  'Test 9. Direct authenticated query on storage.objects for equipment_signatures returns 0 rows'
);

select * from finish();
rollback;
