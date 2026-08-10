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
    [Parameter(Mandatory)][string[]]$Arguments
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
  $standardOutput = $process.StandardOutput.ReadToEnd()
  $standardError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
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
    [Parameter(Mandatory)][string]$Label
  )

  $version = Invoke-RestMethod -Uri "$($Url.TrimEnd('/'))/api/version" -Headers @{ "Cache-Control" = "no-cache" }
  if ($version.gitSha -cne $ExpectedSha) {
    throw "$Label /api/version reported '$($version.gitSha)' instead of '$ExpectedSha'."
  }
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

  Invoke-Vercel -CommandPath $vercelPath -Arguments @(
    "deploy", "--prod", "--yes",
    "--meta", "appGitSha=$sha",
    "--env", "APP_GIT_SHA=$sha",
    "--build-env", "APP_GIT_SHA=$sha"
  ) | Out-Null

  $metadataOutput = Invoke-Vercel -CommandPath $vercelPath -Arguments @(
    "ls", "--meta", "appGitSha=$sha"
  )
  $metadataText = $metadataOutput | Out-String
  if ($metadataText -notmatch "https://[A-Za-z0-9.-]+\\.vercel\\.app") {
    throw "Vercel metadata lookup did not return a deployment for the deployed appGitSha."
  }

  $deploymentUrls = [regex]::Matches(
    $metadataText,
    "https://[A-Za-z0-9.-]+\\.vercel\\.app(?:[^\\s]*)?"
  ) | ForEach-Object { $_.Value.TrimEnd("/", ".") }
  $deploymentUrl = $deploymentUrls | Select-Object -Last 1
  if (-not $deploymentUrl) {
    throw "Vercel metadata lookup completed without a deployment URL."
  }

  # This project protects raw deployment URLs with Vercel Authentication. The
  # exact metadata match plus the public production alias validates the same
  # deployment without relying on an SSO-protected direct deployment endpoint.
  Assert-VersionEndpoint `
    -Url "https://medlabs-calendar.vercel.app" `
    -ExpectedSha $sha `
    -Label "Production alias"

  Write-Output "Production deployment verified: $deploymentUrl"
  Write-Output "Production application SHA: $sha"
} finally {
  Pop-Location
}
