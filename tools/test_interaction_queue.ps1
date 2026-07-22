$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$windowsSource = Get-Content -LiteralPath (Join-Path $repoRoot 'DesktopPetForm.cs') -Raw -Encoding UTF8
$macSource = Get-Content -LiteralPath (Join-Path $repoRoot 'macos\main.swift') -Raw -Encoding UTF8

function Require-Pattern([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -notmatch $Pattern) {
        throw $Message
    }
}

Require-Pattern $windowsSource 'RequestInteraction\(PickInteractionForRegion\(region\), region\)' `
    'Windows clicks must enter the interaction queue.'
Require-Pattern $windowsSource 'queuedInteraction = selectedInteraction' `
    'Windows one-slot interaction queue is missing.'
Require-Pattern $windowsSource 'queuedInteractionReadyAt = now\.AddMilliseconds\(100\)' `
    'Windows neutral handoff delay is missing.'
Require-Pattern $windowsSource 'Let me finish this move\. Yours is next!' `
    'Windows queue dialogue is missing.'

Require-Pattern $macSource 'private var queuedAction:' `
    'macOS one-slot interaction queue is missing.'
Require-Pattern $macSource 'queuedActionReadyAt = now \+ 0\.10' `
    'macOS neutral handoff delay is missing.'
Require-Pattern $macSource 'Let me finish this move\. Yours is next!' `
    'macOS queue dialogue is missing.'

Write-Host 'Interaction queue validation passed for Windows and macOS.'
