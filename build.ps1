param(
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $projectDir 'dist'
$assetPath = Join-Path $projectDir 'assets\coco.png'
$frameArchivePath = Join-Path $projectDir 'assets\frame_animation_v2\runtime_frames.zip'
$iconPath = Join-Path $projectDir 'assets\coco.ico'
$exeName = "Coco$([char]0x684c)$([char]0x5ba0).exe"
$outputPath = Join-Path $distDir $exeName

if (-not (Test-Path -LiteralPath $assetPath)) {
    throw "Missing character asset: $assetPath"
}
if (-not (Test-Path -LiteralPath $frameArchivePath)) {
    throw "Missing authored frame archive: $frameArchivePath. Run: py tools\prepare_frame_animation_v2.py"
}

if ($Clean -and (Test-Path -LiteralPath $distDir)) {
    $resolvedProject = [System.IO.Path]::GetFullPath($projectDir)
    $resolvedDist = [System.IO.Path]::GetFullPath($distDir)
    if (-not $resolvedDist.StartsWith($resolvedProject + [System.IO.Path]::DirectorySeparatorChar)) {
        throw "Refusing to clean a path outside the project: $resolvedDist"
    }
    Remove-Item -LiteralPath $resolvedDist -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (-not (Test-Path -LiteralPath $iconPath)) {
    Add-Type -AssemblyName System.Drawing
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CocoIconNative {
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr handle);
}
'@
    $source = [System.Drawing.Image]::FromFile($assetPath)
    $canvas = New-Object System.Drawing.Bitmap 128,128
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ratio = [Math]::Min(112.0 / $source.Width, 112.0 / $source.Height)
    $drawWidth = [int][Math]::Round($source.Width * $ratio)
    $drawHeight = [int][Math]::Round($source.Height * $ratio)
    $drawX = [int]((128 - $drawWidth) / 2)
    $drawY = [int]((128 - $drawHeight) / 2)
    $graphics.DrawImage($source, $drawX, $drawY, $drawWidth, $drawHeight)
    $graphics.Dispose()
    $source.Dispose()
    $iconHandle = $canvas.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
    try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $canvas.Dispose(); [CocoIconNative]::DestroyIcon($iconHandle) | Out-Null }
}

$compilerCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
    throw 'The Windows .NET Framework C# compiler was not found.'
}

$sourceFiles = @(
    (Join-Path $projectDir 'Program.cs'),
    (Join-Path $projectDir 'DesktopPetForm.cs'),
    (Join-Path $projectDir 'NativeMethods.cs'),
    (Join-Path $projectDir 'AssemblyInfo.cs')
)

$compilerArgs = @(
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/platform:anycpu',
    "/out:$outputPath",
    "/win32icon:$iconPath",
    "/win32manifest:$(Join-Path $projectDir 'app.manifest')",
    "/resource:$frameArchivePath,CocoDesktopPet.frame_animation.zip",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.IO.Compression.dll',
    '/reference:System.Windows.Forms.dll'
) + $sourceFiles

& $compiler $compilerArgs
$compileExitCode = $LASTEXITCODE
if ($compileExitCode -ne 0) {
    throw "Compilation failed with exit code: $compileExitCode"
}

Write-Host "Build complete: $outputPath"
