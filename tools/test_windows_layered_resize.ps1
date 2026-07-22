$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $repoRoot 'DesktopPetForm.cs') -Raw -Encoding UTF8

if ($source -match 'SetBounds\(') {
    throw 'Layered rendering must not expose the old bitmap through SetBounds.'
}
if ($source -notmatch 'ApplyLayeredBitmap\(frame, frameX, frameY\)') {
    throw 'Rendered frame position must be passed into the atomic layered update.'
}
if ($source -notmatch 'new NativeMethods\.Point\(destinationX, destinationY\)') {
    throw 'UpdateLayeredWindow must use the rendered destination coordinates.'
}

$setScaleStart = $source.IndexOf('private void SetScale(')
$dimensionsStart = $source.IndexOf('private void UpdatePetDimensions(', $setScaleStart)
if ($setScaleStart -lt 0 -or $dimensionsStart -lt 0) {
    throw 'Unable to inspect SetScale.'
}
$setScale = $source.Substring($setScaleStart, $dimensionsStart - $setScaleStart)
if ($setScale -notmatch 'if \(fromMenu\)') {
    throw 'Menu and wheel resize feedback must be separated.'
}
if ($setScale -match 'Scroll and watch me resize') {
    throw 'Wheel resize must not repeatedly grow the window with a new speech bubble.'
}

Write-Host 'Windows layered resize validation passed.'
