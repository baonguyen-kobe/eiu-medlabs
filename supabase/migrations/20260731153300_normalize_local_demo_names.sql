-- Repair local demo profiles created by Windows PowerShell 5 reading UTF-8 without a BOM.
-- These email addresses are reserved for the local development accounts.
update public.profiles
set full_name = case email
  when 'admin@campus.local' then 'Nguyễn An'
  when 'giangvien@campus.local' then 'Nguyễn Ngọc Diễm'
  when 'staff@campus.local' then 'Nguyễn Bảo'
  when 'importer@campus.local' then 'Trần Minh Anh'
  else full_name
end
where email in (
  'admin@campus.local',
  'giangvien@campus.local',
  'staff@campus.local',
  'importer@campus.local'
);
