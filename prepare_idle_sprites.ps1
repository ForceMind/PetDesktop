$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sheetDir = Join-Path $projectDir 'assets\sprite_sheets'
$idleDir = Join-Path $projectDir 'assets\idle'
$tempRoot = Join-Path $projectDir 'tmp\idle_green'

$sheets = @(
    [PSCustomObject]@{ Name = 'idle_follow_green.png'; Prefix = 'idle_follow' },
    [PSCustomObject]@{ Name = 'idle_life_green.png'; Prefix = 'idle_life' }
)

$resolvedProject = [System.IO.Path]::GetFullPath($projectDir)
$resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
if (-not $resolvedTemp.StartsWith($resolvedProject + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Unsafe temporary path: $resolvedTemp"
}
if ([System.IO.Directory]::Exists($resolvedTemp)) {
    [System.IO.Directory]::Delete($resolvedTemp, $true)
}
[System.IO.Directory]::CreateDirectory($resolvedTemp) | Out-Null
[System.IO.Directory]::CreateDirectory($idleDir) | Out-Null
Add-Type -AssemblyName System.Drawing

foreach ($sheetDefinition in $sheets) {
    $sheetPath = Join-Path $sheetDir $sheetDefinition.Name
    if (-not (Test-Path -LiteralPath $sheetPath)) {
        throw "Missing idle sprite sheet: $sheetPath"
    }

    $sheet = [System.Drawing.Bitmap]::FromFile($sheetPath)
    try {
        $frameNumber = 1
        for ($row = 0; $row -lt 2; $row++) {
            for ($column = 0; $column -lt 4; $column++) {
                $left = [int][Math]::Round($column * $sheet.Width / 4.0)
                $right = [int][Math]::Round(($column + 1) * $sheet.Width / 4.0)
                $top = [int][Math]::Round($row * $sheet.Height / 2.0)
                $bottom = [int][Math]::Round(($row + 1) * $sheet.Height / 2.0)
                $cell = New-Object System.Drawing.Bitmap ($right - $left),($bottom - $top),([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                $graphics = [System.Drawing.Graphics]::FromImage($cell)
                try {
                    $destination = New-Object System.Drawing.Rectangle 0,0,$cell.Width,$cell.Height
                    $source = New-Object System.Drawing.Rectangle $left,$top,($right - $left),($bottom - $top)
                    $graphics.DrawImage($sheet, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
                    $greenPath = Join-Path $resolvedTemp ('{0}_{1:D2}_green.png' -f $sheetDefinition.Prefix,$frameNumber)
                    $cell.Save($greenPath, [System.Drawing.Imaging.ImageFormat]::Png)
                }
                finally {
                    $graphics.Dispose()
                    $cell.Dispose()
                }
                $frameNumber++
            }
        }
    }
    finally {
        $sheet.Dispose()
    }
}

$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$chromaHelper = Join-Path $codexRoot 'skills\.system\imagegen\scripts\remove_chroma_key.py'
if (-not (Test-Path -LiteralPath $chromaHelper)) {
    throw "Missing chroma-key helper: $chromaHelper"
}

Push-Location $resolvedTemp
try {
    foreach ($prefix in @('idle_follow', 'idle_life')) {
        for ($number = 1; $number -le 8; $number++) {
            $inputName = '{0}_{1:D2}_green.png' -f $prefix,$number
            $outputPath = Join-Path $idleDir ('{0}_{1:D2}.png' -f $prefix,$number)
            & python $chromaHelper --input $inputName --out $outputPath --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --force
            if ($LASTEXITCODE -ne 0) {
                throw "Chroma-key removal failed for $prefix frame $number."
            }
        }
    }
}
finally {
    Pop-Location
}

$cleanupScript = Join-Path $projectDir 'tools\cleanup_alpha_specks.py'
& python $cleanupScript --dir $idleDir --pattern 'idle_*.png' --min-pixels 200 --relative-threshold 0.001
if ($LASTEXITCODE -ne 0) {
    throw 'Idle alpha cleanup failed.'
}

[System.IO.Directory]::Delete($resolvedTemp, $true)
$tempParent = Split-Path -Parent $resolvedTemp
if ([System.IO.Directory]::Exists($tempParent) -and
    [System.IO.Directory]::GetFileSystemEntries($tempParent).Length -eq 0) {
    [System.IO.Directory]::Delete($tempParent)
}

Write-Host "Prepared 16 transparent idle sprites in: $idleDir"
