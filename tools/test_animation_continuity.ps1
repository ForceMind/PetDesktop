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
$staticFlags = [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::NonPublic
$form = [System.Activator]::CreateInstance($type, $true)

try {
    $interactionField = $type.GetField('interaction', $flags)
    $startedField = $type.GetField('interactionStarted', $flags)
    $petXField = $type.GetField('petScreenX', $flags)
    $petYField = $type.GetField('petScreenY', $flags)
    $petWidthField = $type.GetField('petWidth', $flags)
    $petHeightField = $type.GetField('petHeight', $flags)
    $gazeXField = $type.GetField('gazeX', $flags)
    $updateGaze = $type.GetMethod('UpdateContinuousGaze', $flags)
    $calculate = $type.GetMethod('CalculateAnimation', $flags)
    $durationMethod = $type.GetMethod('InteractionDuration', $staticFlags)
    $enumType = $interactionField.FieldType

    $petXField.SetValue($form, 600)
    $petYField.SetValue($form, 350)
    $centerX = 600 + [int]$petWidthField.GetValue($form) / 2
    $centerY = 350 + [int]$petHeightField.GetValue($form) * 0.3

    [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new($centerX + 700, $centerY)
    1..40 | ForEach-Object { $updateGaze.Invoke($form, @()) }
    $rightGaze = [double]$gazeXField.GetValue($form)
    [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new($centerX - 700, $centerY)
    1..80 | ForEach-Object { $updateGaze.Invoke($form, @()) }
    $leftGaze = [double]$gazeXField.GetValue($form)
    if ($rightGaze -le 0.8 -or $leftGaze -ge -0.8) {
        throw "Cursor direction mapping failed: right=$rightGaze left=$leftGaze"
    }

    $maxStep = 0.0
    $maxEndpointError = 0.0
    for ($action = 1; $action -le 32; $action++) {
        $kind = [System.Enum]::ToObject($enumType, $action)
        $interactionField.SetValue($form, $kind)
        $duration = [double]$durationMethod.Invoke($null, @($kind))
        $previous = $null
        for ($frame = 0; $frame -le 100; $frame++) {
            $progress = $frame / 100.0
            $startedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(-$duration * $progress))
            $values = [object[]]@(
                [single]0, [single]0, [single]0, [single]0, [single]0)
            $calculate.Invoke($form, $values) | Out-Null
            $current = @($values | ForEach-Object { [double]$_ })
            if ($previous) {
                $step = 0.0
                for ($index = 0; $index -lt 5; $index++) {
                    $step = [Math]::Max($step, [Math]::Abs($current[$index] - $previous[$index]))
                }
                $maxStep = [Math]::Max($maxStep, $step)
            }
            $previous = $current
        }

        $rotation = (($previous[4] % 360.0) + 360.0) % 360.0
        $rotationError = [Math]::Min($rotation, 360.0 - $rotation)
        $endpointError = [Math]::Max(
            [Math]::Max([Math]::Abs($previous[0]), [Math]::Abs($previous[1])),
            [Math]::Max(
                [Math]::Max([Math]::Abs($previous[2] - 1.0), [Math]::Abs($previous[3] - 1.0)),
                $rotationError))
        $maxEndpointError = [Math]::Max($maxEndpointError, $endpointError)
    }

    if ($maxStep -gt 20.0) { throw "A frame-to-frame transform jump is too large: $maxStep" }
    if ($maxEndpointError -gt 0.15) { throw "An action does not return to idle: $maxEndpointError" }

    [PSCustomObject]@{
        ActionsChecked = 32
        SamplesPerAction = 101
        RightCursorProducesPositiveGaze = ($rightGaze -gt 0)
        LeftCursorProducesNegativeGaze = ($leftGaze -lt 0)
        MaximumFrameTransformStep = [Math]::Round($maxStep, 4)
        MaximumIdleReturnError = [Math]::Round($maxEndpointError, 4)
        Passed = $true
    }
}
finally {
    $form.Dispose()
}
