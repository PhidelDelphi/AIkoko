@echo off
chcp 65001 >nul 2>&1
title AFR PowerShell Server
echo.
echo   AFR PowerShell Server starting...
echo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo Server stopped.
pause
