$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' |
    Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before testing autonomous idle behavior.' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$assembly = [System.Reflection.Assembly]::LoadFile($exe)
$type = $assembly.GetType('CocoDesktopPet.DesktopPetForm', $true)
$flags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
$interactionField = $type.GetField('interaction', $flags)
$idleFramesField = $type.GetField('idleOutfitFrameImages', $flags)
$idleActiveField = $type.GetField('idleGestureActive', $flags)
$idleStartedField = $type.GetField('idleGestureStarted', $flags)
$nextAutomaticField = $type.GetField('nextAutomaticInteractionAt', $flags)
$mouseDownField = $type.GetField('mouseIsDown', $flags)
$timelineMethod = $type.GetMethod('GetFrameTimeline', $flags)
$tickMethod = $type.GetMethod('AnimationTimerTick', $flags)
$none = [System.Enum]::Parse($interactionField.FieldType, 'None')

$originalCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
$originalUiCulture = [System.Threading.Thread]::CurrentThread.CurrentUICulture
[System.Threading.Thread]::CurrentThread.CurrentCulture =
    [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
[System.Threading.Thread]::CurrentThread.CurrentUICulture =
    [System.Globalization.CultureInfo]::GetCultureInfo('en-US')

$form = [System.Activator]::CreateInstance($type, $true)
try {
    $idleSequences = $idleFramesField.GetValue($form)
    $defaultSequence = $idleSequences.GetValue(0)
    $neutralFrame = $defaultSequence.GetValue(0)

    $interactionField.SetValue($form, $none)
    $idleActiveField.SetValue($form, $false)
    $nextAutomaticField.SetValue($form, [DateTime]::UtcNow.AddMinutes(1))
    $timelineArguments = @($null, $null, [single]0)
    $timelineMethod.Invoke($form, $timelineArguments) | Out-Null
    if (-not [object]::ReferenceEquals($timelineArguments[0], $neutralFrame)) {
        throw 'Quiet idle does not hold the neutral standing frame.'
    }

    $idleActiveField.SetValue($form, $true)
    $idleStartedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(-475))
    $timelineArguments = @($null, $null, [single]0)
    $timelineMethod.Invoke($form, $timelineArguments) | Out-Null
    if ([object]::ReferenceEquals($timelineArguments[0], $neutralFrame)) {
        throw 'An active idle gesture did not advance through its authored frames.'
    }

    $interactionField.SetValue($form, $none)
    $idleActiveField.SetValue($form, $false)
    $mouseDownField.SetValue($form, $false)
    $nextAutomaticField.SetValue($form, [DateTime]::UtcNow.AddSeconds(-1))
    $tickMethod.Invoke($form, @($null, [EventArgs]::Empty)) | Out-Null
    if ($interactionField.GetValue($form).ToString() -eq 'None') {
        throw 'An overdue autonomous performance did not start.'
    }

    $interactionField.SetValue($form, $none)
    $mouseDownField.SetValue($form, $true)
    $nextAutomaticField.SetValue($form, [DateTime]::UtcNow.AddSeconds(-1))
    $tickMethod.Invoke($form, @($null, [EventArgs]::Empty)) | Out-Null
    if ($interactionField.GetValue($form).ToString() -ne 'None') {
        throw 'An autonomous performance started while the pet was being dragged.'
    }
}
finally {
    $form.Dispose()
    [System.Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = $originalUiCulture
}

Write-Host 'Autonomous idle behavior passed: neutral holds, authored idle gestures, timed performances, and drag suppression.'
