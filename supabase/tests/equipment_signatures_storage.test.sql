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
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ilike '%equipment_signatures%' or coalesce(with_check, '') ilike '%equipment_signatures%')),
  0,
  'Test 7. Zero RLS policies exist on storage.objects for equipment_signatures'
);

-- Test 8: equipment_signatures allowed MIME types remain unchanged
select is(
  (select allowed_mime_types from storage.buckets where id = 'equipment_signatures'),
  array['image/png', 'image/jpeg']::text[],
  'Test 8. equipment_signatures allowed_mime_types remain image/png and image/jpeg'
);

select set_config('role', 'postgres', true);
insert into storage.objects (bucket_id, name)
values ('equipment_signatures', 'signature-a-authenticated-denial-test.png');

select set_config('role', 'authenticated', true);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'equipment_signatures' and name = 'signature-a-authenticated-denial-test.png'),
  0,
  'Test 9. Authenticated users cannot see a controlled equipment_signatures object'
);
select set_config('role', 'postgres', true);

select * from finish();
rollback;
