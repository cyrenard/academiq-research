$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'src-tauri\binaries'
$targetDll = Join-Path $targetDir 'pdfium.dll'
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('academiq-pdfium-' + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $tmp 'pdfium-win-x64.tgz'
$url = 'https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz'

New-Item -ItemType Directory -Force $targetDir, $tmp | Out-Null

try {
  Invoke-WebRequest -Uri $url -OutFile $archive
  tar -xzf $archive -C $tmp
  $dll = Get-ChildItem -Path $tmp -Recurse -Filter 'pdfium.dll' | Select-Object -First 1
  if (-not $dll) {
    throw 'pdfium.dll was not found inside the downloaded archive.'
  }
  Copy-Item -LiteralPath $dll.FullName -Destination $targetDll -Force
  Get-Item -LiteralPath $targetDll | Select-Object FullName, Length
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
