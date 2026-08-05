insert into public.staff_shifts (
  id, staff_id, shift_date, start_time, end_time, shift_type,
  shift_template_id, note, status, registration_source, created_by
) values
  (
    '50000000-0000-0000-0000-000000000001',
    (select id from public.profiles where email = 'staff@campus.local'),
    '2026-07-27', '08:30', '11:30', 'MORNING',
    '30000000-0000-0000-0000-000000000001', null,
    'scheduled', 'admin_assigned',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    (select id from public.profiles where email = 'admin@campus.local'),
    '2026-07-30', '13:30', '16:30', 'AFTERNOON',
    '30000000-0000-0000-0000-000000000002', null,
    'scheduled', 'self_registered',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    '2026-07-28', '07:30', '10:30', 'MORNING',
    '30000000-0000-0000-0000-000000000003', 'Kiểm kê đầu tuần.',
    'scheduled', 'admin_assigned',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    (select id from public.profiles where email = 'staff@campus.local'),
    '2026-07-29', '13:30', '16:30', 'AFTERNOON',
    '30000000-0000-0000-0000-000000000002', null,
    'scheduled', 'self_registered',
    (select id from public.profiles where email = 'staff@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    '2026-08-01', '13:30', '16:30', 'AFTERNOON',
    '30000000-0000-0000-0000-000000000005', 'Bàn giao cuối tuần.',
    'scheduled', 'self_registered',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn')
  )
on conflict (id) do nothing;

insert into public.staff_shift_patterns (
  id, staff_id, weekday, start_time, end_time, shift_type,
  effective_from, effective_to, note, created_by
) values
  (
    '60000000-0000-0000-0000-000000000001',
    (select id from public.profiles where email = 'staff@campus.local'),
    1, '08:30', '11:30', 'MORNING', '2026-07-01', '2026-09-30',
    'Trực cố định thứ Hai',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    2, '13:30', '16:30', 'AFTERNOON', '2026-07-01', '2026-09-30',
    'Trực cố định thứ Ba',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    (select id from public.profiles where email = 'admin@campus.local'),
    3, '08:30', '11:30', 'MORNING', '2026-07-01', '2026-09-30',
    'Hỗ trợ điều phối giữa tuần',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    (select id from public.profiles where email = 'staff@campus.local'),
    4, '13:30', '16:30', 'AFTERNOON', '2026-07-01', '2026-09-30',
    'Trực cố định thứ Năm',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    5, '08:30', '11:30', 'MORNING', '2026-07-01', '2026-09-30',
    'Trực cố định thứ Sáu',
    (select id from public.profiles where email = 'admin@campus.local')
  )
on conflict (id) do nothing;
