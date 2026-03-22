@echo off
title AcademiQ Research - Kurulum
echo.
echo  ========================================
echo       AcademiQ Research Kurulum
echo       Akademik Yazim ve Arastirma
echo  ========================================
echo.
echo  Kurulum basliyor... (Yonetici yetkisi gerekmez)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AcademiQ-Kur.ps1"

if errorlevel 1 (
    echo.
    echo  [!] Kurulum basarisiz oldu.
    echo  PowerShell scripti calistirilamadi.
    echo.
    pause
) else (
    echo.
    echo  Kurulum tamamlandi!
    echo.
    timeout /t 3
)
