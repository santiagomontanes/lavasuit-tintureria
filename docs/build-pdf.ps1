# Regenera INSTALLATION_GUIDE.pdf a partir de INSTALLATION_GUIDE.md
# Uso:  cd docs ; .\build-pdf.ps1
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir "build-pdf.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
