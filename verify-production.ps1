$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Error "PRODUCTION_VERIFY_FAIL: $Message"
  exit 1
}

$repo = (Resolve-Path $PSScriptRoot).Path
$baselinePath = Join-Path $repo '101-PRODUCTION-BASELINE.json'
if (-not (Test-Path -LiteralPath $baselinePath)) { Fail 'baseline file is missing' }
$baseline = Get-Content -LiteralPath $baselinePath -Raw | ConvertFrom-Json

if ($repo -ne $baseline.repository.path) { Fail "run from approved path: $($baseline.repository.path)" }
if ((git rev-parse --show-toplevel).Trim() -ne $repo) { Fail 'not the approved Git repository' }
if ((git remote get-url origin).Trim() -ne $baseline.repository.remote) { Fail 'origin URL mismatch' }
if ((git branch --show-current).Trim() -ne $baseline.repository.branch) { Fail 'branch mismatch' }
if ((git status --porcelain)) { Fail 'working tree is not clean' }
$approvedCommit = (git rev-parse $baseline.repository.approvedRef).Trim()
if ((git rev-parse HEAD).Trim() -ne $approvedCommit) { Fail 'HEAD does not match approved baseline tag' }

$remoteHead = (git ls-remote origin "refs/heads/$($baseline.repository.branch)").Split("`t")[0].Trim()
if ($remoteHead -ne $approvedCommit) { Fail 'origin/main does not match approved baseline tag' }

Push-Location (Join-Path $repo 'cloudflare-worker')
try { npm.cmd test | Out-Host } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { Fail 'Worker npm test failed' }

foreach ($file in @('script.js', 'cloudflare-worker/src/index.js', 'functions/index.js')) {
  node --check (Join-Path $repo $file) | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "node --check failed: $file" }
}

git diff --check | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'git diff --check failed' }

firebase deploy --only database --project $baseline.services.firebaseProject --dry-run | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'Firebase Rules dry-run failed' }

$headers = curl.exe -sS -D - -o NUL 'https://coffee-101-ai-chat.coffee101.workers.dev/'
$workerBuild = ($headers | Where-Object { $_ -match '^X-Worker-Build:\s*(.+)$' } | ForEach-Object { $Matches[1].Trim() } | Select-Object -First 1)
if ($workerBuild -ne $baseline.services.cloudflareWorkerBuild) { Fail 'live Worker build header mismatch' }

Write-Output 'PRODUCTION_VERIFY_PASS'
