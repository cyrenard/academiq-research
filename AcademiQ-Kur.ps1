# AcademiQ Research - Windows Kurulum Scripti
# Yonetici yetkisi gerektirmez, %LOCALAPPDATA% kullanir
$ErrorActionPreference = "Stop"

$AppName = "AcademiQ"
$AppDir = Join-Path $env:LOCALAPPDATA $AppName
$NodeDir = Join-Path $AppDir "node"
$SrcDir = Join-Path $AppDir "src"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) { Write-Host "  [+] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [X] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  AcademiQ Research - Kurulum" -ForegroundColor Yellow
Write-Host "  -----------------------------" -ForegroundColor DarkGray
Write-Host ""

# 1. Dizin yapisi
Write-Step "Dizinler olusturuluyor..."
@($AppDir, $NodeDir, $SrcDir, (Join-Path $AppDir "pdfs")) | ForEach-Object {
    if (!(Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}
Write-Ok "Dizinler hazir: $AppDir"

# 2. Uygulama dosyalari
Write-Step "Uygulama dosyalari kopyalaniyor..."

foreach ($file in @("main.js", "preload.js", "package.json")) {
    $src = Join-Path $ScriptDir $file
    $dst = Join-Path $AppDir $file
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
    } else {
        Write-Err "$file bulunamadi: $src"
        exit 1
    }
}

# HTML dosyasi -> src/index.html
$htmlSrc = Join-Path $ScriptDir "academiq-research.html"
if (!(Test-Path $htmlSrc)) {
    $htmlSrc = Join-Path $ScriptDir "src-index.html"
}
if (Test-Path $htmlSrc) {
    Copy-Item $htmlSrc (Join-Path $SrcDir "index.html") -Force
} else {
    Write-Err "HTML dosyasi bulunamadi!"
    exit 1
}

Write-Ok "Dosyalar kopyalandi"

# 3. Node.js Portable
$nodeExe = Join-Path $NodeDir "node.exe"
$npmCmd = Join-Path $NodeDir "npm.cmd"

if (!(Test-Path $nodeExe)) {
    Write-Step "Node.js portable indiriliyor (~28 MB)..."
    $nodeVer = "v20.11.0"
    $nodeZip = Join-Path $env:TEMP "node-$nodeVer-win-x64.zip"
    $nodeUrl = "https://nodejs.org/dist/$nodeVer/node-$nodeVer-win-x64.zip"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($nodeUrl, $nodeZip)
        Write-Ok "Node.js indirildi"
    } catch {
        Write-Err "Node.js indirilemedi: $_"
        Write-Warn "Manuel indirin: $nodeUrl"
        exit 1
    }

    Write-Step "Arsiv aciliyor..."
    $tempExtract = Join-Path $env:TEMP "node-extract-$(Get-Random)"
    Expand-Archive -Path $nodeZip -DestinationPath $tempExtract -Force

    $innerDir = Get-ChildItem $tempExtract -Directory | Select-Object -First 1
    if ($innerDir) {
        Get-ChildItem $innerDir.FullName | ForEach-Object {
            $dest = Join-Path $NodeDir $_.Name
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
            Move-Item $_.FullName $dest -Force
        }
    }

    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $nodeZip -Force -ErrorAction SilentlyContinue

    if (Test-Path $nodeExe) {
        $ver = & $nodeExe --version
        Write-Ok "Node.js $ver kuruldu"
    } else {
        Write-Err "Node.js kurulumu basarisiz"
        exit 1
    }
} else {
    $ver = & $nodeExe --version
    Write-Ok "Node.js mevcut: $ver"
}

# 4. Electron
$electronDir = Join-Path $AppDir "node_modules\electron"
if (!(Test-Path $electronDir)) {
    Write-Step "Electron kuruluyor (~80 MB, lutfen bekleyin)..."

    $env:PATH = "$NodeDir;$env:PATH"
    Push-Location $AppDir
    try {
        & $npmCmd install --no-fund --no-audit 2>&1 | ForEach-Object {
            if ($_ -match "added|electron") { Write-Host "    $_" -ForegroundColor DarkGray }
        }
        Write-Ok "Electron kuruldu"
    } catch {
        Write-Err "Electron kurulumu basarisiz: $_"
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Ok "Electron mevcut"
}

# 5. Baslatici BAT
$launcherPath = Join-Path $AppDir "AcademiQ.bat"
$electronExe = Join-Path $AppDir "node_modules\.bin\electron.cmd"

$batContent = "@echo off`r`ncd /d `"$AppDir`"`r`nset PATH=$NodeDir;%PATH%`r`nstart `"`" `"$electronExe`" ."
Set-Content $launcherPath -Value $batContent -Encoding ASCII

Write-Ok "Baslatici olusturuldu"

# 6. Masaustu Kisayolu
Write-Step "Masaustu kisayolu olusturuluyor..."
try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktop "AcademiQ Research.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcherPath
    $shortcut.WorkingDirectory = $AppDir
    $shortcut.Description = "AcademiQ Research"
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Ok "Kisayol: $shortcutPath"
} catch {
    Write-Warn "Kisayol olusturulamadi: $_"
}

# 7. Baslat Menusu
try {
    $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    $smShortcut = Join-Path $startMenu "AcademiQ Research.lnk"
    $shell2 = New-Object -ComObject WScript.Shell
    $sc2 = $shell2.CreateShortcut($smShortcut)
    $sc2.TargetPath = $launcherPath
    $sc2.WorkingDirectory = $AppDir
    $sc2.Description = "AcademiQ Research"
    $sc2.WindowStyle = 7
    $sc2.Save()
    Write-Ok "Baslat menusune eklendi"
} catch {
    Write-Warn "Baslat menusu kisayolu olusturulamadi"
}

# Bitti
Write-Host ""
Write-Host "  ========================================" -ForegroundColor Green
Write-Host "  [OK] AcademiQ Research kuruldu!" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Konum  : $AppDir" -ForegroundColor DarkGray
Write-Host "  Boyut  : ~110 MB (Node.js + Electron)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Baslatma:" -ForegroundColor Yellow
Write-Host "    Masaustundeki AcademiQ Research kisayoluna tiklayin" -ForegroundColor White
Write-Host ""
Write-Host "  Sync:" -ForegroundColor Yellow
Write-Host "    Uygulamada Sync butonuna tiklayip bulut klasoru secin" -ForegroundColor White
Write-Host "    (OneDrive, Proton Drive, Google Drive, Dropbox)" -ForegroundColor White
Write-Host ""

$firstRun = !(Test-Path (Join-Path $AppDir "academiq-data.json"))
if ($firstRun) {
    Write-Host "  Uygulama simdi baslatilsin mi? (E/H): " -ForegroundColor Cyan -NoNewline
    $answer = Read-Host
    if ($answer -match "^[eEyY]") {
        Start-Process $launcherPath
    }
}
