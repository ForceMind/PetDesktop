$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' |
    Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before testing animation continuity.' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$assembly = [System.Reflection.Assembly]::LoadFile($exe)
$type = $assembly.GetType('CocoDesktopPet.DesktopPetForm', $true)
$flags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
$form = [System.Activator]::CreateInstance($type, $true)

function Get-BitmapHash([System.Drawing.Bitmap]$bitmap) {
    $stream = New-Object System.IO.MemoryStream
    try {
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($sha.ComputeHash($stream.ToArray()))).Replace('-', '')
        }
        finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
}

try {
    $actions = $type.GetField('actionFrameImages', $flags).GetValue($form)
    $idles = $type.GetField('idleOutfitFrameImages', $flags).GetValue($form)
    $neutral = $type.GetField('petImage', $flags).GetValue($form)
    $petWidth = [int]$type.GetField('petWidth', $flags).GetValue($form)
    $petHeight = [int]$type.GetField('petHeight', $flags).GetValue($form)

    if ($null -eq $actions -or $actions.Length -ne 32) {
        throw "Expected 32 authored action sequences, found $($actions.Length)."
    }
    if ($null -eq $idles -or $idles.Length -ne 5) {
        throw "Expected five regenerated outfit idle sequences, found $($idles.Length)."
    }
    if ($petWidth -ne $petHeight) {
        throw "The square authored canvas is being stretched to ${petWidth}x${petHeight}."
    }

    $neutralHash = Get-BitmapHash $neutral
    $middleHashes = [System.Collections.Generic.HashSet[string]]::new()
    for ($action = 0; $action -lt $actions.Length; $action++) {
        $sequence = $actions[$action]
        if ($sequence.Length -ne 8) {
            throw "Action $($action + 1) does not contain eight whole-character frames."
        }
        foreach ($frame in $sequence) {
            if ($frame.Width -ne 512 -or $frame.Height -ne 512) {
                throw "Action $($action + 1) contains a non-512 square frame."
            }
        }
        if ((Get-BitmapHash $sequence[0]) -ne $neutralHash -or
            (Get-BitmapHash $sequence[7]) -ne $neutralHash) {
            throw "Action $($action + 1) does not use the exact neutral endpoint."
        }
        [void]$middleHashes.Add((Get-BitmapHash $sequence[4]))
    }
    if ($middleHashes.Count -lt 30) {
        throw "Only $($middleHashes.Count) distinct authored action poses were detected."
    }

    $outfitNeutralHashes = [System.Collections.Generic.HashSet[string]]::new()
    for ($outfit = 0; $outfit -lt $idles.Length; $outfit++) {
        $sequence = $idles[$outfit]
        if ($sequence.Length -ne 7) {
            throw "Outfit $outfit does not contain seven complete idle frames."
        }
        if ((Get-BitmapHash $sequence[0]) -ne (Get-BitmapHash $sequence[6])) {
            throw "Outfit $outfit idle loop does not close on its exact first frame."
        }
        [void]$outfitNeutralHashes.Add((Get-BitmapHash $sequence[0]))
    }
    if ($outfitNeutralHashes.Count -ne 5) {
        throw 'One or more outfits are still overlays instead of regenerated full frames.'
    }

    foreach ($fieldName in @('rigCore', 'rigArmLeft', 'rigArmRight', 'rigLegLeft',
                              'rigLegRight', 'outfitScarf', 'outfitCape',
                              'outfitGlasses', 'outfitCap')) {
        if ($null -ne $type.GetField($fieldName, $flags).GetValue($form)) {
            throw "Legacy layered renderer resource is still loaded: $fieldName"
        }
    }

    [PSCustomObject]@{
        ActionsChecked = 32
        DistinctMiddlePoses = $middleHashes.Count
        OutfitIdleSequences = 5
        WholeCharacterFramesOnly = $true
        ByteIdenticalActionEndpoints = $true
        ByteIdenticalIdleLoopEndpoints = $true
        SquareCanvasWithoutStretch = $true
        LegacyRigNotLoaded = $true
        Passed = $true
    }
}
finally {
    $form.Dispose()
}
