param(
  [string]$Subject = "CN=AcademiQ Research, O=AcademiQ",
  [string]$FriendlyName = "AcademiQ Code Signing",
  [string]$PfxPath = ""
)

$ErrorActionPreference = "Stop"

$cert = New-SelfSignedCertificate `
  -Subject $Subject `
  -KeyUsage DigitalSignature `
  -FriendlyName $FriendlyName `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(10) `
  -Type CodeSigningCert

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$thumbprintPath = Join-Path $scriptDir ".signing-thumbprint"
Set-Content -LiteralPath $thumbprintPath -Value $cert.Thumbprint -Encoding ascii

Write-Host "Created self-signed code signing certificate:"
Write-Host "  Subject:    $($cert.Subject)"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  Thumbprint saved to $thumbprintPath"
Write-Host "  Certificate stored only in CurrentUser\My. No root trust is installed."

if ($PfxPath) {
  if (-not $env:CERT_PASSWORD) {
    throw "CERT_PASSWORD environment variable is required when exporting a PFX."
  }
  $securePassword = ConvertTo-SecureString -String $env:CERT_PASSWORD -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $securePassword | Out-Null
  Write-Host "PFX exported to $PfxPath"
}
