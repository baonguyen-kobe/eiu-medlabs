insert into public.class_schedules (
  id, course_id, course_code_snapshot, course_name_snapshot, room_id,
  lecturer_id, class_code, schedule_date, start_time, end_time, source,
  schedule_status, note, created_by, published_by, published_at
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'NUR 101', 'Thăm khám thể chất',
    '20000000-0000-0000-0000-000000000001',
    (select id from public.profiles where email = 'giangvien@campus.local'),
    'NUR101-A', '2026-07-27', '07:30', '11:30',
    'import', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'NUR 205', 'Điều dưỡng nội khoa',
    '20000000-0000-0000-0000-000000000002',
    null, 'NUR205-B', '2026-08-01', '13:30', '16:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'PHA 110', 'Dược lý cơ bản',
    '20000000-0000-0000-0000-000000000003',
    (select id from public.profiles where email = 'importer@campus.local'),
    null, '2026-07-29', '08:00', '10:00',
    'manual', 'draft', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    null, null
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'NUR 101', 'Thăm khám thể chất',
    '20000000-0000-0000-0000-000000000001',
    null, 'NUR101-C', '2026-08-02', '07:30', '09:30',
    'import', 'published', 'Ưu tiên giảng viên có kinh nghiệm phòng mô phỏng.',
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000004',
    'NUR 230', 'Chăm sóc người cao tuổi',
    '20000000-0000-0000-0000-000000000001',
    null, null, '2026-08-03', '07:30', '09:30',
    'manual', 'published', 'Lớp mở để giảng viên đăng ký.',
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000005',
    'MED 120', 'Giải phẫu sinh lý',
    '20000000-0000-0000-0000-000000000002',
    null, null, '2026-08-04', '13:00', '15:00',
    'import', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000002',
    'NUR 205', 'Điều dưỡng nội khoa',
    '20000000-0000-0000-0000-000000000003',
    null, null, '2026-08-05', '09:30', '11:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000003',
    'PHA 110', 'Dược lý cơ bản',
    '20000000-0000-0000-0000-000000000004',
    null, null, '2026-08-06', '12:30', '14:30',
    'import', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    '10000000-0000-0000-0000-000000000001',
    'NUR 101', 'Thăm khám thể chất',
    '20000000-0000-0000-0000-000000000005',
    null, null, '2026-08-07', '14:30', '16:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000002',
    'NUR 205', 'Điều dưỡng nội khoa',
    '20000000-0000-0000-0000-000000000002',
    (select id from public.profiles where email = 'giangvien@campus.local'),
    null, '2026-08-03', '13:30', '16:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000003',
    'PHA 110', 'Dược lý cơ bản',
    '20000000-0000-0000-0000-000000000003',
    (select id from public.profiles where email = 'giangvien@campus.local'),
    null, '2026-08-04', '07:30', '10:30',
    'import', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000004',
    'NUR 230', 'Chăm sóc người cao tuổi',
    '20000000-0000-0000-0000-000000000004',
    (select id from public.profiles where email = 'importer@campus.local'),
    null, '2026-08-05', '13:30', '16:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000005',
    'MED 120', 'Giải phẫu sinh lý',
    '20000000-0000-0000-0000-000000000005',
    (select id from public.profiles where email = 'giangvien@campus.local'),
    null, '2026-08-06', '07:30', '11:30',
    'import', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000014',
    '10000000-0000-0000-0000-000000000001',
    'NUR 101', 'Thăm khám thể chất',
    '20000000-0000-0000-0000-000000000001',
    (select id from public.profiles where email = 'importer@campus.local'),
    null, '2026-08-07', '07:30', '11:30',
    'manual', 'published', null,
    (select id from public.profiles where email = 'admin@campus.local'),
    (select id from public.profiles where email = 'admin@campus.local'),
    now()
  )
on conflict (id) do nothing;
