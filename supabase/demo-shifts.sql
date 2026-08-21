insert into public.staff_shifts (
  id, staff_id, shift_date, shift_slot, start_time, end_time,
  note, status, registration_source, created_by
) values
  (
    '50000000-0000-0000-0000-000000000001',
    (select id from public.profiles where email = 'staff@campus.local'),
    '2026-07-27', 'MORNING', '07:00', '11:00',
    null, 'scheduled', 'admin_assigned',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    (select id from public.profiles where email = 'staff@campus.local'),
    '2026-07-30', 'AFTERNOON', '13:00', '16:00',
    null, 'scheduled', 'self_registered',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    '2026-07-28', 'MORNING', '07:00', '11:00',
    'Kiểm kê đầu tuần.', 'scheduled', 'admin_assigned',
    (select id from public.profiles where email = 'admin@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    (select id from public.profiles where email = 'staff@campus.local'),
    '2026-07-29', 'AFTERNOON', '13:00', '16:00',
    null, 'scheduled', 'self_registered',
    (select id from public.profiles where email = 'staff@campus.local')
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn'),
    '2026-08-01', 'AFTERNOON', '13:00', '16:00',
    'Bàn giao cuối tuần.', 'scheduled', 'self_registered',
    (select id from public.profiles where email = 'dieuphoi@eiu.edu.vn')
  )
on conflict (id) do nothing;
