$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' |
    Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before testing system-language behavior.' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$assembly = [System.Reflection.Assembly]::LoadFile($exe)
$type = $assembly.GetType('CocoDesktopPet.DesktopPetForm', $true)
$flags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
$menuField = $type.GetField('contextMenu', $flags)
$languageMenuField = $type.GetField('languageMenuItem', $flags)
$languageField = $type.GetField('dialogueLanguage', $flags)
$systemChineseField = $type.GetField('systemUsesChineseUi', $flags)
$englishMenuField = $type.GetField('englishLanguageMenuItem', $flags)
$staticFlags = [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::NonPublic
$systemLanguageMethod = $type.GetMethod('SystemUsesChineseUi', $staticFlags)

function Get-VisibleMenuText([System.Windows.Forms.ToolStripItemCollection]$items) {
    foreach ($item in $items) {
        if ($item -is [System.Windows.Forms.ToolStripSeparator]) { continue }
        $item.Text
        if ($item -is [System.Windows.Forms.ToolStripMenuItem] -and $item.DropDownItems.Count -gt 0) {
            Get-VisibleMenuText $item.DropDownItems
        }
    }
}

$originalCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
$originalUiCulture = [System.Threading.Thread]::CurrentThread.CurrentUICulture
try {
    foreach ($cultureName in @('zh-CN', 'zh-TW')) {
        [System.Threading.Thread]::CurrentThread.CurrentUICulture =
            [System.Globalization.CultureInfo]::GetCultureInfo($cultureName)
        if (-not $systemLanguageMethod.Invoke($null, @())) {
            throw "$cultureName was not detected as a Chinese system."
        }
    }

    [System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
    $englishForm = [System.Activator]::CreateInstance($type, $true)
    try {
        $englishMenu = $menuField.GetValue($englishForm)
        $languageMenu = $languageMenuField.GetValue($englishForm)
        $visibleEnglishText = (Get-VisibleMenuText $englishMenu.Items) -join "`n"
        if ($systemChineseField.GetValue($englishForm)) {
            throw 'en-US was incorrectly detected as a Chinese system.'
        }
        if ($languageField.GetValue($englishForm).ToString() -ne 'English') {
            throw 'A non-Chinese system did not default to English.'
        }
        if ($englishMenu.Items.Contains($languageMenu)) {
            throw 'The language switch is visible on a non-Chinese system.'
        }
        if ($englishForm.Text -ne 'Coco Desktop Pet') {
            throw "Unexpected English window title: $($englishForm.Text)"
        }
        if ($visibleEnglishText -match '[\u3400-\u9fff]') {
            throw "Chinese text is visible in the en-US menu:`n$visibleEnglishText"
        }
    }
    finally {
        $englishForm.Dispose()
    }

    [System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN')
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN')
    $chineseForm = [System.Activator]::CreateInstance($type, $true)
    try {
        $chineseMenu = $menuField.GetValue($chineseForm)
        $languageMenu = $languageMenuField.GetValue($chineseForm)
        if (-not $systemChineseField.GetValue($chineseForm)) {
            throw 'zh-CN was not detected as a Chinese system.'
        }
        if ($languageField.GetValue($chineseForm).ToString() -ne 'Chinese') {
            throw 'A Chinese system did not default to Chinese.'
        }
        if (-not $chineseMenu.Items.Contains($languageMenu)) {
            throw 'The Chinese/English switch is missing on a Chinese system.'
        }
        $visibleChineseText = (Get-VisibleMenuText $chineseMenu.Items) -join "`n"
        if ($visibleChineseText -notmatch '[\u3400-\u9fff]') {
            throw 'Chinese UI text is missing on a Chinese system.'
        }

        $englishMenuField.GetValue($chineseForm).PerformClick()
        if ($languageField.GetValue($chineseForm).ToString() -ne 'English') {
            throw 'The English selection did not activate English mode.'
        }
        if (-not $chineseMenu.Items.Contains($languageMenu)) {
            throw 'The language switch disappeared after selecting English on a Chinese system.'
        }
    }
    finally {
        $chineseForm.Dispose()
    }
}
finally {
    [System.Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = $originalUiCulture
}

Write-Host 'System-language behavior passed: en-US is English-only; zh-CN exposes the Chinese/English switch.'
