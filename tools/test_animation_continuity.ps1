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

function Get-PoseValues($pose) {
    @($pose.GetType().GetFields($instanceFlags) | ForEach-Object { [single]$_.GetValue($pose) })
}

function Get-MotionValues($method, $target) {
    $arguments = [object[]]@([single]0, [single]0, [single]1, [single]1, [single]0)
    $method.Invoke($target, $arguments) | Out-Null
    @($arguments | ForEach-Object { [single]$_ })
}

try {
    $interactionField = $type.GetField('interaction', $instanceFlags)
    $startedField = $type.GetField('interactionStarted', $instanceFlags)
    $actionFramesField = $type.GetField('actionFrameImages', $instanceFlags)
    $petWidthField = $type.GetField('petWidth', $instanceFlags)
    $petHeightField = $type.GetField('petHeight', $instanceFlags)
    $poseMethod = $type.GetMethod('CalculateRigPose', $instanceFlags)
    $motionMethod = $type.GetMethod('CalculateAnimation', $instanceFlags)
    $durationMethod = $type.GetMethod('InteractionDuration', $staticFlags)
    $enumType = $interactionField.FieldType

    if ($null -ne $actionFramesField.GetValue($form)) {
        throw 'Independent generated pose frames are still loaded by the live renderer.'
    }
    $ratio = [double]$petWidthField.GetValue($form) / [double]$petHeightField.GetValue($form)
    if ([Math]::Abs($ratio - (745.0 / 1205.0)) -gt 0.005) {
        throw 'The original Coco aspect ratio is not preserved.'
    }
    foreach ($fieldName in @('rigCore', 'rigArmLeft', 'rigArmRight', 'rigLegLeft',
                              'rigLegRight', 'outfitScarf', 'outfitCape',
                              'outfitGlasses', 'outfitCap')) {
        if ($null -eq $type.GetField($fieldName, $instanceFlags).GetValue($form)) {
            throw "Live rig resource was not loaded: $fieldName"
        }
    }

    $signatures = [System.Collections.Generic.HashSet[string]]::new()
    $actionsWithJointMotion = 0
    for ($action = 1; $action -le 32; $action++) {
        $kind = [System.Enum]::ToObject($enumType, $action)
        $interactionField.SetValue($form, $kind)
        $duration = [double]$durationMethod.Invoke($null, @($kind))

        $startedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(100))
        $startPose = Get-PoseValues ($poseMethod.Invoke($form, @()))
        if (($startPose | Where-Object { [Math]::Abs($_) -gt 0.08 }).Count -gt 0) {
            throw "Action $action does not start from the neutral idle rig."
        }

        $signatureValues = @()
        $hasJointMotion = $false
        foreach ($sampleProgress in @(0.25, 0.50, 0.75)) {
            $startedField.SetValue($form,
                [DateTime]::UtcNow.AddMilliseconds(-$duration * $sampleProgress))
            $samplePose = Get-PoseValues ($poseMethod.Invoke($form, @()))
            $sampleMotion = Get-MotionValues $motionMethod $form
            if (($samplePose | Where-Object { [Math]::Abs($_) -gt 0.25 }).Count -gt 0) {
                $hasJointMotion = $true
            }
            $signatureValues += @($samplePose + $sampleMotion |
                ForEach-Object { [Math]::Round($_, 1) })
        }
        if ($hasJointMotion) { $actionsWithJointMotion++ }
        [void]$signatures.Add(($signatureValues -join ','))

        $startedField.SetValue($form, [DateTime]::UtcNow.AddMilliseconds(-$duration - 100))
        $endPose = Get-PoseValues ($poseMethod.Invoke($form, @()))
        if (($endPose | Where-Object { [Math]::Abs($_) -gt 0.10 }).Count -gt 0) {
            throw "Action $action does not return to the neutral idle rig."
        }
    }

    if ($signatures.Count -lt 30) {
        throw "Only $($signatures.Count) distinct action trajectories were detected."
    }
    if ($actionsWithJointMotion -lt 30) {
        throw "Only $actionsWithJointMotion actions visibly move a hand, foot, or head."
    }

    [PSCustomObject]@{
        ActionsChecked = 32
        DistinctTrajectories = $signatures.Count
        ActionsWithJointMotion = $actionsWithJointMotion
        SameRigAtEveryFrame = $true
        NeutralStartAndEnd = $true
        OutfitResourcesBoundToRig = $true
        OriginalAspectRatio = $true
        Passed = $true
    }
}
finally {
    $form.Dispose()
}
