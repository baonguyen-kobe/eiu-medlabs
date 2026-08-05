insert into public.import_batches (
  id, source_type, original_file_name, file_hash, status,
  total_rows, valid_rows, warning_rows, error_rows, imported_rows,
  duplicate_rows, created_by, created_at, completed_at
) values
  (
    '70000000-0000-0000-0000-000000000001',
    'import', 'lich-dieu-duong-tuan-31.xlsx', 'demo-import-hash-01',
    'completed', 25, 25, 0, 0, 25, 0,
    (select id from public.profiles where email = 'admin@campus.local'),
    now() - interval '5 days', now() - interval '5 days' + interval '2 minutes'
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    'import', 'lich-phong-thang-08.csv', 'demo-import-hash-02',
    'completed', 18, 16, 2, 0, 16, 2,
    (select id from public.profiles where email = 'admin@campus.local'),
    now() - interval '4 days', now() - interval '4 days' + interval '1 minute'
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    'import', 'lich-duoc-ly-bo-sung.xlsx', 'demo-import-hash-03',
    'ready', 12, 11, 1, 0, 0, 0,
    (select id from public.profiles where email = 'admin@campus.local'),
    now() - interval '3 days', null
  ),
  (
    '70000000-0000-0000-0000-000000000004',
    'import', 'lich-mo-phong-loi.csv', 'demo-import-hash-04',
    'failed', 10, 6, 0, 4, 0, 0,
    (select id from public.profiles where email = 'admin@campus.local'),
    now() - interval '2 days', now() - interval '2 days' + interval '30 seconds'
  ),
  (
    '70000000-0000-0000-0000-000000000005',
    'import', 'lich-cap-nhat-hom-nay.xlsx', 'demo-import-hash-05',
    'validating', 20, 0, 0, 0, 0, 0,
    (select id from public.profiles where email = 'admin@campus.local'),
    now() - interval '1 day', null
  )
on conflict (id) do nothing;
