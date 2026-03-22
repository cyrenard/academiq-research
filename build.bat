@echo off
cd /d "%~dp0"
set PATH=C:\Users\iceti\AppData\Local\AcademiQ\node;%PATH%
echo [1/2] Installing electron-builder...
call npm install --save-dev electron-builder@24.13.3 2>&1
if errorlevel 1 (
  echo npm install failed!
  pause
  exit /b 1
)
echo.
echo [2/2] Building installer...
call npx electron-builder --win --x64 2>&1
if errorlevel 1 (
  echo Build failed!
  pause
  exit /b 1
)
echo.
echo Done! Installer is in the dist\ folder.
pause
