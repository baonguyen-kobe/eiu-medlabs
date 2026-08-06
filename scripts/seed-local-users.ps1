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
    roles     = @("admin", "staff", "lecturer", "importer")
    allow_early_equipment_handover = $false
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
    roles     = @("lecturer", "importer")
  },
  @{
    email     = "dieuphoi@eiu.edu.vn"
    password  = "LocalCoordinator123!"
    full_name = "Lê Hoàng Minh"
    phone     = "0901000005"
    roles     = @("staff", "importer")
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

  if ($entry.allow_early_equipment_handover) {
    & $npxCommand supabase db query --local `
      "update public.profiles set allow_early_equipment_handover = true where id = '$userId';" |
      Out-Null
  }

  Write-Output "Đã tạo $($entry.email): $($entry.roles -join ', ')"
}

Invoke-LocalSqlFile "supabase/demo-schedules.sql"
Invoke-LocalSqlFile "supabase/demo-shifts.sql"
Invoke-LocalSqlFile "supabase/demo-imports.sql"
Write-Output "Đã tạo dữ liệu lịch mẫu."
