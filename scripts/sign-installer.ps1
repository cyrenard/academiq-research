param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [string]$Thumbprint = "",
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

function Find-SignTool {
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  if (Test-Path $kitsRoot) {
    $tool = Get-ChildItem $kitsRoot -Recurse -Filter signtool.exe |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($tool) { return $tool.FullName }
  }
  throw "signtool.exe was not found. Install Windows 10/11 SDK."
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$thumbprintPath = Join-Path $scriptDir ".signing-thumbprint"
if (-not $Thumbprint) {
  $Thumbprint = $env:SIGNING_CERT_THUMBPRINT
}
if (-not $Thumbprint -and (Test-Path -LiteralPath $thumbprintPath)) {
  $Thumbprint = (Get-Content -LiteralPath $thumbprintPath -Raw).Trim()
}
if (-not $Thumbprint) {
  throw "No signing certificate thumbprint. Run scripts/generate-signing-cert.ps1 first."
}

$signtool = Find-SignTool
& $signtool sign /fd SHA256 /td SHA256 /tr $TimestampUrl /sha1 $Thumbprint $InstallerPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool sign failed with exit code $LASTEXITCODE"
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$verifyOutput = & $signtool verify /v $InstallerPath 2>&1
$verifyCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$verifyText = ($verifyOutput | Out-String)
Write-Host $verifyText
if ($verifyCode -ne 0 -and $verifyText -notmatch "Signing Certificate Chain:") {
  throw "signtool signature presence check failed with exit code $verifyCode"
}

Write-Host "Signed and signature presence checked $InstallerPath"
