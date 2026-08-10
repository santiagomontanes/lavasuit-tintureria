@echo off
REM LavaSuit - Lanzador del actualizador del backend.
REM Ejecuta update-backend.ps1 con la politica de ejecucion en bypass.
REM Pasa cualquier argumento extra (ej: -BackendDir "C:\LavaSuit\backend").
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-backend.ps1" %*
exit /b %ERRORLEVEL%
