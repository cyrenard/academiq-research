@echo off
set "NODEDIR=C:\Users\iceti\AppData\Local\AcademiQ\node"
set "PATH=%NODEDIR%;%PATH%"
set "npm_config_node_gyp=%NODEDIR%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js"

cd /d "C:\Users\iceti\OneDrive\Desktop\AcademiQ-Windows-Kurulum"

echo Installing electron-builder...
"%NODEDIR%\npm.cmd" install --save-dev electron-builder@24.13.3 --prefer-offline
if errorlevel 1 (
  echo INSTALL FAILED
  exit /b 1
)
echo INSTALL OK
