alter table public.class_schedules
  drop constraint if exists class_schedules_operating_hours;

alter table public.class_schedules
  add constraint class_schedules_operating_hours check (
    (
      basic_medical_registration_id is not null
      and start_time >= time '07:00'
      and end_time <= time '21:00'
    )
    or
    (
      basic_medical_registration_id is null
      and (
        (start_time >= time '07:30' and end_time <= time '11:30')
        or (start_time >= time '12:30' and end_time <= time '16:30')
      )
    )
  );
