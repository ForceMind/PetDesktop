@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-ai-game-demo.ps1" %*
if errorlevel 1 (
  echo.
  echo Coco AI Games failed to start.
  pause
  exit /b 1
)
endlocal
