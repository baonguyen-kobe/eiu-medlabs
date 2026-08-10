$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $output = & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
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

  $vercel = Get-Command vercel -ErrorAction SilentlyContinue
  if (-not $vercel) {
    throw "Vercel CLI is required but is not installed. Installation is intentionally not performed."
  }
  if (-not (Test-Path -LiteralPath ".vercel/project.json")) {
    throw "Vercel project link is missing at .vercel/project.json."
  }

  $deployOutput = & $vercel.Source deploy --prod --yes `
    --meta "appGitSha=$sha" `
    --env "APP_GIT_SHA=$sha" `
    --build-env "APP_GIT_SHA=$sha" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Vercel production deployment failed."
  }

  $deploymentUrls = [regex]::Matches(
    ($deployOutput | Out-String),
    "https://[A-Za-z0-9.-]+\\.vercel\\.app(?:[^\\s]*)?"
  ) | ForEach-Object { $_.Value.TrimEnd("/", ".") }
  $deploymentUrl = $deploymentUrls | Select-Object -Last 1
  if (-not $deploymentUrl) {
    throw "Vercel CLI completed without a deployment URL."
  }

  Assert-VersionEndpoint -Url $deploymentUrl -ExpectedSha $sha -Label "Deployment"
  Assert-VersionEndpoint `
    -Url "https://medlabs-calendar.vercel.app" `
    -ExpectedSha $sha `
    -Label "Production alias"

  $metadataOutput = & $vercel.Source ls --meta "appGitSha=$sha" 2>&1
  if ($LASTEXITCODE -ne 0 -or ($metadataOutput | Out-String) -notmatch [regex]::Escape($sha)) {
    throw "Vercel metadata lookup did not find the deployed appGitSha."
  }

  Write-Output "Production deployment verified: $deploymentUrl"
  Write-Output "Production application SHA: $sha"
} finally {
  Pop-Location
}
