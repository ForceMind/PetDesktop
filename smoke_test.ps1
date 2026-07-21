param(
    [string]$DiagnosticFrame
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = (Get-ChildItem -LiteralPath (Join-Path $projectDir 'dist') -Filter '*.exe' | Select-Object -First 1).FullName
if (-not $exe) { throw 'Build the application before running the smoke test.' }

$processName = [System.IO.Path]::GetFileNameWithoutExtension($exe)
Get-Process -Name $processName -ErrorAction SilentlyContinue | Stop-Process -Force
if ($DiagnosticFrame) {
    $env:COCO_PET_DIAGNOSTIC_FRAME = $DiagnosticFrame
}
else {
    Remove-Item Env:COCO_PET_DIAGNOSTIC_FRAME -ErrorAction SilentlyContinue
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CocoSmokeNative {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr Find(uint pid) {
    IntPtr result = IntPtr.Zero;
    EnumWindows(delegate(IntPtr handle, IntPtr state) {
      uint found;
      GetWindowThreadProcessId(handle, out found);
      if (found == pid && IsWindowVisible(handle)) { result = handle; return false; }
      return true;
    }, IntPtr.Zero);
    return result;
  }
  public static int VisibleCount(uint pid) {
    int count = 0;
    EnumWindows(delegate(IntPtr handle, IntPtr state) {
      uint found;
      GetWindowThreadProcessId(handle, out found);
      if (found == pid && IsWindowVisible(handle)) count++;
      return true;
    }, IntPtr.Zero);
    return count;
  }
}
'@

$petProcess = Start-Process -FilePath $exe -PassThru
try {
    $handle = [IntPtr]::Zero
    $initial = New-Object CocoSmokeNative+RECT
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 100
        $handle = [CocoSmokeNative]::Find([uint32]$petProcess.Id)
        if ($handle -ne [IntPtr]::Zero) {
            [CocoSmokeNative]::GetWindowRect($handle, [ref]$initial) | Out-Null
            if (($initial.Right - $initial.Left) -ne 150 -or
                ($initial.Bottom - $initial.Top) -ne 150) { break }
        }
    }
    if ($handle -eq [IntPtr]::Zero) { throw 'The pet window did not appear.' }

    # Let the startup greeting close so the baseline is the true idle window.
    Start-Sleep -Milliseconds 3850
    $handle = [CocoSmokeNative]::Find([uint32]$petProcess.Id)
    [CocoSmokeNative]::GetWindowRect($handle, [ref]$initial) | Out-Null
    $clientWidth = $initial.Right - $initial.Left
    $clientHeight = $initial.Bottom - $initial.Top
    $clickX = [int]($clientWidth * 0.65)
    $clickY = [int]($clientHeight * 0.70)
    $clickPoint = [IntPtr](($clickY -shl 16) -bor ($clickX -band 0xffff))
    $actionsTriggered = 0

    for ($index = 0; $index -lt 32; $index++) {
        [CocoSmokeNative]::PostMessage($handle, 0x0201, [IntPtr]1, $clickPoint) | Out-Null
        [CocoSmokeNative]::PostMessage($handle, 0x0202, [IntPtr]0, $clickPoint) | Out-Null
        Start-Sleep -Milliseconds 150
        $petProcess.Refresh()
        if ($petProcess.HasExited -or -not $petProcess.Responding) {
            throw "The application stopped responding at action $($index + 1)."
        }
        $actionsTriggered++
    }

    Start-Sleep -Milliseconds 2850
    $idleAgain = New-Object CocoSmokeNative+RECT
    [CocoSmokeNative]::GetWindowRect($handle, [ref]$idleAgain) | Out-Null
    $returnedToIdle =
        (($idleAgain.Right - $idleAgain.Left) -eq ($initial.Right - $initial.Left)) -and
        (($idleAgain.Bottom - $idleAgain.Top) -eq ($initial.Bottom - $initial.Top))

    $screenPoint = [IntPtr]((700 -shl 16) -bor 1350)
    [CocoSmokeNative]::PostMessage($handle, 0x020A, [IntPtr](120 -shl 16), $screenPoint) | Out-Null
    Start-Sleep -Milliseconds 250
    $grown = New-Object CocoSmokeNative+RECT
    [CocoSmokeNative]::GetWindowRect($handle, [ref]$grown) | Out-Null

    [CocoSmokeNative]::PostMessage($handle, 0x020A, [IntPtr](-120 -shl 16), $screenPoint) | Out-Null
    Start-Sleep -Milliseconds 250
    $restored = New-Object CocoSmokeNative+RECT
    [CocoSmokeNative]::GetWindowRect($handle, [ref]$restored) | Out-Null

    [CocoSmokeNative]::PostMessage($handle, 0x0204, [IntPtr]2, $clickPoint) | Out-Null
    [CocoSmokeNative]::PostMessage($handle, 0x0205, [IntPtr]0, $clickPoint) | Out-Null
    Start-Sleep -Milliseconds 300
    $menuWindows = [CocoSmokeNative]::VisibleCount([uint32]$petProcess.Id)

    [CocoSmokeNative]::PostMessage($handle, 0x0010, [IntPtr]0, [IntPtr]0) | Out-Null
    $petProcess.WaitForExit(3000) | Out-Null

    [PSCustomObject]@{
        ActionsTriggered = $actionsTriggered
        AllActionsStable = ($actionsTriggered -eq 32)
        ReturnedToIdle = $returnedToIdle
        InitialSize = "$($initial.Right - $initial.Left)x$($initial.Bottom - $initial.Top)"
        IdleAgainSize = "$($idleAgain.Right - $idleAgain.Left)x$($idleAgain.Bottom - $idleAgain.Top)"
        WheelUpSize = "$($grown.Right - $grown.Left)x$($grown.Bottom - $grown.Top)"
        WheelRestoreSize = "$($restored.Right - $restored.Left)x$($restored.Bottom - $restored.Top)"
        VisibleWindowsWithMenu = $menuWindows
        GracefulExit = $petProcess.HasExited
        ExitCode = $(if ($petProcess.HasExited) { $petProcess.ExitCode } else { $null })
    }
}
finally {
    if (-not $petProcess.HasExited) { Stop-Process -Id $petProcess.Id -Force }
}
