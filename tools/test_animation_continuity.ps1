$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' |
    Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before testing animation continuity.' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$assembly = [System.Reflection.Assembly]::LoadFile($exe)
$type = $assembly.GetType('CocoDesktopPet.DesktopPetForm', $true)
$instanceFlags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
$staticFlags = [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::NonPublic
$form = [System.Activator]::CreateInstance($type, $true)

try {
    $interactionField = $type.GetField('interaction', $instanceFlags)
    $startedField = $type.GetField('interactionStarted', $instanceFlags)
    $idleStartedField = $type.GetField('idleStarted', $instanceFlags)
    $baseField = $type.GetField('petImage', $instanceFlags)
    $actionFramesField = $type.GetField('actionFrameImages', $instanceFlags)
    $petWidthField = $type.GetField('petWidth', $instanceFlags)
    $petHeightField = $type.GetField('petHeight', $instanceFlags)
    $timelineMethod = $type.GetMethod('GetFrameTimeline', $instanceFlags)
    $durationMethod = $type.GetMethod('InteractionDuration', $staticFlags)
    $enumType = $interactionField.FieldType
    $baseFrame = $baseField.GetValue($form)
    $actionFrames = $actionFramesField.GetValue($form)

    if ($petWidthField.GetValue($form) -ne $petHeightField.GetValue($form)) {
        throw 'The square animation canvas is being stretched at runtime.'
    }
    if ($actionFrames.Length -ne 32) { throw 'Runtime did not load 32 action timelines.' }

    $sharedStarts = 0
    $sharedEnds = 0
    $authoredFramesVisited = 0
    for ($action = 1; $action -le 32; $action++) {
        $kind = [System.Enum]::ToObject($enumType, $action)
        $interactionField.SetValue($form, $kind)
        $duration = [double]$durationMethod.Invoke($null, @($kind))

        $startedField.SetValue($form, [DateTime]::UtcNow)
        $startArgs = [object[]]@($null, $null, [single]0)
        $timelineMethod.Invoke($form, $startArgs) | Out-Null
        if (-not [object]::ReferenceEquals($startArgs[0], $baseFrame) -or
            [single]$startArgs[2] -gt 0.01) {
            throw "Action $action does not begin on the shared idle base frame."
        }
        $sharedStarts++

        for ($frame = 1; $frame -le 8; $frame++) {
            $progress = $frame / 9.0
            $startedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(-$duration * $progress))
            $frameArgs = [object[]]@($null, $null, [single]0)
            $timelineMethod.Invoke($form, $frameArgs) | Out-Null
            $expected = $actionFrames[$action - 1][$frame - 1]
            if (-not [object]::ReferenceEquals($frameArgs[0], $expected) -or
                [single]$frameArgs[2] -gt 0.02) {
                throw "Action $action did not visit authored keyframe $frame."
            }
            $authoredFramesVisited++
        }

        $startedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(-$duration - 10))
        $endArgs = [object[]]@($null, $null, [single]0)
        $timelineMethod.Invoke($form, $endArgs) | Out-Null
        if (-not [object]::ReferenceEquals($endArgs[0], $baseFrame) -or
            [single]$endArgs[2] -gt 0.01) {
            throw "Action $action does not end on the exact shared idle base frame."
        }
        $sharedEnds++
    }

    $interactionField.SetValue($form, [System.Enum]::ToObject($enumType, 0))
    $idleStartedField.SetValue($form, [DateTime]::UtcNow)
    $idleArgs = [object[]]@($null, $null, [single]0)
    $timelineMethod.Invoke($form, $idleArgs) | Out-Null
    if (-not [object]::ReferenceEquals($idleArgs[0], $baseFrame)) {
        throw 'Idle does not start on the same shared base frame.'
    }

    [PSCustomObject]@{
        ActionsChecked = 32
        AuthoredActionFramesVisited = $authoredFramesVisited
        ActionsStartingOnSharedIdleFrame = $sharedStarts
        ActionsEndingOnSharedIdleFrame = $sharedEnds
        IdleStartsOnSharedFrame = $true
        SquareCanvasNoStretch = $true
        Passed = $true
    }
}
finally {
    $form.Dispose()
}
