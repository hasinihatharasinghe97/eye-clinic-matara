@echo off
title Eye Clinic Matara
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js 22+ from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

echo Project folder: %cd%
echo.
echo Requires MySQL 8+ running locally.
echo Put your MySQL password in the .env file ^(MYSQL_PASSWORD=...^).
echo.

if not exist ".env" (
  echo Creating .env from .env.example ...
  copy /Y ".env.example" ".env" >nul
  echo.
  echo IMPORTANT: Open .env and set MYSQL_PASSWORD to your MySQL root password, then run again.
  notepad ".env"
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing root dependencies...
  call npm install
)
if not exist "server\node_modules" (
  echo Installing server dependencies...
  call npm install --prefix server
)
if not exist "client\node_modules" (
  echo Installing client dependencies...
  call npm install --prefix client
)

echo.
echo Stopping any previous Eye Clinic servers...
powershell -NoProfile -Command ^
  "$root = (Resolve-Path '.').Path; " ^
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | " ^
  "Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $root + '*') } | " ^
  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " ^
  "foreach ($port in 3001,5173) { " ^
  "  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | " ^
  "  Select-Object -ExpandProperty OwningProcess -Unique | " ^
  "  Where-Object { $_ -gt 0 } | " ^
  "  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } " ^
  "}"
timeout /t 2 /nobreak >nul

echo Starting Eye Clinic system...
echo Open http://localhost:5173 in your browser
echo Login password is set under Backup ^& Settings ^(default on first install: clinic123^)
echo.
echo Press Ctrl+C in this window to stop the system.
echo.
call npm run dev
pause
