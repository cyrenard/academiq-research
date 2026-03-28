@echo off
set "NODEDIR=C:\Users\iceti\AppData\Local\AcademiQ\node"
set "PATH=%NODEDIR%;%PATH%"

cd /d "C:\Users\iceti\OneDrive\Desktop\AcademiQ-Windows-Kurulum"

echo Building AcademiQ installer...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set CSC_LINK=
set WIN_CSC_LINK=
call node_modules\.bin\electron-builder.cmd --win --x64 --config.win.signAndEditExecutable=false
if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)
echo BUILD OK
