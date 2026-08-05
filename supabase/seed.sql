insert into public.courses (id, course_code, course_name) values
  ('10000000-0000-0000-0000-000000000001', 'NUR 101', 'Thăm khám thể chất'),
  ('10000000-0000-0000-0000-000000000002', 'NUR 205', 'Điều dưỡng nội khoa'),
  ('10000000-0000-0000-0000-000000000003', 'PHA 110', 'Dược lý cơ bản'),
  ('10000000-0000-0000-0000-000000000004', 'NUR 230', 'Chăm sóc người cao tuổi'),
  ('10000000-0000-0000-0000-000000000005', 'MED 120', 'Giải phẫu sinh lý')
on conflict do nothing;

insert into public.rooms (
  id, room_code, building_code, room_name, room_type, capacity
) values
  ('20000000-0000-0000-0000-000000000001', '105', 'B5', 'Skills Lab 1', 'Phòng thực hành', 30),
  ('20000000-0000-0000-0000-000000000002', '201', 'A2', 'Phòng học 201', 'Phòng lý thuyết', 60),
  ('20000000-0000-0000-0000-000000000003', 'LAB-3', 'C1', 'Simulation Lab', 'Phòng mô phỏng', 24),
  ('20000000-0000-0000-0000-000000000004', '302', 'B3', 'Phòng học 302', 'Phòng lý thuyết', 48),
  ('20000000-0000-0000-0000-000000000005', 'LAB-5', 'D1', 'Clinical Practice Lab', 'Phòng thực hành', 20)
on conflict do nothing;

insert into public.shift_templates (
  id, shift_code, shift_name, start_time, end_time
) values
  ('30000000-0000-0000-0000-000000000001', 'MORNING', 'Ca sáng', '08:30', '11:30'),
  ('30000000-0000-0000-0000-000000000002', 'AFTERNOON', 'Ca chiều', '13:30', '16:30'),
  ('30000000-0000-0000-0000-000000000003', 'EARLY_MORNING', 'Ca sáng sớm', '07:30', '10:30'),
  ('30000000-0000-0000-0000-000000000004', 'MIDDAY', 'Ca giữa ngày', '10:30', '13:30'),
  ('30000000-0000-0000-0000-000000000005', 'LATE_AFTERNOON', 'Ca chiều muộn', '13:30', '16:30')
on conflict do nothing;
