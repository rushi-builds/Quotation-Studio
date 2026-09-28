# Copy front-end from repo root into ./public for Workers Assets deploy (Windows).
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $Here "..\..")
$Pub = Join-Path $Here "public"

if (Test-Path $Pub) { Remove-Item -Recurse -Force $Pub }
New-Item -ItemType Directory -Path (Join-Path $Pub "assets") -Force | Out-Null

$files = @(
  "index.html", "dashboard.html", "quotation.html",
  "portal.html", "share.html", "gallery.html"
)
foreach ($f in $files) {
  $src = Join-Path $Root $f
  if (Test-Path $src) { Copy-Item -Force $src $Pub }
}

$assetsSrc = Join-Path $Root "assets"
if (Test-Path $assetsSrc) {
  Copy-Item -Recurse -Force (Join-Path $assetsSrc "*") (Join-Path $Pub "assets")
}

$count = (Get-ChildItem -Path $Pub -Recurse -File | Measure-Object).Count
Write-Host "Synced public/ from repo root ($count files)"
