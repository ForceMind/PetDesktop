param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$webAssets = Join-Path $repoRoot 'web\assets'
$sourceAssets = Join-Path $repoRoot 'assets'

if ($Remove) {
    if (Test-Path -LiteralPath $webAssets) {
        $item = Get-Item -LiteralPath $webAssets -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
            throw "Refusing to remove a non-junction path: $webAssets"
        }
        # PowerShell 5.1 can throw a NullReferenceException when Remove-Item
        # targets a directory junction. Directory.Delete removes only the
        # junction itself (never the target directory).
        [System.IO.Directory]::Delete($webAssets, $false)
    }
    Write-Host 'Web preview junction removed.'
    exit 0
}

if (Test-Path -LiteralPath $webAssets) {
    Write-Host "Web preview assets already exist: $webAssets"
    exit 0
}

New-Item -ItemType Junction -Path $webAssets -Target $sourceAssets | Out-Null
Write-Host "Web preview ready. Serve the repository root and open /web/."
