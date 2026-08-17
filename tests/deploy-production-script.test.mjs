import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptSource = readFileSync(
  new URL("../scripts/deploy-production.ps1", import.meta.url),
  "utf8",
);

test("deploy-production.ps1 retains all preflight safety gates", () => {
  // Working tree clean gate
  assert.match(
    scriptSource,
    /Invoke-Git -Arguments @\("status", "--porcelain=v1"\)[\s\S]*?Refusing production deployment from a dirty working tree\./,
    "Must enforce clean git status",
  );

  // Main branch gate
  assert.match(
    scriptSource,
    /\$branch -cne "main"[\s\S]*?Refusing production deployment: current branch is '\$branch', expected 'main'\./,
    "Must enforce branch == main",
  );

  // Origin/main equality gate
  assert.match(
    scriptSource,
    /\$sha -cne \$originSha[\s\S]*?Refusing production deployment: local HEAD does not equal origin\/main\./,
    "Must enforce local HEAD == origin/main",
  );

  // Vercel CLI and project link gate
  assert.match(
    scriptSource,
    /Test-Path -LiteralPath "\.vercel\/project\.json"/,
    "Must check .vercel/project.json existence",
  );

  // Capture deploy output
  assert.match(
    scriptSource,
    /\$deployOutput = Invoke-Vercel -CommandPath \$vercelPath -Arguments @\(\s*"deploy", "--prod", "--yes"/,
    "Must capture vercel deploy output",
  );
});

test("deploy-production.ps1 treats metadata lookup as non-fatal fallback with warnings", () => {
  // Try-catch around metadata lookup
  assert.match(
    scriptSource,
    /try\s*\{\s*\$metadataOutput = Invoke-Vercel -CommandPath \$vercelPath -Arguments @\(\s*"ls", "--meta", "appGitSha=\$sha"\s*\)[\s\S]*?\}\s*catch\s*\{\s*Write-Warning "Vercel metadata lookup command failed; falling back to exact production \/api\/version verification\."\s*\}/,
    "Must catch metadata lookup command failures without failing deploy",
  );

  // Warning when metadata yields no matching URL
  assert.match(
    scriptSource,
    /if \(-not \$metadataAvailable\) \{\s*Write-Warning "Vercel metadata lookup did not return the deployment; falling back to exact production \/api\/version verification\."\s*\}/,
    "Must emit fallback warning when metadata URL is missing",
  );
});

test("Assert-VersionEndpoint implements bounded polling with exact SHA check", () => {
  // MaxAttempts = 12 and DelaySeconds = 5 defaults
  assert.match(
    scriptSource,
    /\[int\]\$MaxAttempts = 12/,
    "Must default to 12 attempts",
  );
  assert.match(
    scriptSource,
    /\[int\]\$DelaySeconds = 5/,
    "Must default to 5 seconds delay",
  );

  // No-cache header
  assert.match(
    scriptSource,
    /Headers @\{ "Cache-Control" = "no-cache" \}/,
    "Must disable caching on /api/version requests",
  );

  // Case-sensitive exact SHA match
  assert.match(
    scriptSource,
    /\$reportedSha -ceq \$ExpectedSha/,
    "Must perform case-sensitive exact SHA equality check",
  );

  // Final throw on exhaustion
  assert.match(
    scriptSource,
    /throw "\$Label \/api\/version reported '\$lastReportedSha' instead of '\$ExpectedSha' after \$MaxAttempts attempts\."/,
    "Must throw after max attempts exhausted",
  );
});

test("deploy-production.ps1 reports structured verification output for both paths", () => {
  assert.match(
    scriptSource,
    /Write-Output "Verification: metadata \+ exact production alias"/,
    "Must report metadata + alias verification when metadata is available",
  );
  assert.match(
    scriptSource,
    /Write-Output "Verification: exact production alias"\s*Write-Output "Metadata lookup: unavailable \/ non-fatal"/,
    "Must report exact alias verification with non-fatal metadata notice on fallback",
  );
});

const powershellCmd = (() => {
  if (process.env.POWERSHELL_BIN) return process.env.POWERSHELL_BIN;
  if (process.platform === "win32") return "powershell";
  return "pwsh";
})();

function runPowerShell(scriptBlock) {
  try {
    return execFileSync(
      powershellCmd,
      ["-NoProfile", "-NonInteractive", "-Command", scriptBlock],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (err) {
    if (err.code === "ENOENT") {
      const altCmd = powershellCmd === "pwsh" ? "powershell" : "pwsh";
      return execFileSync(
        altCmd,
        ["-NoProfile", "-NonInteractive", "-Command", scriptBlock],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    }
    throw err;
  }
}

test("PowerShell Assert-VersionEndpoint behavior: exact match succeeds", () => {
  const ps = `
    $ErrorActionPreference = "Stop"
    function Invoke-RestMethod {
      return [PSCustomObject]@{ gitSha = "abcd1234ef5678" }
    }
    ${scriptSource.slice(scriptSource.indexOf("function Assert-VersionEndpoint {"), scriptSource.indexOf("$repositoryRoot ="))}
    Assert-VersionEndpoint -Url "https://mock.test" -ExpectedSha "abcd1234ef5678" -Label "Test" -MaxAttempts 2 -DelaySeconds 0
    Write-Output "SUCCESS"
  `;
  const out = runPowerShell(ps);
  assert.match(out, /SUCCESS/);
});

test("PowerShell Assert-VersionEndpoint behavior: mismatch fails after retries", () => {
  const ps = `
    $ErrorActionPreference = "Stop"
    function Invoke-RestMethod {
      return [PSCustomObject]@{ gitSha = "wrong_sha" }
    }
    ${scriptSource.slice(scriptSource.indexOf("function Assert-VersionEndpoint {"), scriptSource.indexOf("$repositoryRoot ="))}
    try {
      Assert-VersionEndpoint -Url "https://mock.test" -ExpectedSha "expected_sha" -Label "Test" -MaxAttempts 2 -DelaySeconds 0
      Write-Output "UNEXPECTED_SUCCESS"
    } catch {
      Write-Output "CAUGHT: $($_.Exception.Message)"
    }
  `;
  const out = runPowerShell(ps);
  assert.match(
    out,
    /CAUGHT: Test \/api\/version reported 'wrong_sha' instead of 'expected_sha' after 2 attempts\./,
  );
});

test("PowerShell Assert-VersionEndpoint behavior: transient error resolves on retry", () => {
  const ps = `
    $ErrorActionPreference = "Stop"
    $script:callCount = 0
    function Invoke-RestMethod {
      $script:callCount++
      if ($script:callCount -eq 1) {
        throw "Temporary network glitch"
      }
      return [PSCustomObject]@{ gitSha = "target_sha" }
    }
    ${scriptSource.slice(scriptSource.indexOf("function Assert-VersionEndpoint {"), scriptSource.indexOf("$repositoryRoot ="))}
    Assert-VersionEndpoint -Url "https://mock.test" -ExpectedSha "target_sha" -Label "Test" -MaxAttempts 3 -DelaySeconds 0
    Write-Output "RESOLVED_ON_RETRY callCount=$script:callCount"
  `;
  const out = runPowerShell(ps);
  assert.match(out, /RESOLVED_ON_RETRY callCount=2/);
});

const versionEndpointFn = scriptSource.slice(
  scriptSource.indexOf("function Assert-VersionEndpoint {"),
  scriptSource.indexOf("$repositoryRoot = Split-Path"),
);

const mainExecutionBlock = scriptSource.slice(
  scriptSource.indexOf(
    'if ((Invoke-Git -Arguments @("status", "--porcelain=v1")))',
  ),
);

// Helper for testing the main deployment flow with stubbed external functions
function buildSimulationScript({
  gitStatus = "",
  gitBranch = "main",
  headSha = "target_sha_123456",
  originSha = "target_sha_123456",
  deployFails = false,
  metadataOutput = "https://medlabs-calendar-preview.vercel.app",
  metadataFails = false,
  aliasSha = "target_sha_123456",
}) {
  const deployFailsPs = deployFails ? "$true" : "$false";
  const metadataFailsPs = metadataFails ? "$true" : "$false";
  // Replace long delays in Assert-VersionEndpoint invocation for instant test runs
  const fastExecutionBlock = mainExecutionBlock
    .replace("-MaxAttempts 12", "-MaxAttempts 2")
    .replace("-DelaySeconds 5", "-DelaySeconds 0");

  return `
    $ErrorActionPreference = "Stop"
    function Invoke-Git {
      param([string[]]$Arguments)
      $cmd = $Arguments[0]
      if ($cmd -eq "status") { return "${gitStatus}" }
      if ($cmd -eq "branch") { return "${gitBranch}" }
      if ($cmd -eq "fetch") { return "" }
      if ($cmd -eq "rev-parse") {
        if ($Arguments[1] -eq "HEAD") { return "${headSha}" }
        if ($Arguments[1] -eq "origin/main") { return "${originSha}" }
      }
      throw "Unhandled git cmd: $cmd"
    }

    function Invoke-Vercel {
      param([string]$CommandPath, [string[]]$Arguments)
      if ($Arguments[0] -eq "deploy") {
        if (${deployFailsPs}) { throw "Vercel deploy failed: build error" }
        return @("Deploying...", "https://medlabs-calendar-deploy.vercel.app")
      }
      if ($Arguments[0] -eq "ls") {
        if (${metadataFailsPs}) { throw "Vercel ls failed: forbidden token scope" }
        return @("${metadataOutput}")
      }
      throw "Unhandled vercel cmd: $($Arguments[0])"
    }

    function Get-Command {
      param([string]$Name)
      return [PSCustomObject]@{ Path = "mock-vercel.cmd"; Source = "mock-vercel.cmd" }
    }

    function Test-Path {
      param([string]$LiteralPath)
      return $true
    }

    function Push-Location { param($p) }
    function Pop-Location {}

    ${versionEndpointFn}

    function Invoke-RestMethod {
      param($Uri, $Headers)
      return [PSCustomObject]@{ gitSha = "${aliasSha}" }
    }

    # Execute main flow
    $PSScriptRoot = "."
    try {
      ${fastExecutionBlock}
  `;
}

test("Scenario 1: metadata lookup succeeds + alias exact SHA => PASS (metadata + alias)", () => {
  const ps = buildSimulationScript({
    metadataOutput: "https://medlabs-calendar-preview.vercel.app",
    aliasSha: "target_sha_123456",
  });
  const out = runPowerShell(ps);
  assert.match(out, /Production deployment verified\./);
  assert.match(
    out,
    /Deployment URL: https:\/\/medlabs-calendar-preview\.vercel\.app/,
  );
  assert.match(out, /Verification: metadata \+ exact production alias/);
});

test("Scenario 2: metadata lookup returns no URL + alias exact SHA => PASS (fallback)", () => {
  const ps = buildSimulationScript({
    metadataOutput: "No deployments found",
    aliasSha: "target_sha_123456",
  });
  const out = runPowerShell(ps);
  assert.match(out, /Production deployment verified\./);
  assert.match(out, /Verification: exact production alias/);
  assert.match(out, /Metadata lookup: unavailable \/ non-fatal/);
});

test("Scenario 3: metadata lookup command fails + alias exact SHA => PASS (warning + fallback)", () => {
  const ps = buildSimulationScript({
    metadataFails: true,
    aliasSha: "target_sha_123456",
  });
  const out = runPowerShell(ps);
  assert.match(out, /Production deployment verified\./);
  assert.match(out, /Verification: exact production alias/);
  assert.match(out, /Metadata lookup: unavailable \/ non-fatal/);
});

test("Scenario 4: metadata lookup unavailable + alias wrong SHA => FAIL", () => {
  const ps = `
    try {
      ${buildSimulationScript({
        metadataFails: true,
        aliasSha: "wrong_stale_sha",
      })}
    } catch {
      Write-Output "CAUGHT_ERROR: $($_.Exception.Message)"
    }
  `;
  const out = runPowerShell(ps);
  assert.match(
    out,
    /CAUGHT_ERROR: Production alias \/api\/version reported 'wrong_stale_sha' instead of 'target_sha_123456'/,
  );
});

test("Scenario 5: vercel deploy command failure => FAIL", () => {
  const ps = `
    try {
      ${buildSimulationScript({
        deployFails: true,
      })}
    } catch {
      Write-Output "CAUGHT_ERROR: $($_.Exception.Message)"
    }
  `;
  const out = runPowerShell(ps);
  assert.match(out, /CAUGHT_ERROR: Vercel deploy failed: build error/);
});

test("Scenario 6: safety gates remain fatal (dirty tree, wrong branch, drift)", () => {
  // A. Dirty tree
  let ps = `
    try {
      ${buildSimulationScript({ gitStatus: " M dirty-file.ts" })}
    } catch {
      Write-Output "CAUGHT_ERROR: $($_.Exception.Message)"
    }
  `;
  let out = runPowerShell(ps);
  assert.match(
    out,
    /CAUGHT_ERROR: Refusing production deployment from a dirty working tree\./,
  );

  // B. Wrong branch
  ps = `
    try {
      ${buildSimulationScript({ gitBranch: "feature/something" })}
    } catch {
      Write-Output "CAUGHT_ERROR: $($_.Exception.Message)"
    }
  `;
  out = runPowerShell(ps);
  assert.match(
    out,
    /CAUGHT_ERROR: Refusing production deployment: current branch is 'feature\/something', expected 'main'\./,
  );

  // C. Local-main drift
  ps = `
    try {
      ${buildSimulationScript({ headSha: "sha_A", originSha: "sha_B" })}
    } catch {
      Write-Output "CAUGHT_ERROR: $($_.Exception.Message)"
    }
  `;
  out = runPowerShell(ps);
  assert.match(
    out,
    /CAUGHT_ERROR: Refusing production deployment: local HEAD does not equal origin\/main\./,
  );
});
