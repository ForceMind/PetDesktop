param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$serverRoot = Join-Path $repoRoot 'ai-game-server'
$envFile = Join-Path $serverRoot '.env'
$envExample = Join-Path $serverRoot '.env.example'
$packageLock = Join-Path $serverRoot 'package-lock.json'
$serverEntry = Join-Path $serverRoot 'dist\server.mjs'
$runState = Join-Path $serverRoot '.local-run'
$pidFile = Join-Path $runState 'server.pid'
$demoUrl = ''
$demoDisplayUrl = ''
$settingsUrl = ''
$healthUrl = ''
$startedProcess = $null

function Invoke-Npm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Test-CocoHealth {
    try {
        $result = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return [bool]($result.ok -and $result.service -eq 'coco-ai-game')
    }
    catch {
        return $false
    }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js 20 or newer is required. Install Node.js, then run this script again.'
}

$nodeMajor = [int]((& node.exe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required; current version is $(& node.exe --version)."
}

if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created $envFile from .env.example."
}

$port = 8787
$portLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -Last 1
if ($portLine -and $portLine -match '^\s*PORT\s*=\s*(\d+)\s*$') {
    $port = [int]$Matches[1]
}
$demoUrl = "http://localhost:$port/"
$demoDisplayUrl = $demoUrl
$settingsUrl = "http://localhost:$port/settings"
$healthUrl = "http://localhost:$port/api/slot/health"

Push-Location $serverRoot
try {
    if (-not $SkipInstall -or -not (Test-Path -LiteralPath (Join-Path $serverRoot 'node_modules'))) {
        if (Test-Path -LiteralPath $packageLock) {
            Invoke-Npm ci
        }
        else {
            Invoke-Npm install
        }
    }

    Invoke-Npm test
    Invoke-Npm run build

    if (Test-CocoHealth) {
        Write-Host 'Coco Chat is already running.'
    }
    else {
        New-Item -ItemType Directory -Path $runState -Force | Out-Null
        $startedProcess = Start-Process -FilePath $nodeCommand.Source `
            -ArgumentList @($serverEntry) `
            -WorkingDirectory $serverRoot `
            -WindowStyle Hidden `
            -PassThru
        Set-Content -LiteralPath $pidFile -Value $startedProcess.Id -Encoding ascii

        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
            if ($startedProcess.HasExited) {
                throw "Server exited before becoming healthy (exit code $($startedProcess.ExitCode))."
            }
            if (Test-CocoHealth) {
                $ready = $true
                break
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) {
            throw 'Server did not become healthy within 10 seconds.'
        }
    }

    Write-Host ''
    Write-Host 'Coco Chat is ready:'
    Write-Host "  $demoDisplayUrl"
    Write-Host "  Settings: $settingsUrl"
    Write-Host "  Config: $envFile"

    if (-not $NoBrowser -and -not $SmokeTest) {
        Start-Process $demoUrl
    }

    if ($SmokeTest) {
        Write-Host 'Smoke test passed.'
    }
    else {
        Write-Host ''
        Read-Host 'Press Enter to stop the local server'
    }
}
finally {
    Pop-Location
    if ($startedProcess -and -not $startedProcess.HasExited) {
        Stop-Process -Id $startedProcess.Id
        $null = $startedProcess.WaitForExit(5000)
    }
    if ($startedProcess -and (Test-Path -LiteralPath $pidFile)) {
        Remove-Item -LiteralPath $pidFile -Force
    }
}
