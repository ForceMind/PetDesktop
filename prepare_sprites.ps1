$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sheetDir = Join-Path $projectDir 'assets\sprite_sheets'
$poseDir = Join-Path $projectDir 'assets\poses'
$tempRoot = Join-Path $projectDir 'tmp'
$tempGreen = Join-Path $tempRoot 'sprites_green'

$sheetSets = @(
    [PSCustomObject]@{
        Suffix = ''
        Sheets = @(
            'actions_01_08_green.png',
            'actions_09_16_green.png',
            'actions_17_24_green.png',
            'actions_25_32_green.png'
        )
    },
    [PSCustomObject]@{
        Suffix = '_b'
        Sheets = @(
            'actions_01_08_b_green.png',
            'actions_09_16_b_green.png',
            'actions_17_24_b_green.png',
            'actions_25_32_b_green.png'
        )
    }
)

foreach ($sheetSet in $sheetSets) {
    foreach ($sheetName in $sheetSet.Sheets) {
        $sheetPath = Join-Path $sheetDir $sheetName
        if (-not (Test-Path -LiteralPath $sheetPath)) {
            throw "Missing sprite sheet: $sheetPath"
        }
    }
}

$resolvedProject = [System.IO.Path]::GetFullPath($projectDir)
$resolvedTemp = [System.IO.Path]::GetFullPath($tempGreen)
if (-not $resolvedTemp.StartsWith($resolvedProject + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Unsafe temporary path: $resolvedTemp"
}
if ([System.IO.Directory]::Exists($resolvedTemp)) {
    [System.IO.Directory]::Delete($resolvedTemp, $true)
}

[System.IO.Directory]::CreateDirectory($tempGreen) | Out-Null
[System.IO.Directory]::CreateDirectory($poseDir) | Out-Null
Add-Type -AssemblyName System.Drawing

$actionNumber = 1
foreach ($sheetSet in $sheetSets) {
    $actionNumber = 1
    foreach ($sheetName in $sheetSet.Sheets) {
        $sheetPath = Join-Path $sheetDir $sheetName
        $sheet = [System.Drawing.Bitmap]::FromFile($sheetPath)
        try {
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
                        $greenName = 'action_{0:D2}{1}_green.png' -f $actionNumber,$sheetSet.Suffix
                        $greenPath = Join-Path $tempGreen $greenName
                        $cell.Save($greenPath, [System.Drawing.Imaging.ImageFormat]::Png)
                    }
                    finally {
                        $graphics.Dispose()
                        $cell.Dispose()
                    }
                    $actionNumber++
                }
            }
        }
        finally {
            $sheet.Dispose()
        }
    }
}

$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$chromaHelper = Join-Path $codexRoot 'skills\.system\imagegen\scripts\remove_chroma_key.py'
if (-not (Test-Path -LiteralPath $chromaHelper)) {
    throw "Missing chroma-key helper: $chromaHelper"
}

Push-Location $tempGreen
try {
    foreach ($suffix in @('', '_b')) {
        for ($number = 1; $number -le 32; $number++) {
            $inputName = 'action_{0:D2}{1}_green.png' -f $number,$suffix
            $outputPath = Join-Path $poseDir ('action_{0:D2}{1}.png' -f $number,$suffix)
            & python $chromaHelper --input $inputName --out $outputPath --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --force
            if ($LASTEXITCODE -ne 0) {
                throw "Chroma-key removal failed for action $number$suffix."
            }
        }
    }
}
finally {
    Pop-Location
}

$cleanupScript = Join-Path $projectDir 'tools\cleanup_alpha_specks.py'
if (-not (Test-Path -LiteralPath $cleanupScript)) {
    throw "Missing alpha cleanup helper: $cleanupScript"
}

& python $cleanupScript --dir $poseDir
if ($LASTEXITCODE -ne 0) {
    throw 'Alpha speck cleanup failed.'
}

[System.IO.Directory]::Delete($resolvedTemp, $true)
if ([System.IO.Directory]::Exists($tempRoot) -and
    [System.IO.Directory]::GetFileSystemEntries($tempRoot).Length -eq 0) {
    [System.IO.Directory]::Delete($tempRoot)
}

Write-Host "Prepared 64 transparent action sprites in: $poseDir"
