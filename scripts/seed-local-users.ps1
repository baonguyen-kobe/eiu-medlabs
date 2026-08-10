$ErrorActionPreference = "Stop"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$npxCommand = if ($IsWindows -or $env:OS -eq "Windows_NT") { "npx.cmd" } else { "npx" }

function Invoke-LocalSqlFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  Get-Content -LiteralPath $Path -Raw -Encoding utf8 |
    docker exec -i supabase_db_lich-truc-app `
      psql -U postgres -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw "Không thể nạp file SQL: $Path"
  }
}

$statusLines = & $npxCommand supabase status -o env
$secretLine = $statusLines | Where-Object { $_ -like "SECRET_KEY=*" }
if (-not $secretLine) {
  throw "Không tìm thấy Supabase local secret key. Hãy chạy Supabase trước."
}

$secretKey = ($secretLine -split "=", 2)[1].Trim('"')
$headers = @{
  Authorization  = "Bearer $secretKey"
  apikey         = $secretKey
  "Content-Type" = "application/json"
}

$users = @(
  @{
    email     = "admin@campus.local"
    password  = "LocalAdmin123!"
    full_name = "Nguyễn An"
    phone     = "0901000001"
    roles     = @("admin", "staff", "lecturer")
    can_import_schedules = $true
    allow_early_equipment_handover = $false
  },
  @{
    email     = "bao.nguyen@eiu.edu.vn"
    password  = "LocalPersonnelManager123!"
    full_name = "Nguyễn Bảo"
    phone     = "0901000008"
    roles     = @("admin")
  },
  @{
    email     = "admin.other@campus.local"
    password  = "LocalOtherAdmin123!"
    full_name = "Quản trị viên khác"
    phone     = "0901000009"
    roles     = @("admin")
  },
  @{
    email     = "giangvien@campus.local"
    password  = "LocalLecturer123!"
    full_name = "Nguyễn Ngọc Diễm"
    phone     = "0901000002"
    roles     = @("lecturer")
  },
  @{
    email     = "staff@campus.local"
    password  = "LocalStaff123!"
    full_name = "Nguyễn Bảo"
    phone     = "0901000003"
    roles     = @("staff")
  },
  @{
    email     = "importer@campus.local"
    password  = "LocalImporter123!"
    full_name = "Trần Minh Anh"
    phone     = "0901000004"
    roles     = @("lecturer")
    can_import_schedules = $true
  },
  @{
    email     = "dieuphoi@eiu.edu.vn"
    password  = "LocalCoordinator123!"
    full_name = "Lê Hoàng Minh"
    phone     = "0901000005"
    roles     = @("staff")
    can_import_schedules = $true
  },
  @{
    email     = "trogiang@campus.local"
    password  = "LocalAssistant123!"
    full_name = "Phạm Ngọc D"
    phone     = "0901000006"
    roles     = @("teaching_assistant")
    can_import_schedules = $false
  },
  @{
    email     = "trogiang.import@campus.local"
    password  = "LocalAssistantImport123!"
    full_name = "Võ Thùy E"
    phone     = "0901000007"
    roles     = @("teaching_assistant")
    can_import_schedules = $true
  }
)

$userIds = @{}

foreach ($entry in $users) {
  $body = @{
    email         = $entry.email
    password      = $entry.password
    email_confirm = $true
    user_metadata = @{ full_name = $entry.full_name }
  } | ConvertTo-Json -Depth 4
  $bodyBytes = [Text.Encoding]::UTF8.GetBytes($body)

  try {
    $created = Invoke-RestMethod `
      -Uri "http://127.0.0.1:54321/auth/v1/admin/users" `
      -Method Post `
      -Headers $headers `
      -Body $bodyBytes
    $userId = $created.id
  }
  catch {
    $list = Invoke-RestMethod `
      -Uri "http://127.0.0.1:54321/auth/v1/admin/users?per_page=100" `
      -Method Get `
      -Headers $headers
    $userId = (
      $list.users |
        Where-Object { $_.email -eq $entry.email } |
        Select-Object -First 1
    ).id
  }

  if (-not $userId) {
    throw "Không thể tạo hoặc tìm tài khoản $($entry.email)."
  }
  $userIds[$entry.email] = $userId

  $roleValues = (
    $entry.roles |
      ForEach-Object { "('$userId','$_')" }
  ) -join ","

  & $npxCommand supabase db query --local `
    "insert into public.user_roles (user_id, role) values $roleValues on conflict do nothing;" |
    Out-Null

  & $npxCommand supabase db query --local `
    "update public.profiles set phone = '$($entry.phone)' where id = '$userId';" |
    Out-Null

  if ($entry.can_import_schedules) {
    & $npxCommand supabase db query --local `
      "update public.profiles set can_import_schedules = true where id = '$userId';" |
      Out-Null
  }

  if ($entry.allow_early_equipment_handover) {
    & $npxCommand supabase db query --local `
      "update public.profiles set allow_early_equipment_handover = true where id = '$userId';" |
      Out-Null
  }

  Write-Output "Đã tạo $($entry.email): $($entry.roles -join ', ')"
}

$rootId = $userIds["admin@campus.local"]
$personnelManagerId = $userIds["bao.nguyen@eiu.edu.vn"]
& $npxCommand supabase db query --local `
  "insert into public.system_security_principals (singleton, root_admin_id, personnel_manager_id, configured_by) values (true, '$rootId', '$personnelManagerId', '$rootId') on conflict (singleton) do update set root_admin_id = excluded.root_admin_id, personnel_manager_id = excluded.personnel_manager_id, configured_by = excluded.configured_by, configured_at = clock_timestamp()" |
  Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Không thể cấu hình Root Administrator và Personnel Manager local."
}
& $npxCommand supabase db query --local `
  "insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata) values ('$rootId', 'personnel.security_bootstrapped', 'system_security_principals', null, jsonb_build_object('source','local_seed'))" |
  Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Không thể ghi audit bootstrap nhân sự local."
}
Write-Output "Đã cấu hình Root Administrator và Personnel Manager local."

Invoke-LocalSqlFile "supabase/demo-schedules.sql"
Invoke-LocalSqlFile "supabase/demo-shifts.sql"
Invoke-LocalSqlFile "supabase/demo-imports.sql"
Write-Output "Đã tạo dữ liệu lịch mẫu."
