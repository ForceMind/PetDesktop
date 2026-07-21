$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' |
    Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before testing click regions.' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$assembly = [System.Reflection.Assembly]::LoadFile($exe)
$type = $assembly.GetType('CocoDesktopPet.DesktopPetForm', $true)
$flags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
$boundsField = $type.GetField('lastCharacterBounds', $flags)
$classifyMethod = $type.GetMethod('ClassifyClickRegion', $flags)
$form = [System.Activator]::CreateInstance($type, $true)

try {
    $boundsField.SetValue($form, [System.Drawing.Rectangle]::new(0, 0, 100, 100))
    $cases = [ordered]@{
        Head = [System.Drawing.Point]::new(50, 10)
        FaceLeft = [System.Drawing.Point]::new(25, 32)
        FaceRight = [System.Drawing.Point]::new(75, 32)
        LeftPaw = [System.Drawing.Point]::new(15, 62)
        Body = [System.Drawing.Point]::new(50, 62)
        RightPaw = [System.Drawing.Point]::new(85, 62)
        Feet = [System.Drawing.Point]::new(50, 90)
    }

    $results = foreach ($expected in $cases.Keys) {
        $actual = $classifyMethod.Invoke($form, @($cases[$expected])).ToString()
        [PSCustomObject]@{ Expected = $expected; Actual = $actual; Passed = $actual -eq $expected }
    }
    $results | Format-Table -AutoSize
    if (@($results | Where-Object { -not $_.Passed }).Count -ne 0) {
        throw 'One or more click-region mappings failed.'
    }
    Write-Host 'All seven click regions passed.'
}
finally {
    $form.Dispose()
}
