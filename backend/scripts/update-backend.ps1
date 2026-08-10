# ============================================================================
# LavaSuit - Actualizador del backend (Windows)  [ASCII-only por PS 5.1]
#
# Aplica una nueva version del backend en el PC del cliente SIN comandos
# manuales: detiene PM2, instala dependencias nuevas, respalda la base, aplica
# el schema con `prisma db push` (ADITIVO, nunca destructivo, NUNCA migrate
# reset), regenera el cliente Prisma (con recuperacion de lock de Windows),
# vuelve a levantar el backend con PM2, lo deja en autostart y valida /health.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File update-backend.ps1
#   powershell ... -File update-backend.ps1 -BackendDir "C:\LavaSuit\backend"
#
# Se invoca automaticamente desde el Desktop tras una actualizacion, o a mano.
# Es idempotente: correrlo dos veces no rompe nada.
#
# Garantias:
#   * No usa `prisma migrate reset`.
#   * No borra datos. Todo es aditivo (db push additive).
#   * Si db push falla, queda un log claro y el backend se reinicia igual.
#   * Si generate falla por lock de Windows, detiene node.exe del backend y
#     reintenta.
#   * Crea un backup de la base ANTES de db push si es posible.
#   * Logs en C:\LavaSuit\logs (o <backend>\logs si la primera no existe).
# ============================================================================

[CmdletBinding()]
param(
  [string]$BackendDir = "C:\LavaSuit\backend",
  [int]$Port = 3000,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Continue'
$PrismaCli = 'prisma@5.22.0'
$Pm2Name   = 'lavasuit-backend'

# ---- Logging ---------------------------------------------------------------
$logRoot = 'C:\LavaSuit\logs'
try { if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Force -Path $logRoot | Out-Null } }
catch { $logRoot = Join-Path $BackendDir 'logs'; if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Force -Path $logRoot | Out-Null } }
$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = Join-Path $logRoot "update-$stamp.log"

function Log {
  param([string]$Message, [string]$Level = 'INFO')
  $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

function Run-Native {
  # Ejecuta un comando nativo, registra su salida y devuelve el exit code.
  param([string]$File, [string[]]$CmdArgs, [string]$Cwd = $BackendDir, [string]$Label = $null)
  if (-not $Label) { $Label = "$File $($CmdArgs -join ' ')" }
  Log "-> $Label"
  $prev = Get-Location
  try {
    Set-Location $Cwd
    $out = & $File @CmdArgs 2>&1
    $code = $LASTEXITCODE
    foreach ($l in $out) { Add-Content -Path $logFile -Value ("    " + $l) -Encoding utf8 }
    if ($code -eq 0) { Log "   exit=$code" 'INFO' } else { Log "   exit=$code" 'WARN' }
    return $code
  } catch {
    Log ("   EXCEPTION: " + $_.Exception.Message) 'ERROR'
    return 1
  } finally { Set-Location $prev }
}

$ok = $true
Log "======== LavaSuit update-backend ========"
Log "BackendDir: $BackendDir"
Log "Log file:   $logFile"

if (-not (Test-Path (Join-Path $BackendDir 'server.js'))) {
  Log "No existe server.js en $BackendDir. El backend no esta instalado. Abortando." 'ERROR'
  exit 2
}

# ---- 1) Detener PM2 (si corre) ---------------------------------------------
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
  Run-Native 'pm2' @('stop', $Pm2Name) -Label "pm2 stop $Pm2Name (puede no existir aun)" | Out-Null
} else {
  Log "PM2 no esta en PATH; se intentara instalar/levantar mas adelante." 'WARN'
}

# ---- 2) npm install (dependencias nuevas) ----------------------------------
if (-not $SkipNpmInstall) {
  $code = Run-Native 'npm' @('install', '--omit=dev', '--no-audit', '--no-fund') -Label 'npm install --omit=dev'
  if ($code -ne 0) { Log "npm install devolvio $code (se continua; puede no haber deps nuevas)." 'WARN' }
} else {
  Log "npm install omitido por -SkipNpmInstall" 'WARN'
}

# ---- 3) Backup de la base ANTES de db push ---------------------------------
# Se usa un .js real (scripts/backup-now.js) y NO `node -e` porque PowerShell 5.1
# elimina las comillas dobles al pasar el script inline a node.
Log "Creando backup de la base antes de db push..."
$code = Run-Native 'node' @('scripts\backup-now.js') -Label 'backup (scripts/backup-now.js)'
if ($code -ne 0) { Log "Backup no se pudo crear (se continua; db push es aditivo)." 'WARN' }

# ---- 4) prisma db push (ADITIVO, sin migrate reset) ------------------------
$dbPushOk = $true
$code = Run-Native 'npx' @('--yes', $PrismaCli, 'db', 'push', '--skip-generate') -Label "npx $PrismaCli db push"
if ($code -ne 0) {
  $dbPushOk = $false; $ok = $false
  Log "db push FALLO (exit $code). Revisa este log. No se aplico migrate reset; los datos estan intactos." 'ERROR'
} else {
  Log "db push aplicado correctamente (aditivo)." 'INFO'
}

# ---- 5) prisma generate (con recuperacion de lock Windows) -----------------
$code = Run-Native 'npx' @('--yes', $PrismaCli, 'generate') -Label "npx $PrismaCli generate"
if ($code -ne 0) {
  Log "generate fallo (posible lock de Windows). Deteniendo node.exe del backend y reintentando..." 'WARN'
  if ($pm2) { Run-Native 'pm2' @('stop', $Pm2Name) -Label "pm2 stop $Pm2Name (pre-retry)" | Out-Null }
  try {
    $needle = $BackendDir.ToLower()
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.ToLower().Contains($needle) } |
      ForEach-Object { Log "  taskkill node.exe PID $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch { Log "  no se pudieron enumerar node.exe: $($_.Exception.Message)" 'WARN' }
  Start-Sleep -Seconds 2
  $code = Run-Native 'npx' @('--yes', $PrismaCli, 'generate') -Label "npx $PrismaCli generate (retry)"
  if ($code -ne 0) { $ok = $false; Log "generate fallo tambien en el reintento (exit $code)." 'ERROR' }
}

# ---- 5b) Backfill Pago.cajaSesionId (idempotente, best-effort) --------------
# db push agrega la columna pero NO corre el backfill del migration.sql. Sin el
# backfill, los pagos existentes quedan cajaSesionId=NULL y el arqueo (filtro
# ESTRICTO por sesion) los cuenta como 0 -> afecta una caja ABIERTA al momento
# de actualizar. Este script solo toca filas con cajaSesionId IS NULL; correrlo
# dos veces no cambia nada. Nunca falla la actualizacion (sale con exit 0).
if ($dbPushOk) {
  $code = Run-Native 'node' @('scripts\backfill-pago-caja-sesion.js') -Label 'backfill Pago.cajaSesionId'
  if ($code -ne 0) { Log "backfill Pago.cajaSesionId devolvio $code (se continua; es best-effort)." 'WARN' }
} else {
  Log "Se omite backfill Pago.cajaSesionId porque db push no aplico." 'WARN'
}

# ---- 6) Levantar backend con PM2 -------------------------------------------
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
  Log "Instalando PM2 globalmente (pm2 + pm2-windows-startup)..." 'WARN'
  Run-Native 'npm' @('install', '-g', 'pm2', 'pm2-windows-startup') -Label 'npm i -g pm2 pm2-windows-startup' | Out-Null
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
}
if ($pm2) {
  $restart = Run-Native 'pm2' @('restart', $Pm2Name, '--update-env') -Label "pm2 restart $Pm2Name"
  if ($restart -ne 0) {
    Run-Native 'pm2' @('start', 'server.js', '--name', $Pm2Name, '-f') -Label "pm2 start server.js ($Pm2Name)" | Out-Null
  }
  Run-Native 'pm2' @('save') -Label 'pm2 save' | Out-Null
  $startup = Get-Command pm2-startup -ErrorAction SilentlyContinue
  if ($startup) { Run-Native 'pm2-startup' @('install') -Label 'pm2-startup install (autostart Windows)' | Out-Null }
  else { Log "pm2-startup no disponible; el autostart se configura en la instalacion inicial." 'WARN' }
} else {
  $ok = $false
  Log "No se pudo obtener PM2; el backend no quedo levantado por PM2." 'ERROR'
}

# ---- 7) Validar /health ----------------------------------------------------
$healthOk = $false
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) { $healthOk = $true; Log "/health OK: $($resp.Content)"; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $healthOk) { $ok = $false; Log "/health no respondio en :$Port. Revisa: pm2 logs $Pm2Name" 'ERROR' }

# ---- Resultado -------------------------------------------------------------
if ($ok -and $dbPushOk) {
  Log "======== ACTUALIZACION COMPLETADA OK ========" 'INFO'
  exit 0
} else {
  Log "======== ACTUALIZACION TERMINO CON ADVERTENCIAS/ERRORES (ver log) ========" 'ERROR'
  exit 1
}
