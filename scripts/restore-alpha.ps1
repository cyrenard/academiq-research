$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$snapshotAsar = Join-Path $workspaceRoot 'backups\alpha-working\app.asar'
$targetAsar = Join-Path $workspaceRoot 'dist\win-unpacked\resources\app.asar'
$exePath = Join-Path $workspaceRoot 'dist\win-unpacked\AcademiQ Research.exe'
$appDir = Join-Path $env:LOCALAPPDATA 'AcademiQ'

function Disable-OverrideItem {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$BaseDisabledName
  )
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $dir = Split-Path -Parent $Path
  $target = Join-Path $dir $BaseDisabledName
  if (Test-Path -LiteralPath $target) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $target = Join-Path $dir ($BaseDisabledName + '.' + $stamp)
  }
  Move-Item -LiteralPath $Path -Destination $target -Force
}

Get-Process | Where-Object { $_.ProcessName -eq 'AcademiQ Research' } | Stop-Process -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $snapshotAsar)) {
  throw "Snapshot not found: $snapshotAsar"
}
if (-not (Test-Path -LiteralPath (Split-Path -Parent $targetAsar))) {
  throw "Target directory not found: $(Split-Path -Parent $targetAsar)"
}

Copy-Item -LiteralPath $snapshotAsar -Destination $targetAsar -Force

Disable-OverrideItem -Path (Join-Path $appDir 'academiq-research.html') -BaseDisabledName 'academiq-research.html.disabled'
Disable-OverrideItem -Path (Join-Path $appDir 'src') -BaseDisabledName 'src.disabled'

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Executable not found: $exePath"
}

Start-Process $exePath
Write-Host 'Alpha restore complete.'
