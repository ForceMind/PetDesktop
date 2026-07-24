$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env"
$values = @{}
foreach ($line in Get-Content -LiteralPath $envFile -Encoding utf8) {
    if ($line -notmatch "^\s*([A-Z][A-Z0-9_]*)=(.*)$") { continue }
    $value = $Matches[2].Trim()
    if (
        $value.Length -ge 2 -and (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        )
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$Matches[1]] = $value
}

$demoUserId = [string]$values["GAME_TEST_ACCOUNT_ID"]
$demoLobbyIg = [string]$values["GAME_LOBBY_IG"]
if (-not $demoUserId -or -not $demoLobbyIg) {
    throw "GAME_TEST_ACCOUNT_ID and GAME_LOBBY_IG are required."
}

$demoUrl = "http://localhost:8787/?ai=1&userId=$([uri]::EscapeDataString($demoUserId))&ig=$([uri]::EscapeDataString($demoLobbyIg))"
Start-Process -FilePath $demoUrl
Write-Host "Opened Coco with the configured address-bar session parameters."
