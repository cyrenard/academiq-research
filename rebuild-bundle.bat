@echo off
set "NODEDIR=C:\Users\iceti\AppData\Local\AcademiQ\node"
set "PATH=%NODEDIR%;%PATH%"
cd /d "C:\Users\iceti\AppData\Local\AcademiQ"

echo Rebuilding TipTap bundle...
rem Copy source to AppData where node_modules lives
copy /Y "C:\Users\iceti\OneDrive\Desktop\AcademiQ-Windows-Kurulum\editor-src.js" ".\editor-src.js"
call node_modules\.bin\esbuild.cmd editor-src.js --bundle --format=iife --global-name=TipTap --outfile=tiptap-bundle.js --minify
if errorlevel 1 (echo BUNDLE FAILED & del editor-src.js 2>nul & exit /b 1)
del editor-src.js
echo BUNDLE OK
copy /Y tiptap-bundle.js "C:\Users\iceti\OneDrive\Desktop\AcademiQ-Windows-Kurulum\tiptap-bundle.js"
copy /Y tiptap-bundle.js "C:\Users\iceti\AppData\Local\AcademiQ\src\tiptap-bundle.js"
echo COPY OK
