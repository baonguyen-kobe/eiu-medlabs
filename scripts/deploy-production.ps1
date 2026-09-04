$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $output = & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
  return $output
}

function Invoke-Vercel {
  param(
    [Parameter(Mandatory)][string]$CommandPath,
    [Parameter(Mandatory)][string[]]$Arguments,
    [int]$TimeoutSeconds = 600
  )

  $quotedArguments = ($Arguments | ForEach-Object {
    '"' + $_.Replace('"', '\"') + '"'
  }) -join ' '
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $env:ComSpec
  $startInfo.Arguments = "/d /s /c `"`"$($CommandPath.Replace('"', '\"'))`" $quotedArguments`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Failed to start Vercel CLI."
  }

  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  $timeoutMs = $TimeoutSeconds * 1000
  if (-not $process.WaitForExit($timeoutMs)) {
    try {
      if (Get-Command taskkill.exe -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
      } else {
        $process.Kill()
      }
    } catch {
      try { $process.Kill() } catch {}
    }
    throw "Vercel command timed out after $TimeoutSeconds seconds: $CommandPath $($Arguments -join ' ')"
  }

  if (-not [System.Threading.Tasks.Task]::WaitAll(@($stdoutTask, $stderrTask), 5000)) {
    throw "Vercel command timed out while capturing output streams: $CommandPath $($Arguments -join ' ')"
  }
  $standardOutput = $stdoutTask.Result
  $standardError = $stderrTask.Result
  $output = @($standardOutput, $standardError) | Where-Object { $_ }

  if ($process.ExitCode -ne 0) {
    throw "Vercel command failed: $CommandPath $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
  }
  return $output
}

function Assert-VersionEndpoint {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][string]$Label,
    [int]$MaxAttempts = 12,
    [int]$DelaySeconds = 5
  )

  $targetUri = "$($Url.TrimEnd('/'))/api/version"
  $lastReportedSha = $null
  $lastError = $null

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      $version = Invoke-RestMethod -Uri $targetUri -Headers @{ "Cache-Control" = "no-cache" }
      $reportedSha = if ($version -and $version.gitSha) { [string]$version.gitSha } else { $null }
      $lastReportedSha = $reportedSha

      if ($reportedSha -ceq $ExpectedSha) {
        return
      }
    } catch {
      $lastError = $_.Exception.Message
    }

    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  if ($lastError -and -not $lastReportedSha) {
    throw "$Label /api/version unreachable after $MaxAttempts attempts: $lastError"
  }

  throw "$Label /api/version reported '$lastReportedSha' instead of '$ExpectedSha' after $MaxAttempts attempts."
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot

try {
  if ((Invoke-Git -Arguments @("status", "--porcelain=v1"))) {
    throw "Refusing production deployment from a dirty working tree."
  }

  $branch = (Invoke-Git -Arguments @("branch", "--show-current")).Trim()
  if ($branch -cne "main") {
    throw "Refusing production deployment: current branch is '$branch', expected 'main'."
  }

  Invoke-Git -Arguments @("fetch", "origin", "--prune") | Out-Null
  $sha = (Invoke-Git -Arguments @("rev-parse", "HEAD")).Trim()
  $originSha = (Invoke-Git -Arguments @("rev-parse", "origin/main")).Trim()
  if ($sha -cne $originSha) {
    throw "Refusing production deployment: local HEAD does not equal origin/main."
  }

  $vercel = Get-Command vercel.cmd -ErrorAction SilentlyContinue
  if (-not $vercel) {
    $vercel = Get-Command vercel -ErrorAction SilentlyContinue
  }
  if (-not $vercel) {
    throw "Vercel CLI is required but is not installed. Installation is intentionally not performed."
  }
  $vercelPath = if ($vercel.Path) { $vercel.Path } else { $vercel.Source }
  if (-not (Test-Path -LiteralPath ".vercel/project.json")) {
    throw "Vercel project link is missing at .vercel/project.json."
  }

  $deployOutput = Invoke-Vercel -CommandPath $vercelPath -Arguments @(
    "deploy", "--prod", "--yes",
    "--meta", "appGitSha=$sha",
    "--env", "APP_GIT_SHA=$sha",
    "--build-env", "APP_GIT_SHA=$sha"
  )

  $deploymentUrl = $null
  $metadataAvailable = $false

  try {
    $metadataOutput = Invoke-Vercel -CommandPath $vercelPath -Arguments @(
      "ls", "--meta", "appGitSha=$sha"
    )
    $metadataText = $metadataOutput | Out-String
    if ($metadataText -match 'https://[A-Za-z0-9.-]+\.vercel\.app') {
      $deploymentUrls = [regex]::Matches(
        $metadataText,
        'https://[A-Za-z0-9.-]+\.vercel\.app(?:[^\s]*)?'
      ) | ForEach-Object { $_.Value.TrimEnd("/", ".") }
      $deploymentUrl = $deploymentUrls | Select-Object -Last 1
      if ($deploymentUrl) {
        $metadataAvailable = $true
      }
    }
  } catch {
    Write-Warning "Vercel metadata lookup command failed; falling back to exact production /api/version verification."
  }

  if (-not $metadataAvailable) {
    Write-Warning "Vercel metadata lookup did not return the deployment; falling back to exact production /api/version verification."
  }

  # This project protects raw deployment URLs with Vercel Authentication. The
  # exact metadata match (when available) plus the public production alias validates the same
  # deployment without relying on an SSO-protected direct deployment endpoint.
  Assert-VersionEndpoint `
    -Url "https://medlabs-calendar.vercel.app" `
    -ExpectedSha $sha `
    -Label "Production alias" `
    -MaxAttempts 12 `
    -DelaySeconds 5

  if ($metadataAvailable -and $deploymentUrl) {
    Write-Output "Production deployment verified."
    Write-Output "Deployment URL: $deploymentUrl"
    Write-Output "Production application SHA: $sha"
    Write-Output "Verification: metadata + exact production alias"
  } else {
    Write-Output "Production deployment verified."
    Write-Output "Production application SHA: $sha"
    Write-Output "Verification: exact production alias"
    Write-Output "Metadata lookup: unavailable / non-fatal"
  }
} finally {
  Pop-Location
}
